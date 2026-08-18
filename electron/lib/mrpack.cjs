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

function parseIndex(zipPath) {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry('modrinth.index.json');
    if (!entry) throw new Error('Geçerli bir .mrpack değil (modrinth.index.json yok)');
    const index = JSON.parse(entry.getData().toString('utf8'));
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
    onProgress({ percent: 0, message: `"${name}" profili oluşturuluyor...` });
    const instance = instances.create({ name, mcVersion, loader, origin: 'mrpack' });
    const instanceDir = getInstanceDir(instance.id);

    // Dosyaları indir (yalnızca istemci tarafı gerekli olanlar)
    const files = (index.files || []).filter((f) => f.env?.client !== 'unsupported');
    const managedFiles = [];
    let done = 0;
    for (const file of files) {
        const url = file.downloads?.[0];
        if (!url) continue;
        const dest = safeJoin(instanceDir, file.path);
        onProgress({
            percent: Math.floor((done / Math.max(files.length, 1)) * 80),
            message: `${path.basename(file.path)} indiriliyor (${done + 1}/${files.length})...`,
        });
        await downloadFile(url, dest, { sha1: file.hashes?.sha1 });
        managedFiles.push(file.path.replace(/\\/g, '/'));
        done++;
    }

    // overrides/ ve client-overrides/ içeriğini profile kopyala
    onProgress({ percent: 85, message: 'Yapılandırma dosyaları kopyalanıyor...' });
    for (const overrideDir of ['overrides/', 'client-overrides/']) {
        for (const entry of zip.getEntries()) {
            if (entry.isDirectory || !entry.entryName.startsWith(overrideDir)) continue;
            const rel = entry.entryName.slice(overrideDir.length);
            if (!rel) continue;
            const dest = safeJoin(instanceDir, rel);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, entry.getData());
        }
    }

    instances.update(instance.id, { managedFiles });
    onProgress({ percent: 100, message: `"${name}" hazır!` });
    log.info(`[MRPACK] İçe aktarıldı: ${name} (${files.length} dosya, ${loader} ${mcVersion})`);
    return { instanceId: instance.id, name, mcVersion, loader, fileCount: files.length };
}

module.exports = { importMrpack, parseIndex };
