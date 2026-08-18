// Java tespiti ve gereken sürümün (8/17/21) otomatik kurulumu.
// İndirme Adoptium API'sinden SHA-256 doğrulamalı yapılır.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { httpGetJson } = require('./http.cjs');
const { downloadFile } = require('./download.cjs');
const { extractAll } = require('./zip.cjs');
const log = require('./logger.cjs');

// Gerekli Java sürümü: yıl-bazlı yeni sürümleme (25.x, 26.x) → 21;
// 1.20.5+ ve 1.21+ → 21; 1.17 - 1.20.4 → 17; öncesi → 8
function getRequiredJava(baseVersion) {
    const parts = String(baseVersion).split('.').map((n) => parseInt(n, 10) || 0);
    if (parts[0] > 1) return 21;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;
    if (minor >= 21 || (minor === 20 && patch >= 5)) return 21;
    if (minor >= 17) return 17;
    return 8;
}

// Gerekli sürümü karşılayabilecek bundled runtime adayları.
// Java 8 dünyası ayrıdır (eski MC yeni Java'da çalışmaz) — 8 sadece 8 ister.
function bundledCandidates(required) {
    if (required === 8) return [8];
    return [21, 17].filter((v) => v >= required);
}

function findJava(required, rootPath) {
    // 1. Launcher'ın indirdiği runtime
    for (const jv of bundledCandidates(required)) {
        const p = path.join(rootPath, 'runtime', `java${jv}`, 'bin', 'java.exe');
        if (fs.existsSync(p)) { log.info(`[JAVA] Bundled: ${p}`); return p; }
    }

    // 2. Mojang launcher runtimeları
    const mojangName = required >= 21 ? 'java-runtime-delta' : required >= 17 ? 'java-runtime-gamma' : 'java-runtime-alpha';
    const appData = process.env.APPDATA || '';
    const mojangPath = path.join(appData, '.minecraft', 'runtime', mojangName, 'windows-x64', mojangName, 'bin', 'java.exe');
    if (fs.existsSync(mojangPath)) { log.info(`[JAVA] Mojang: ${mojangPath}`); return mojangPath; }

    // 3. Yaygın kurulum konumları
    const scanDirs = [
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\Java',
        'C:\\Program Files\\Zulu',
        'C:\\Program Files\\Microsoft',
        'C:\\Program Files\\BellSoft',
        'C:\\Program Files\\Amazon Corretto',
        'C:\\Program Files (x86)\\Java',
    ];
    for (const base of scanDirs) {
        if (!fs.existsSync(base)) continue;
        try {
            const candidates = fs.readdirSync(base)
                .filter((d) => {
                    const dl = d.toLowerCase();
                    if (required === 8) return dl.includes('1.8') || dl.includes('jdk8') || dl.includes('jre8');
                    return dl.includes(`jdk-${required}`) || dl.includes(`jre-${required}`) ||
                           dl.includes(`jdk${required}`) || dl.includes(`jre${required}`) ||
                           (required <= 21 && (dl.startsWith('jdk-21') || dl.startsWith('jre-21')));
                })
                .sort().reverse();
            for (const dir of candidates) {
                const p = path.join(base, dir, 'bin', 'java.exe');
                if (fs.existsSync(p)) { log.info(`[JAVA] Kurulu: ${p}`); return p; }
            }
        } catch { /* okunamayan klasörü atla */ }
    }

    // 4. Sistem Java'sı yeterli mi?
    try {
        const out = execSync('java -version 2>&1', { timeout: 3000, stdio: 'pipe' }).toString();
        const m = out.match(/version "?(\d+)(?:\.(\d+))?/);
        if (m) {
            const major = parseInt(m[1], 10) === 1 ? parseInt(m[2], 10) : parseInt(m[1], 10);
            const ok = required === 8 ? major === 8 : major >= required;
            if (ok) { log.info(`[JAVA] Sistem Java ${major} yeterli`); return 'java'; }
        }
    } catch { /* sistemde java yok */ }

    return null;
}

// Adoptium'dan gerekli sürümün JRE'sini indirip runtime/java<N> altına kurar.
async function downloadJava(required, rootPath, onProgress) {
    const runtimeBase = path.join(rootPath, 'runtime');
    const javaDir = path.join(runtimeBase, `java${required}`);
    const javaExe = path.join(javaDir, 'bin', 'java.exe');
    if (fs.existsSync(javaExe)) return javaExe;

    onProgress({ type: 'download', percent: 0, message: `Java ${required} bilgisi alınıyor...` });
    const assets = await httpGetJson(
        `https://api.adoptium.net/v3/assets/latest/${required}/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse`
    );
    const pkg = assets?.[0]?.binary?.package;
    if (!pkg?.link) throw new Error(`Java ${required} için indirme paketi bulunamadı`);

    fs.mkdirSync(runtimeBase, { recursive: true });
    const zipPath = path.join(runtimeBase, `jre${required}.zip`);

    await downloadFile(pkg.link, zipPath, {
        sha256: pkg.checksum || undefined,
        onProgress: (pct) => onProgress({ type: 'download', percent: Math.floor(pct * 0.85), message: `Java ${required} indiriliyor... %${pct}` }),
    });

    onProgress({ type: 'extract', percent: 88, message: 'Java dosyaları çıkarılıyor...' });
    const tempDir = path.join(runtimeBase, `jre${required}_tmp`);
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    extractAll(zipPath, tempDir);

    const items = fs.readdirSync(tempDir).filter((i) => fs.statSync(path.join(tempDir, i)).isDirectory());
    if (!items.length) throw new Error('Çıkarılan JRE klasörü bulunamadı');

    if (fs.existsSync(javaDir)) fs.rmSync(javaDir, { recursive: true, force: true });
    fs.renameSync(path.join(tempDir, items[0]), javaDir);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* temizlik */ }
    try { fs.unlinkSync(zipPath); } catch { /* temizlik */ }

    if (!fs.existsSync(javaExe)) throw new Error('Java kurulumu doğrulanamadı (java.exe yok)');
    onProgress({ type: 'done', percent: 100, message: `Java ${required} hazır!` });
    log.info(`[JAVA] Java ${required} indirildi: ${javaExe}`);
    return javaExe;
}

/** Gerekli Java'yı bul; yoksa indir. */
async function ensureJava(baseVersion, rootPath, onProgress) {
    const required = getRequiredJava(baseVersion);
    log.info(`[JAVA] MC ${baseVersion} için Java ${required} gerekli`);
    const found = findJava(required, rootPath);
    if (found) return found;
    onProgress({ type: 'start', percent: 0, message: `Java ${required} bulunamadı, indiriliyor...` });
    return downloadJava(required, rootPath, onProgress);
}

module.exports = { getRequiredJava, findJava, downloadJava, ensureJava };
