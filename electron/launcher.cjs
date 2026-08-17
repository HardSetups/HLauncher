const { Client, Authenticator } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { execFile, execSync } = require('child_process');

const launcher = new Client();
let gameProcess = null;

// ─── Uygulama Veri Klasörü ──────────────────────────────────────────────────
// Yeni konum: %APPDATA%\.hardsetups — eski .thehardcraft klasörü varsa taşınır.
const getRootPath = () => {
    const newRoot = path.join(process.env.APPDATA, '.hardsetups');
    const oldRoot = path.join(process.env.APPDATA, '.thehardcraft');
    if (!fs.existsSync(newRoot) && fs.existsSync(oldRoot)) {
        try {
            fs.renameSync(oldRoot, newRoot);
            console.log('[LAUNCHER] Veri klasörü taşındı: .thehardcraft → .hardsetups');
        } catch (err) {
            console.error('[LAUNCHER] Veri klasörü taşınamadı, eski konum kullanılacak:', err.message);
            return oldRoot;
        }
    }
    return newRoot;
};

const stopGame = () => {
    if (gameProcess) {
        gameProcess.kill();
        gameProcess = null;
    }
};

// ─── Version Helpers ────────────────────────────────────────────────────────

const isOptiFineVersion = (version) =>
    version.includes('OptiFine') || version.includes('optifine');

const getBaseVersion = (version) => {
    if (version.includes('-OptiFine')) return version.split('-OptiFine')[0];
    if (version.startsWith('OptiFine ')) return version.replace('OptiFine ', '').split('_')[0];
    return version;
};

// ─── Java Detection ─────────────────────────────────────────────────────────

// Gerekli Java sürümü: yıl-bazlı yeni sürümleme (25.x, 26.x) → 21;
// 1.20.5+ ve 1.21+ → 21; 1.17 - 1.20.4 → 17; öncesi → 8
const getRequiredJava = (baseVersion) => {
    const parts = baseVersion.split('.').map(n => parseInt(n, 10) || 0);
    if (parts[0] > 1) return 21;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;
    if (minor >= 21 || (minor === 20 && patch >= 5)) return 21;
    if (minor >= 17) return 17;
    return 8;
};

const getJavaPath = (baseVersion, rootPath) => {
    const required = getRequiredJava(baseVersion);

    console.log(`[LAUNCHER] Need Java ${required} for MC ${baseVersion}`);

    // 1. Launcher-bundled Java (downloaded by us)
    for (const jv of required === 8 ? [8] : [21, 17]) {
        if (jv < required) continue;
        const p = path.join(rootPath, 'runtime', `java${jv}`, 'bin', 'java.exe');
        if (fs.existsSync(p)) { console.log(`[LAUNCHER] Bundled Java: ${p}`); return p; }
    }

    // 2. Mojang Minecraft Launcher runtimes
    const mojangName = required >= 21 ? 'java-runtime-delta' : required >= 17 ? 'java-runtime-gamma' : 'java-runtime-alpha';
    const mojangPath = path.join(process.env.APPDATA, '.minecraft', 'runtime', mojangName, 'windows-x64', mojangName, 'bin', 'java.exe');
    if (fs.existsSync(mojangPath)) { console.log(`[LAUNCHER] Mojang Java: ${mojangPath}`); return mojangPath; }

    // 3. Dynamic scan of common install locations
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
                .filter(d => {
                    const dl = d.toLowerCase();
                    if (required === 8) return dl.includes('1.8') || dl.includes('jdk8') || dl.includes('jre8');
                    return dl.includes(`jdk-${required}`) || dl.includes(`jre-${required}`) ||
                           dl.includes(`jdk${required}`) || dl.includes(`jre${required}`) ||
                           (required <= 21 && dl.startsWith(`jdk-21`)) ||
                           (required <= 21 && dl.startsWith(`jre-21`));
                })
                .sort().reverse();
            for (const dir of candidates) {
                const p = path.join(base, dir, 'bin', 'java.exe');
                if (fs.existsSync(p)) { console.log(`[LAUNCHER] Found Java: ${p}`); return p; }
            }
        } catch {}
    }

    // 4. System Java — check if version is sufficient
    try {
        const out = execSync('java -version 2>&1', { timeout: 3000, stdio: 'pipe' }).toString();
        const m = out.match(/version "?(\d+)/);
        if (m && parseInt(m[1], 10) >= required) {
            console.log(`[LAUNCHER] System Java version ${m[1]} is sufficient`);
            return 'java';
        }
    } catch {}

    console.log(`[LAUNCHER] Java ${required} not found`);
    return null;
};

// ─── Auto Java Download ──────────────────────────────────────────────────────

function downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
        const attempt = (currentUrl) => {
            try {
                const proto = currentUrl.startsWith('https://') ? https : http;
                proto.get(currentUrl, { headers: { 'User-Agent': 'HardSetups-Launcher/1.0' } }, (res) => {
                    if ([301, 302, 307, 308].includes(res.statusCode)) {
                        res.resume();
                        // Location göreli olabilir — mevcut URL'e göre çöz
                        let next;
                        try { next = new URL(res.headers.location, currentUrl).toString(); }
                        catch { return reject(new Error(`Geçersiz yönlendirme adresi: ${res.headers.location}`)); }
                        return attempt(next);
                    }
                    if (res.statusCode !== 200) {
                        res.resume();
                        return reject(new Error(`HTTP ${res.statusCode} hatası`));
                    }
                    const total = parseInt(res.headers['content-length'], 10) || 0;
                    let current = 0;
                    const file = fs.createWriteStream(dest);
                    res.on('data', (chunk) => {
                        current += chunk.length;
                        if (total > 0) onProgress(Math.floor((current / total) * 100));
                    });
                    res.pipe(file);
                    file.on('finish', () => file.close(resolve));
                    file.on('error', (err) => { try { fs.unlinkSync(dest); } catch {} reject(err); });
                }).on('error', (err) => { try { fs.unlinkSync(dest); } catch {} reject(err); });
            } catch (err) {
                reject(err);
            }
        };
        attempt(url);
    });
}

function extractZip(zipPath, destPath) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(destPath, { recursive: true });
        // Write a temp PS1 script to avoid cmd-line quoting issues
        const script = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destPath.replace(/'/g, "''")}' -Force`;
        const scriptPath = path.join(os.tmpdir(), `thc_extract_${Date.now()}.ps1`);
        fs.writeFileSync(scriptPath, script, 'utf8');
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
            { timeout: 120000 },
            (err) => {
                try { fs.unlinkSync(scriptPath); } catch {}
                err ? reject(new Error(`Çıkarma hatası: ${err.message}`)) : resolve();
            }
        );
    });
}

// ─── OptiFine Install ────────────────────────────────────────────────────────

function extractEntryFromZip(zipPath, entryName, destPath) {
    return new Promise((resolve, reject) => {
        const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "''");
        const script = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead('${esc(zipPath)}')
    $entry = $zip.Entries | Where-Object { $_.Name -eq '${entryName}' } | Select-Object -First 1
    if ($null -eq $entry) { throw "Dosya bulunamadi: ${entryName}" }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, '${esc(destPath)}', $true)
    $zip.Dispose()
} catch { if ($zip) { $zip.Dispose() }; Write-Error $_.Exception.Message; exit 1 }`;
        const scriptPath = path.join(os.tmpdir(), `thc_zipentry_${Date.now()}.ps1`);
        fs.writeFileSync(scriptPath, script, 'utf8');
        execFile('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
            { timeout: 30000 },
            (err, _out, stderr) => {
                try { fs.unlinkSync(scriptPath); } catch {}
                err ? reject(new Error(`ZIP: ${stderr || err.message}`)) : resolve();
            }
        );
    });
}

// BMCL API'den mevcut en iyi OptiFine sürümünü sorgula
function fetchBestOptiFine(mcVer) {
    return new Promise((resolve, reject) => {
        const url = `https://bmclapi2.bangbang93.com/optifine/${mcVer}`;
        https.get(url, { headers: { 'User-Agent': 'HardSetups-Launcher/1.0' } }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`OptiFine bulunamadı: HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const list = JSON.parse(data);
                    if (!list || !list.length) return reject(new Error(`${mcVer} için OptiFine sürümü yok`));
                    // Stable tercih et (preview_ ile başlamayan filename)
                    const stable = list.find(v => !v.filename.startsWith('preview_'));
                    const best   = stable || list[list.length - 1];
                    resolve(best);
                } catch (e) { reject(new Error(`BMCL yanıt hatası: ${e.message}`)); }
            });
        }).on('error', reject);
    });
}

// Yerel olarak kurulu herhangi bir OptiFine versiyonu var mı?
function findInstalledOptiFine(rootPath, mcVer) {
    try {
        const dir = path.join(rootPath, 'versions');
        if (!fs.existsSync(dir)) return null;
        return fs.readdirSync(dir).find(d =>
            d.startsWith(`${mcVer}-OptiFine_`) &&
            fs.existsSync(path.join(dir, d, `${d}.json`))
        ) || null;
    } catch { return null; }
}

// OptiFine'ın launchwrapper'ını hazırla. Yeni sürümler (1.21+) launchwrapper-of-X.Y.jar
// taşır (sürümü jar içindeki launchwrapper-of.txt söyler); eskiler launchwrapper-1.12.jar taşır.
async function setupLaunchWrapper(rootPath, optifineJar) {
    const tmpTxt = path.join(os.tmpdir(), `thc_lwof_${Date.now()}.txt`);
    let lwOfVersion = null;
    try {
        await extractEntryFromZip(optifineJar, 'launchwrapper-of.txt', tmpTxt);
        lwOfVersion = fs.readFileSync(tmpTxt, 'utf8').trim();
    } catch {}
    try { fs.unlinkSync(tmpTxt); } catch {}

    if (lwOfVersion) {
        const jarName = `launchwrapper-of-${lwOfVersion}.jar`;
        const dir = path.join(rootPath, 'libraries', 'optifine', 'launchwrapper-of', lwOfVersion);
        const dest = path.join(dir, jarName);
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dir, { recursive: true });
            await extractEntryFromZip(optifineJar, jarName, dest);
        }
        return {
            name: `optifine:launchwrapper-of:${lwOfVersion}`,
            path: `optifine/launchwrapper-of/${lwOfVersion}/${jarName}`,
        };
    }

    const lwDir = path.join(rootPath, 'libraries', 'optifine', 'launchwrapper', '1.12');
    const lwJar = path.join(lwDir, 'launchwrapper-1.12.jar');
    if (!fs.existsSync(lwJar)) {
        fs.mkdirSync(lwDir, { recursive: true });
        await extractEntryFromZip(optifineJar, 'launchwrapper-1.12.jar', lwJar);
    }
    return {
        name: 'optifine:launchwrapper:1.12',
        path: 'optifine/launchwrapper/1.12/launchwrapper-1.12.jar',
    };
}

async function installOptiFine(rootPath, mcVer, onProgress) {
    // 1. Yerel kurulum var mı?
    const local = findInstalledOptiFine(rootPath, mcVer);
    if (local) { console.log(`[LAUNCHER] OptiFine yerel: ${local}`); return local; }

    // 2. BMCL'den en iyi sürümü bul
    onProgress({ type: 'optifine', percent: 0, message: 'OptiFine sürümü kontrol ediliyor...' });
    const best = await fetchBestOptiFine(mcVer);
    const { type, patch } = best;

    const fullId     = `${mcVer}-OptiFine_${type}_${patch}`;
    const libVersion = `${mcVer}_OptiFine_${type}_${patch}`;
    const jarName    = `OptiFine-${libVersion}.jar`;
    const libDir     = path.join(rootPath, 'libraries', 'optifine', 'OptiFine', libVersion);
    const optifineJar = path.join(libDir, jarName);
    const versionDir = path.join(rootPath, 'versions', fullId);
    const versionJson = path.join(versionDir, `${fullId}.json`);

    // Tam kurulum zaten var mı?
    if (fs.existsSync(versionJson)) { console.log(`[LAUNCHER] OptiFine kurulu: ${fullId}`); return fullId; }

    // 3. OptiFine JAR indir
    fs.mkdirSync(libDir, { recursive: true });
    if (!fs.existsSync(optifineJar)) {
        onProgress({ type: 'optifine', percent: 5, message: `OptiFine indiriliyor (${type}_${patch})...` });
        const dlUrl = `https://bmclapi2.bangbang93.com/optifine/${mcVer}/${type}/${patch}`;
        await downloadFile(dlUrl, optifineJar, (pct) =>
            onProgress({ type: 'optifine', percent: 5 + Math.floor(pct * 0.80), message: `OptiFine indiriliyor... %${pct}` })
        );
    }

    onProgress({ type: 'optifine', percent: 86, message: 'Kuruluyor...' });

    // 4. launchwrapper JAR'ı OptiFine'dan çıkar (yeni: launchwrapper-of, eski: 1.12)
    const launchWrapper = await setupLaunchWrapper(rootPath, optifineJar);

    // 5. version.json oluştur
    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(versionJson, JSON.stringify({
        id: fullId,
        inheritsFrom: mcVer,
        type: 'release',
        mainClass: 'net.minecraft.launchwrapper.Launch',
        arguments: { game: ['--tweakClass', 'optifine.OptiFineTweaker'] },
        libraries: [
            { name: launchWrapper.name,
              downloads: { artifact: { path: launchWrapper.path, url: '', sha1: '', size: 0 } } },
            { name: `optifine:OptiFine:${libVersion}`,
              downloads: { artifact: { path: `optifine/OptiFine/${libVersion}/${jarName}`, url: '', sha1: '', size: 0 } } },
        ],
    }, null, 2));

    onProgress({ type: 'optifine', percent: 100, message: `OptiFine ${type}_${patch} hazır!` });
    console.log(`[LAUNCHER] OptiFine kuruldu: ${fullId}`);
    return fullId;
}

// ─── Fabric Install ──────────────────────────────────────────────────────────

function httpGetJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'HardSetups-Launcher/1.0' } }, (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode)) {
                res.resume();
                let next;
                try { next = new URL(res.headers.location, url).toString(); }
                catch { return reject(new Error(`Geçersiz yönlendirme adresi: ${res.headers.location}`)); }
                return httpGetJson(next).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

// Yerel olarak kurulu herhangi bir Fabric sürümü var mı?
function findInstalledFabric(rootPath, mcVer) {
    try {
        const dir = path.join(rootPath, 'versions');
        if (!fs.existsSync(dir)) return null;
        return fs.readdirSync(dir).find(d =>
            d.startsWith('fabric-loader-') && d.endsWith(`-${mcVer}`) &&
            fs.existsSync(path.join(dir, d, `${d}.json`))
        ) || null;
    } catch { return null; }
}

async function installFabric(rootPath, mcVer, onProgress) {
    // 1. Yerel kurulum var mı?
    const local = findInstalledFabric(rootPath, mcVer);
    if (local) { console.log(`[LAUNCHER] Fabric yerel: ${local}`); return local; }

    // 2. Fabric Meta'dan bu MC sürümüyle uyumlu loader'ları al, en iyi stable'ı seç
    onProgress({ type: 'fabric', percent: 0, message: 'Fabric sürümleri kontrol ediliyor...' });
    const loaders = await httpGetJson(`https://meta.fabricmc.net/v2/versions/loader/${mcVer}`);
    if (!loaders || !loaders.length) throw new Error(`${mcVer} için Fabric bulunamadı`);
    const picked = loaders.find(l => l.loader?.stable) || loaders[0];
    const loaderVersion = picked.loader.version;

    const fullId = `fabric-loader-${loaderVersion}-${mcVer}`;
    const versionDir = path.join(rootPath, 'versions', fullId);
    const versionJson = path.join(versionDir, `${fullId}.json`);

    if (fs.existsSync(versionJson)) { console.log(`[LAUNCHER] Fabric kurulu: ${fullId}`); return fullId; }

    // 3. Fabric Meta'nın hazırladığı MCLC-uyumlu version profilini doğrudan indir
    onProgress({ type: 'fabric', percent: 40, message: `Fabric profili indiriliyor (${loaderVersion})...` });
    const profile = await httpGetJson(`https://meta.fabricmc.net/v2/versions/loader/${mcVer}/${loaderVersion}/profile/json`);
    profile.id = fullId;

    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(versionJson, JSON.stringify(profile, null, 2));

    onProgress({ type: 'fabric', percent: 100, message: `Fabric ${loaderVersion} hazır!` });
    console.log(`[LAUNCHER] Fabric kuruldu: ${fullId}`);
    return fullId;
}

// ─── Version Manifest (Release) ─────────────────────────────────────────────

const MANIFEST_CACHE_MS = 12 * 60 * 60 * 1000; // 12 saat
const RECENT_YEARS = 3;

async function getRecentReleaseVersions() {
    const rootPath = getRootPath();
    const cachePath = path.join(rootPath, 'version_manifest_cache.json');

    try {
        if (fs.existsSync(cachePath)) {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            if (Date.now() - cached.fetchedAt < MANIFEST_CACHE_MS && cached.versions?.length) {
                return cached.versions;
            }
        }
    } catch {}

    const manifest = await httpGetJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const cutoff = Date.now() - RECENT_YEARS * 365 * 24 * 60 * 60 * 1000;
    const versions = (manifest.versions || [])
        .filter(v => v.type === 'release' && new Date(v.releaseTime).getTime() >= cutoff)
        .map(v => ({ id: v.id, releaseTime: v.releaseTime }))
        .sort((a, b) => new Date(b.releaseTime) - new Date(a.releaseTime));

    try {
        fs.mkdirSync(rootPath, { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify({ fetchedAt: Date.now(), versions }, null, 2));
    } catch {}

    return versions;
}

async function downloadJava(rootPath, onProgress) {
    const runtimeBase = path.join(rootPath, 'runtime');
    const javaDir = path.join(runtimeBase, 'java21');
    const javaExe = path.join(javaDir, 'bin', 'java.exe');

    if (fs.existsSync(javaExe)) return javaExe;

    fs.mkdirSync(runtimeBase, { recursive: true });
    const zipPath = path.join(runtimeBase, 'jre21.zip');

    onProgress({ type: 'download', percent: 0, message: 'Java 21 JRE indiriliyor...' });

    const url = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse';
    await downloadFile(url, zipPath, (pct) => {
        onProgress({ type: 'download', percent: Math.floor(pct * 0.9), message: `Java 21 indiriliyor... %${pct}` });
    });

    onProgress({ type: 'extract', percent: 90, message: 'Dosyalar çıkarılıyor...' });

    const tempDir = path.join(runtimeBase, 'jre21_tmp');
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });

    await extractZip(zipPath, tempDir);

    // Find the extracted JRE folder (e.g. jdk-21.0.x+y-jre)
    const items = fs.readdirSync(tempDir).filter(i =>
        fs.statSync(path.join(tempDir, i)).isDirectory()
    );
    if (!items.length) throw new Error('Çıkarılan JRE klasörü bulunamadı');

    if (fs.existsSync(javaDir)) fs.rmSync(javaDir, { recursive: true, force: true });
    fs.renameSync(path.join(tempDir, items[0]), javaDir);

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    try { fs.unlinkSync(zipPath); } catch {}

    onProgress({ type: 'done', percent: 100, message: 'Java 21 hazır!' });
    console.log(`[LAUNCHER] Java 21 downloaded to: ${javaExe}`);
    return javaExe;
}

// ─── Game Launch ─────────────────────────────────────────────────────────────

const launchGame = async (event, options) => {
    const { username, ramMax, version, serverIp, javaPath: customJavaPath, fullscreen } = options;
    const rootPath = getRootPath();

    const loaderType = options.loaderType || (isOptiFineVersion(version) ? 'optifine' : 'release');
    const baseVersion = options.baseVersion || getBaseVersion(version);

    console.log(`[LAUNCHER] Launching ${baseVersion} (${loaderType}) as ${username}`);

    // OptiFine/Fabric: kurulu değilse otomatik indir/kur; gerçek version ID'sini al
    let customVersionId = undefined;
    if (loaderType === 'optifine' || loaderType === 'fabric') {
        const installer = loaderType === 'optifine' ? installOptiFine : installFabric;
        const label = loaderType === 'optifine' ? 'OptiFine' : 'Fabric';
        event.reply('java-status', { type: loaderType, percent: 0, message: `${label} kontrol ediliyor...` });
        try {
            customVersionId = await installer(rootPath, baseVersion, (progress) => {
                event.reply('java-status', progress);
            });
            console.log(`[LAUNCHER] Kullanılacak ${label}: ${customVersionId}`);
            await new Promise(r => setTimeout(r, 600));
            event.reply('java-status', { type: 'done', percent: 100, message: `${label} hazır!` });
        } catch (err) {
            console.error(`[LAUNCHER] ${label} kurulum hatası:`, err.message);
            event.reply('java-status', { type: 'done', percent: 100, message: '' });
            event.reply('launch-error',
                `${label} bu sürüm için kurulamadı:\n${err.message}\n\n` +
                `Farklı bir Minecraft sürümü deneyin veya "Release" seçeneğiyle başlatın.`);
            return;
        }
    }

    const trimmedJava = customJavaPath ? customJavaPath.trim() : '';
    const isCustom = trimmedJava !== '' && trimmedJava !== 'java';

    let selectedJava;
    if (isCustom) {
        if (!fs.existsSync(trimmedJava)) {
            event.reply('launch-error', `Belirtilen Java bulunamadı:\n${trimmedJava}\n\nLütfen geçerli bir java.exe yolu girin veya alanı boş bırakın.`);
            return;
        }
        selectedJava = trimmedJava;
        console.log(`[LAUNCHER] Custom Java: ${selectedJava}`);
    } else {
        selectedJava = getJavaPath(baseVersion, rootPath);
        if (!selectedJava) {
            event.reply('java-status', { type: 'start', message: 'Java 21 bulunamadı, indiriliyor...' });
            try {
                selectedJava = await downloadJava(rootPath, (progress) => {
                    event.reply('java-status', progress);
                });
            } catch (err) {
                event.reply('java-status', { type: 'error', message: err.message });
                event.reply('launch-error', `Java kurulum hatası: ${err.message}`);
                return;
            }
        }
    }

    console.log(`[LAUNCHER] Java: ${selectedJava}`);

    // Clean up previous listeners before adding new ones
    launcher.removeAllListeners();

    launcher.on('debug',    (e) => console.log('[MCLC]', e));
    launcher.on('data',     (e) => console.log('[GAME]', e));
    launcher.on('progress', (e) => { console.log('[PROGRESS]', e); event.reply('launch-progress', e); });
    launcher.on('close',    (code) => {
        console.log(`[LAUNCHER] Game closed: ${code}`);
        gameProcess = null;
        event.reply('game-closed');
    });

    const gameArgs = [];
    if (fullscreen) gameArgs.push('--fullscreen');

    // Sunucu adresi girildiyse oyun açılınca otomatik bağlan; boşsa ana menüde aç
    const trimmedIp = (serverIp || '').trim();

    const opts = {
        clientPackage: null,
        authorization: Authenticator.getAuth(username),
        root: rootPath,
        version: {
            number: baseVersion,
            type: 'release',
            custom: customVersionId,
        },
        memory:   { max: ramMax || '4G', min: '1G' },
        javaPath: selectedJava,
        ...(trimmedIp ? { quickPlay: { type: 'multiplayer', identifier: trimmedIp } } : {}),
        overrides: { gameArgs },
    };

    try {
        gameProcess = await launcher.launch(opts);
        console.log('[LAUNCHER] Game process started');
        event.reply('launch-finished');
    } catch (err) {
        console.error('[LAUNCHER] Launch error:', err);
        event.reply('launch-error', err.message || 'Bilinmeyen bir hata oluştu');
    }
};

module.exports = { launchGame, stopGame, getRecentReleaseVersions };
