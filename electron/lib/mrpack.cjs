// Modrinth modpack (.mrpack) içe aktarma: yeni profil oluşturur, dosyaları
// hash doğrulamalı indirir, overrides içeriğini profile kopyalar.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { downloadFile } = require('./download.cjs');
const { getInstanceDir } = require('./paths.cjs');
const instances = require('./instances.cjs');
const log = require('./logger.cjs');

const LOADER_KEYS = {
    'fabric-loader': 'fabric',
    'quilt-loader': 'quilt',
    'forge': 'forge',
    'neoforge': 'neoforge',
};

function safeJoin(baseDir, relPath) {
    const target = path.join(baseDir, relPath);
    const resolved = path.resolve(target);
    if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) {
        throw new Error(`Güvensiz dosya yolu engellendi: ${relPath}`);
    }
    return target;
}

// Modrinth modpack biçiminin izin verdiği indirme adresleri (yalnızca https)
const MRPACK_HOSTS = new Set(['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com']);
const MAX_OVERRIDE_BYTES = 1024 * 1024 * 1024; // overrides toplamı
const MAX_OVERRIDE_ENTRIES = 20000;

function allowedMrpackUrl(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'https:' && MRPACK_HOSTS.has(u.hostname) && !u.username && !u.password;
    } catch { return false; }
}

/** Beyana güvenilmeyen açma: 0 beyan edip şişen üye (zip bombası) ya da beyanla uyuşmayan boyut reddedilir. */
function boundedData(entry, max) {
    const declared = entry.header.size;
    if ((declared === 0 && entry.header.compressedSize > 2) || declared > max) throw new Error('Modpack arşivinde boyutu tutarsız bir dosya var');
    const data = entry.getData();
    if (data.length !== declared) throw new Error('Modpack arşivinde boyutu tutarsız bir dosya var');
    return data;
}

function parseIndex(zipPath) {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry('modrinth.index.json');
    if (!entry) throw new Error('Geçerli bir .mrpack değil (modrinth.index.json yok)');
    const index = JSON.parse(boundedData(entry, 16 * 1024 * 1024).toString('utf8'));
    if (index.formatVersion !== 1) throw new Error(`Desteklenmeyen mrpack formatı: ${index.formatVersion}`);
    return { zip, index };
}

async function importMrpack(mrpackPath, onProgress = () => {}) {
    const { zip, index } = parseIndex(mrpackPath);

    const mcVersion = index.dependencies?.minecraft;
    if (!mcVersion) throw new Error('Modpack Minecraft sürümü belirtmiyor');

    let loader = 'release';
    for (const [key, value] of Object.entries(LOADER_KEYS)) {
        if (index.dependencies?.[key]) { loader = value; break; }
    }

    const name = index.name || path.basename(mrpackPath, '.mrpack');
    onProgress({ percent: 0, key: 'be.creatingProfile', params: { name } });
    const instance = instances.create({ name, mcVersion, loader, origin: 'mrpack' });
    const instanceDir = getInstanceDir(instance.id);

    // Dosyaları indir (yalnızca istemci tarafı gerekli olanlar)
    const files = (index.files || []).filter((f) => f.env?.client !== 'unsupported');
    const managedFiles = [];
    let done = 0;
    for (const file of files) {
        // Biçimin izin verdiği ilk https adresi; sha1 zorunlu (doğrulamasız dosya profile girmez)
        const url = (Array.isArray(file.downloads) ? file.downloads : []).find(allowedMrpackUrl);
        if (!url) throw new Error(`Modpack izin verilmeyen bir adresten dosya istiyor: ${path.basename(String(file.path || ''))}`);
        if (!/^[a-f0-9]{40}$/i.test(String(file.hashes?.sha1 || ''))) throw new Error(`Modpack dosyasında doğrulama özeti eksik: ${path.basename(String(file.path || ''))}`);
        const dest = safeJoin(instanceDir, file.path);
        onProgress({
            percent: Math.floor((done / Math.max(files.length, 1)) * 80),
            key: 'be.downloadingFileN',
            params: { file: path.basename(file.path), i: done + 1, n: files.length },
        });
        await downloadFile(url, dest, { sha1: file.hashes?.sha1 });
        managedFiles.push(file.path.replace(/\\/g, '/'));
        done++;
    }

    // overrides/ ve client-overrides/ içeriğini profile kopyala
    onProgress({ percent: 85, key: 'be.copyingConfigs' });
    let overrideBytes = 0;
    let overrideCount = 0;
    for (const overrideDir of ['overrides/', 'client-overrides/']) {
        for (const entry of zip.getEntries()) {
            if (entry.isDirectory || !entry.entryName.startsWith(overrideDir)) continue;
            const rel = entry.entryName.slice(overrideDir.length);
            if (!rel) continue;
            if (++overrideCount > MAX_OVERRIDE_ENTRIES) throw new Error('Modpack çok fazla dosya içeriyor');
            const data = boundedData(entry, MAX_OVERRIDE_BYTES - overrideBytes);
            overrideBytes += data.length;
            const dest = safeJoin(instanceDir, rel);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, data);
        }
    }

    instances.update(instance.id, { managedFiles });
    onProgress({ percent: 100, key: 'be.ready', params: { name } });
    log.info(`[MRPACK] İçe aktarıldı: ${name} (${files.length} dosya, ${loader} ${mcVersion})`);
    return { instanceId: instance.id, name, mcVersion, loader, fileCount: files.length };
}

module.exports = { importMrpack, parseIndex };
