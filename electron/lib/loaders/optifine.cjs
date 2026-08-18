// OptiFine kurulumu. Birincil kaynak BMCL API'sidir; erişilemezse kullanıcı
// resmi siteden indirdiği jar ile manuel kurulum yapabilir (installFromJar).
const fs = require('fs');
const path = require('path');
const os = require('os');
const { httpGetJson } = require('../http.cjs');
const { downloadFile } = require('../download.cjs');
const { extractEntry, readEntryText, isValidZip } = require('../zip.cjs');
const log = require('../logger.cjs');

const BMCL_BASE = 'https://bmclapi2.bangbang93.com/optifine';

function findInstalled(rootPath, mcVer) {
    try {
        const dir = path.join(rootPath, 'versions');
        if (!fs.existsSync(dir)) return null;
        return fs.readdirSync(dir).find((d) =>
            d.startsWith(`${mcVer}-OptiFine_`) &&
            fs.existsSync(path.join(dir, d, `${d}.json`))
        ) || null;
    } catch { return null; }
}

// BMCL'den bu MC sürümü için en iyi (stable tercihli) OptiFine yapısını sorgula.
async function fetchBest(mcVer) {
    const list = await httpGetJson(`${BMCL_BASE}/${mcVer}`);
    if (!Array.isArray(list) || !list.length) throw new Error(`${mcVer} için OptiFine sürümü yok`);
    const stable = list.find((v) => !v.filename.startsWith('preview_'));
    return stable || list[list.length - 1];
}

// "OptiFine_1.21.4_HD_U_J3.jar" → { type:'HD_U', patch:'J3' }
function parseOptiFineFilename(filename, mcVer) {
    const base = path.basename(filename, '.jar').replace(/^preview_/, '');
    const prefix = `OptiFine_${mcVer}_`;
    if (!base.startsWith(prefix)) return null;
    const rest = base.slice(prefix.length); // örn. HD_U_J3
    const idx = rest.lastIndexOf('_');
    if (idx <= 0) return null;
    return { type: rest.slice(0, idx), patch: rest.slice(idx + 1) };
}

// OptiFine'ın launchwrapper'ını hazırla. Yeni sürümler (1.21+) launchwrapper-of-X.Y.jar
// taşır (sürümü jar içindeki launchwrapper-of.txt söyler); eskiler launchwrapper-1.12.jar taşır.
function setupLaunchWrapper(rootPath, optifineJar) {
    const lwOfVersion = (readEntryText(optifineJar, 'launchwrapper-of.txt') || '').trim() || null;

    if (lwOfVersion) {
        const jarName = `launchwrapper-of-${lwOfVersion}.jar`;
        const dest = path.join(rootPath, 'libraries', 'optifine', 'launchwrapper-of', lwOfVersion, jarName);
        if (!fs.existsSync(dest)) extractEntry(optifineJar, jarName, dest);
        return {
            name: `optifine:launchwrapper-of:${lwOfVersion}`,
            path: `optifine/launchwrapper-of/${lwOfVersion}/${jarName}`,
        };
    }

    const lwJar = path.join(rootPath, 'libraries', 'optifine', 'launchwrapper', '1.12', 'launchwrapper-1.12.jar');
    if (!fs.existsSync(lwJar)) extractEntry(optifineJar, 'launchwrapper-1.12.jar', lwJar);
    return {
        name: 'optifine:launchwrapper:1.12',
        path: 'optifine/launchwrapper/1.12/launchwrapper-1.12.jar',
    };
}

// Jar eldeyken kurulumun ortak son adımı: kütüphane yerleşimi + version.json
function finalizeInstall(rootPath, mcVer, type, patch, optifineJarSource) {
    const fullId = `${mcVer}-OptiFine_${type}_${patch}`;
    const libVersion = `${mcVer}_OptiFine_${type}_${patch}`;
    const jarName = `OptiFine-${libVersion}.jar`;
    const libJar = path.join(rootPath, 'libraries', 'optifine', 'OptiFine', libVersion, jarName);

    if (!fs.existsSync(libJar)) {
        fs.mkdirSync(path.dirname(libJar), { recursive: true });
        fs.copyFileSync(optifineJarSource, libJar);
    }

    const launchWrapper = setupLaunchWrapper(rootPath, libJar);

    const versionDir = path.join(rootPath, 'versions', fullId);
    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(path.join(versionDir, `${fullId}.json`), JSON.stringify({
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

    log.info(`[OPTIFINE] Kuruldu: ${fullId}`);
    return fullId;
}

/** BMCL üzerinden otomatik kurulum. */
async function install(rootPath, mcVer, onProgress) {
    const local = findInstalled(rootPath, mcVer);
    if (local) { log.info(`[OPTIFINE] Yerel: ${local}`); return local; }

    onProgress({ type: 'optifine', percent: 0, message: 'OptiFine sürümü kontrol ediliyor...' });
    const best = await fetchBest(mcVer);
    const { type, patch } = best;

    const fullId = `${mcVer}-OptiFine_${type}_${patch}`;
    const versionJson = path.join(rootPath, 'versions', fullId, `${fullId}.json`);
    if (fs.existsSync(versionJson)) return fullId;

    const tmpJar = path.join(os.tmpdir(), `hl_optifine_${Date.now()}.jar`);
    onProgress({ type: 'optifine', percent: 5, message: `OptiFine indiriliyor (${type}_${patch})...` });
    await downloadFile(`${BMCL_BASE}/${mcVer}/${type}/${patch}`, tmpJar, {
        onProgress: (pct) => onProgress({ type: 'optifine', percent: 5 + Math.floor(pct * 0.8), message: `OptiFine indiriliyor... %${pct}` }),
    });
    if (!isValidZip(tmpJar)) {
        try { fs.unlinkSync(tmpJar); } catch { /* temizlik */ }
        throw Object.assign(new Error('İndirilen OptiFine dosyası bozuk'), { code: 'EHASHMISMATCH' });
    }

    onProgress({ type: 'optifine', percent: 88, message: 'Kuruluyor...' });
    const result = finalizeInstall(rootPath, mcVer, type, patch, tmpJar);
    try { fs.unlinkSync(tmpJar); } catch { /* temizlik */ }
    onProgress({ type: 'optifine', percent: 100, message: `OptiFine ${type}_${patch} hazır!` });
    return result;
}

/** Kullanıcının resmi siteden indirdiği jar ile manuel kurulum. */
function installFromJar(rootPath, mcVer, jarPath) {
    if (!isValidZip(jarPath)) throw new Error('Seçilen dosya geçerli bir OptiFine jar\'ı değil');
    const parsed = parseOptiFineFilename(jarPath, mcVer);
    if (!parsed) {
        throw new Error(
            `Dosya adı beklenen biçimde değil. ${mcVer} için OptiFine jar'ı ` +
            `"OptiFine_${mcVer}_HD_U_XX.jar" biçiminde olmalı.`
        );
    }
    return finalizeInstall(rootPath, mcVer, parsed.type, parsed.patch, jarPath);
}

module.exports = { install, installFromJar, findInstalled, parseOptiFineFilename, fetchBest };
