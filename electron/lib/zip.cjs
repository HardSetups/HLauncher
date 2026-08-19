// ZIP işlemleri — saf JS (adm-zip). PowerShell bağımlılığı yok.
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/** Arşivin tamamını hedef klasöre çıkarır (zip-slip korumalı). */
function extractAll(zipPath, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    const zip = new AdmZip(zipPath);
    const base = path.resolve(destDir);
    for (const entry of zip.getEntries()) {
        const target = path.resolve(destDir, entry.entryName);
        if (target !== base && !target.startsWith(base + path.sep)) {
            throw new Error(`Güvensiz arşiv girdisi engellendi: ${entry.entryName}`);
        }
    }
    zip.extractAllTo(destDir, true);
}

/** Ada göre (klasörden bağımsız) tek bir girdiyi hedef dosyaya çıkarır. */
function extractEntry(zipPath, entryName, destPath) {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntries().find((e) => path.basename(e.entryName) === entryName);
    if (!entry) throw new Error(`Arşivde bulunamadı: ${entryName}`);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, entry.getData());
}

/** Girdinin metin içeriğini döndürür; yoksa null. */
function readEntryText(zipPath, entryName) {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntries().find((e) => path.basename(e.entryName) === entryName);
    return entry ? entry.getData().toString('utf8') : null;
}

/** Arşivin açılabilir olduğunu doğrular (bozuk indirme kontrolü). */
function isValidZip(zipPath) {
    try { new AdmZip(zipPath).getEntries(); return true; }
    catch { return false; }
}

module.exports = { extractAll, extractEntry, readEntryText, isValidZip };
