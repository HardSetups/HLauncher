// Lisans ayarı (sözleşme §7.5): modun kendi ayar dosyası (ör. config/hardsetups/ayarlar.json)
// düz bir {"anahtar": "değer"} haritasıdır; HUD, tasarım ve arena ayarları da oradadır.
// Kurallar:
// - BİRLEŞTİRME, ezme değil: yalnızca `entries` alanları eklenir/güncellenir, gerisi korunur
// - Değerler birebir yazılır (anahtara biçim dönüşümü yok)
// - Atomik: yedek → geçici dosya → JSON olarak geri okuyup doğrula → rename; hata → yedeğe dön
// - Bozuk dosya `<ad>.bozuk-<zaman>` olarak saklanır, yalnızca entries ile yeni dosya yazılır
// - İçinde lisans anahtarı var: değerler günlüğe/hata mesajına ASLA girmez
// Oyun açıkken çağrılmamalı (mod dosyayı bellekten yeniden yazabilir) — çağıran denetler.
const fs = require('fs');
const { safeJoin } = require('../lib/safepath.cjs');

const MAX_ENTRIES = 50;
const MAX_KEY = 128;
const MAX_VALUE = 1024;

function validate(licenseConfig) {
    const fail = (why) => { throw Object.assign(new Error(`Geçersiz lisans ayarı: ${why}`), { code: 'EBADLICENSECONFIG' }); };
    if (!licenseConfig || typeof licenseConfig !== 'object') fail('nesne değil');
    if (licenseConfig.format !== 'flat-map') fail(`desteklenmeyen biçim (${String(licenseConfig.format).slice(0, 20)})`);
    const entries = licenseConfig.entries;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) fail('entries yok');
    const keys = Object.keys(entries);
    if (!keys.length || keys.length > MAX_ENTRIES) fail('entries sayısı');
    for (const k of keys) {
        if (!k || k.length > MAX_KEY || k === '__proto__' || k === 'constructor' || k === 'prototype') fail('anahtar adı');
        if (typeof entries[k] !== 'string' || entries[k].length > MAX_VALUE) fail(`"${k}" değeri metin değil`);
    }
    return entries;
}

function readExisting(file) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (err) {
        if (err.code === 'ENOENT') return { data: {}, corrupt: false, existed: false };
        throw err;
    }
    try {
        const parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); // BOM'lu dosyalar da okunur
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { data: parsed, corrupt: false, existed: true };
    } catch { /* bozuk */ }
    return { data: {}, corrupt: true, existed: true };
}

const stamp = (now) => new Date(now).toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');

/**
 * @param {string} instanceDir örnek klasörü (kök)
 * @param {{path: string, format: string, schemaVersion?: number, entries: Object<string,string>}} licenseConfig
 * @returns {{changed: boolean, corruptBackup: string|null}} (değer içermez)
 */
function mergeLicenseConfig(instanceDir, licenseConfig, { now = Date.now() } = {}) {
    const entries = validate(licenseConfig);
    const file = safeJoin(instanceDir, licenseConfig.path);
    fs.mkdirSync(require('path').dirname(file), { recursive: true });

    const current = readExisting(file);
    let corruptBackup = null;
    if (current.corrupt) {
        corruptBackup = `${file}.bozuk-${stamp(now)}`;
        fs.renameSync(file, corruptBackup);
    }

    const merged = Object.assign(Object.create(null), current.data);
    let changed = current.corrupt || !current.existed;
    for (const [k, v] of Object.entries(entries)) {
        if (merged[k] !== v) { merged[k] = v; changed = true; }
    }
    if (!changed) return { changed: false, corruptBackup };

    const backup = `${file}.yedek`;
    const tmp = `${file}.tmp`;
    const hadFile = !current.corrupt && current.existed;
    if (hadFile) fs.copyFileSync(file, backup);
    try {
        fs.writeFileSync(tmp, `${JSON.stringify({ ...merged }, null, 2)}\n`, 'utf8');
        const check = JSON.parse(fs.readFileSync(tmp, 'utf8'));
        for (const [k, v] of Object.entries(entries)) {
            if (check[k] !== v) throw new Error('geri okuma doğrulaması başarısız');
        }
        fs.renameSync(tmp, file);
        if (hadFile) fs.rmSync(backup, { force: true });
        return { changed: true, corruptBackup };
    } catch (err) {
        try { fs.rmSync(tmp, { force: true }); } catch { /* yoksa geç */ }
        if (hadFile) {
            try { fs.copyFileSync(backup, file); fs.rmSync(backup, { force: true }); } catch { /* yedek kalır */ }
        }
        // Mesajda değer yok; yalnızca neyin başarısız olduğu
        throw Object.assign(new Error(`Lisans ayarı yazılamadı: ${err.code || err.message}`), { code: 'ELICENSEWRITE' });
    }
}

module.exports = { mergeLicenseConfig, validateLicenseConfig: validate };
