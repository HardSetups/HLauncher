// Skin yönetimi:
// - Yerel skin kütüphanesi (%APPDATA%\.hlauncher\skins): PNG + index.json
// - Microsoft hesabı için Minecraft Services API: profil (skin/pelerin),
//   skin yükleme, varsayılana dönme, pelerin seçme.
// Çevrimdışı hesaplarda skin oyunda görünmez; kütüphane yine kullanılabilir.
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { httpGetStream, httpGetJson, USER_AGENT } = require('./http.cjs');
const { getRootPath } = require('./paths.cjs');
const log = require('./logger.cjs');

const API = 'https://api.minecraftservices.com/minecraft/profile';
const MAX_SKIN_BYTES = 256 * 1024;
const VARIANTS = ['classic', 'slim'];

// ─── PNG doğrulama (saf, testli) ─────────────────────────────────────────

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Skin PNG'si mi? 64×64 (modern) veya 64×32 (eski) olmalı. */
function validateSkinPng(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 24) throw new Error('Dosya okunamadı');
    if (buf.length > MAX_SKIN_BYTES) throw new Error('Skin dosyası çok büyük (en fazla 256 KB)');
    if (!buf.subarray(0, 8).equals(PNG_SIG) || buf.toString('ascii', 12, 16) !== 'IHDR') {
        throw new Error('Skin bir PNG dosyası olmalı');
    }
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width !== 64 || (height !== 64 && height !== 32)) {
        throw new Error(`Skin 64×64 veya 64×32 piksel olmalı (bu dosya ${width}×${height})`);
    }
    return { width, height };
}

function sanitizeName(name, fallback = 'Skin') {
    // Kontrol karakterleri ve dosya adında sorun çıkaran işaretler atılır
    const clean = [...String(name || '')].filter((ch) => ch.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(ch)).join('').trim().slice(0, 32);
    return clean || fallback;
}

// ─── Kütüphane ───────────────────────────────────────────────────────────

function libDir() {
    const dir = path.join(getRootPath(), 'skins');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function readIndex() {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(libDir(), 'index.json'), 'utf8'));
        return Array.isArray(data.skins) ? data : { skins: [] };
    } catch { return { skins: [] }; }
}

function writeIndex(data) {
    const file = path.join(libDir(), 'index.json');
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(`${file}.tmp`, file);
}

function skinPath(id) {
    if (!/^[a-f0-9]{16}$/.test(String(id))) throw new Error('Geçersiz skin kimliği');
    return path.join(libDir(), `${id}.png`);
}

function toDataUrl(buf) {
    return `data:image/png;base64,${buf.toString('base64')}`;
}

function listLibrary() {
    return readIndex().skins
        .map((s) => {
            try { return { ...s, dataUrl: toDataUrl(fs.readFileSync(skinPath(s.id))) }; } catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => b.addedAt - a.addedAt);
}

function addToLibrary(buf, { name, variant = 'classic', source = 'file' }) {
    validateSkinPng(buf);
    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    const index = readIndex();
    // Aynı görsel zaten varsa kopya oluşturma
    const existing = index.skins.find((s) => s.hash === hash);
    if (existing) return existing;
    const entry = {
        id: crypto.randomBytes(8).toString('hex'),
        name: sanitizeName(name),
        variant: VARIANTS.includes(variant) ? variant : 'classic',
        source,
        hash,
        addedAt: Date.now(),
    };
    fs.writeFileSync(skinPath(entry.id), buf);
    index.skins.push(entry);
    writeIndex(index);
    log.info(`[SKINS] Kütüphaneye eklendi: ${entry.name} (${source})`);
    return entry;
}

function importFile(filePath) {
    const buf = fs.readFileSync(filePath);
    return addToLibrary(buf, { name: path.basename(filePath, path.extname(filePath)), source: 'file' });
}

function updateEntry(id, patch = {}) {
    const index = readIndex();
    const entry = index.skins.find((s) => s.id === id);
    if (!entry) throw new Error('Skin bulunamadı');
    if (typeof patch.name === 'string') entry.name = sanitizeName(patch.name, entry.name);
    if (VARIANTS.includes(patch.variant)) entry.variant = patch.variant;
    writeIndex(index);
    return entry;
}

function removeEntry(id) {
    const index = readIndex();
    index.skins = index.skins.filter((s) => s.id !== id);
    writeIndex(index);
    try { fs.unlinkSync(skinPath(id)); } catch { /* zaten yok */ }
    return true;
}

// ─── Ağ yardımcıları ─────────────────────────────────────────────────────

async function getBuffer(url, max = MAX_SKIN_BYTES) {
    // textures.minecraft.net http adresi döndürür; https de çalışır
    const res = await httpGetStream(String(url).replace(/^http:\/\//, 'https://'));
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
            size += c.length;
            if (size > max) { res.destroy(); reject(new Error('Dosya çok büyük')); return; }
            chunks.push(c);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
    });
}

/** Minecraft Services isteği. body: Buffer | object(JSON) | undefined */
function apiRequest(method, url, token, { body, contentType } = {}) {
    return new Promise((resolve, reject) => {
        let payload = null;
        const headers = { 'User-Agent': USER_AGENT, Authorization: `Bearer ${token}`, Accept: 'application/json' };
        if (Buffer.isBuffer(body)) {
            payload = body;
            headers['Content-Type'] = contentType;
        } else if (body !== undefined) {
            payload = Buffer.from(JSON.stringify(body));
            headers['Content-Type'] = 'application/json';
        }
        if (payload) headers['Content-Length'] = payload.length;
        const req = https.request(url, { method, headers }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode === 401) return reject(new Error('Microsoft oturumu geçersiz; çıkış yapıp tekrar giriş yap.'));
                if (res.statusCode === 429) return reject(new Error('Çok fazla deneme; biraz bekleyip tekrar dene.'));
                if (res.statusCode >= 400) {
                    let msg = `HTTP ${res.statusCode}`;
                    try { msg = JSON.parse(text).errorMessage || msg; } catch { /* düz metin */ }
                    return reject(new Error(`Skin sunucusu isteği reddetti: ${msg}`));
                }
                if (!text) return resolve(null);
                try { resolve(JSON.parse(text)); } catch { resolve(null); }
            });
            res.on('error', reject);
        });
        req.setTimeout(20000, () => req.destroy(new Error('Skin sunucusu zaman aşımı')));
        req.on('error', reject);
        req.end(payload || undefined);
    });
}

function multipartSkin(buf, variant) {
    const boundary = `----HLauncher${crypto.randomBytes(8).toString('hex')}`;
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${variant}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\nContent-Type: image/png\r\n\r\n`),
        buf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

// ─── Microsoft profili ───────────────────────────────────────────────────

/** Profil yanıtını arayüz biçimine çevirir; aktif skin/pelerin görselleri data URL olarak gelir. */
async function describeProfile(profile) {
    const skins = profile?.skins || [];
    const capes = profile?.capes || [];
    const activeSkin = skins.find((s) => s.state === 'ACTIVE') || null;
    const activeCape = capes.find((c) => c.state === 'ACTIVE') || null;
    // Tarayıcı CORS nedeniyle textures.minecraft.net'i doğrudan okuyamaz → ana süreç indirir
    const fetchData = async (url) => { try { return toDataUrl(await getBuffer(url)); } catch { return null; } };
    const capeImages = await Promise.all(capes.map((c) => fetchData(c.url)));
    return {
        name: profile?.name,
        skin: activeSkin ? {
            variant: String(activeSkin.variant || 'CLASSIC').toLowerCase() === 'slim' ? 'slim' : 'classic',
            dataUrl: await fetchData(activeSkin.url),
            isDefault: !!activeSkin.alias, // STEVE/ALEX gibi varsayılanların alias'ı olur
        } : null,
        capes: capes.map((c, i) => ({ id: c.id, alias: c.alias, active: c.state === 'ACTIVE', dataUrl: capeImages[i] })),
        activeCapeId: activeCape?.id || null,
    };
}

async function getProfile(token) {
    return describeProfile(await apiRequest('GET', API, token));
}

async function applySkin(token, id) {
    const entry = readIndex().skins.find((s) => s.id === id);
    if (!entry) throw new Error('Skin bulunamadı');
    const buf = fs.readFileSync(skinPath(id));
    validateSkinPng(buf);
    const { body, contentType } = multipartSkin(buf, entry.variant);
    const profile = await apiRequest('POST', `${API}/skins`, token, { body, contentType });
    log.info(`[SKINS] Skin uygulandı: ${entry.name} (${entry.variant})`);
    return describeProfile(profile || await apiRequest('GET', API, token));
}

async function resetSkin(token) {
    const profile = await apiRequest('DELETE', `${API}/skins/active`, token);
    return describeProfile(profile || await apiRequest('GET', API, token));
}

async function setCape(token, capeId) {
    const profile = capeId
        ? await apiRequest('PUT', `${API}/capes/active`, token, { body: { capeId: String(capeId) } })
        : await apiRequest('DELETE', `${API}/capes/active`, token);
    return describeProfile(profile || await apiRequest('GET', API, token));
}

/** Aktif Microsoft skinini kütüphaneye kaydeder. */
async function saveCurrent(token, name) {
    const profile = await apiRequest('GET', API, token);
    const active = (profile?.skins || []).find((s) => s.state === 'ACTIVE');
    if (!active) throw new Error('Aktif skin bulunamadı');
    const buf = await getBuffer(active.url);
    const variant = String(active.variant || '').toLowerCase() === 'slim' ? 'slim' : 'classic';
    return addToLibrary(buf, { name: name || profile.name, variant, source: 'account' });
}

/** Herhangi bir oyuncunun skinini kullanıcı adından kütüphaneye ekler (Mojang herkese açık API). */
async function importFromUsername(username) {
    const name = String(username || '').trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('Geçerli bir Minecraft kullanıcı adı gir (3-16 karakter)');
    let uuid;
    try {
        uuid = (await httpGetJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`)).id;
    } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 204) throw new Error(`"${name}" adında bir Minecraft hesabı yok`);
        throw err;
    }
    if (!uuid) throw new Error(`"${name}" adında bir Minecraft hesabı yok`);
    const profile = await httpGetJson(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
    const prop = (profile.properties || []).find((p) => p.name === 'textures');
    const textures = prop ? JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8')).textures : null;
    if (!textures?.SKIN?.url) throw new Error(`"${name}" varsayılan skini kullanıyor`);
    const buf = await getBuffer(textures.SKIN.url);
    const variant = textures.SKIN.metadata?.model === 'slim' ? 'slim' : 'classic';
    return addToLibrary(buf, { name: profile.name || name, variant, source: 'username' });
}

module.exports = {
    validateSkinPng, sanitizeName,
    listLibrary, addToLibrary, importFile, updateEntry, removeEntry,
    getProfile, applySkin, resetSkin, setCape, saveCurrent, importFromUsername,
};
