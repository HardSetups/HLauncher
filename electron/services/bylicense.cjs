// "Lisans anahtarım var" (sözleşme §11 + §11.1): hesabı olmayan, anahtarı başka bir
// satıcıdan (ör. ALP) alan oyuncular için. POST /v1/downloads/by-license bugün canlıda
// çalışıyor; kurulum bilgisi (sürüm, loader, bağımlılık) L2 gelene kadar burada sabit.
// Anahtarla kurulan ürünlere launcher kapı koymaz (§6.6): lisansı modun SDK'sı doğrular.
const AdmZip = require('adm-zip');
const { httpGetJson } = require('../lib/http.cjs');
const { compareVersions } = require('../lib/semver.cjs');

// §11.1 ara dönem kurulum tablosu
const PRODUCTS = {
    'kum-firtinasi': { gameId: 'kumfirtinasi', name: 'Kum Fırtınası', mc: '1.21.1', java: 21, memory: { minMb: 2048, recommendedMb: 4096 } },
    'tiktok-doldurdoldur': { gameId: 'dolduroldur', name: 'DoldurDoldur', mc: '1.21.1', java: 21, memory: { minMb: 2048, recommendedMb: 4096 } },
};
const CONFIG_PATH = 'config/hardsetups/ayarlar.json';
const MOD_JAR = /^(?:[^/]+\/)?mods\/[^/]+\.jar$/;
const FABRIC_API_VERSION = '0.116.17+1.21.1';

const codedError = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

// ─── Fabric sürüm koşulları (fabric.mod.json → depends.fabricloader) ───────

function satisfiesOne(version, predicate) {
    const p = String(predicate).trim();
    if (!p || p === '*') return true;
    return p.split(/\s+/).every((part) => {
        const m = /^(>=|<=|>|<|=|~|\^)?(.+)$/.exec(part);
        const [, op = '=', target] = m;
        const bare = target.replace(/\.x$|\.\*$/, '');
        const c = compareVersions(version, bare.split('.').length < 3 ? `${bare}${'.0'.repeat(3 - bare.split('.').length)}` : bare);
        if (Number.isNaN(c)) return false;
        const [vMaj, vMin] = version.split('.');
        const [tMaj, tMin] = bare.split('.');
        switch (op) {
            case '>=': return c >= 0;
            case '<=': return c <= 0;
            case '>': return c > 0;
            case '<': return c < 0;
            case '~': return c >= 0 && vMaj === tMaj && vMin === (tMin ?? vMin);
            case '^': return c >= 0 && vMaj === tMaj;
            default: return target.endsWith('.x') || target.endsWith('.*') ? version.startsWith(`${bare}.`) : c === 0;
        }
    });
}

/** Koşul dizi ise VEYA, metin ise boşlukla ayrılmış parçalar VE. */
function satisfies(version, constraint) {
    if (constraint === undefined || constraint === null) return true;
    const list = Array.isArray(constraint) ? constraint : [constraint];
    return list.some((c) => satisfiesOne(version, c));
}

/** Kararlı loader'lardan tüm koşulları sağlayan en yenisi. */
function pickLoaderVersion(loaders, constraints) {
    const stable = (Array.isArray(loaders) ? loaders : [])
        .map((l) => ({ version: l.loader?.version || l.version, stable: l.loader?.stable ?? l.stable }))
        .filter((l) => l.version && l.stable)
        .sort((a, b) => compareVersions(b.version, a.version));
    return stable.find((l) => constraints.every((c) => satisfies(l.version, c)))?.version || null;
}

// ─── Mod incelemesi ─────────────────────────────────────────────────────────

/** Jar içeriğinden fabric.mod.json → { id, loaderConstraint } (yoksa null alanlar). */
function readFabricMeta(jarBuffer) {
    try {
        const fmj = new AdmZip(jarBuffer).getEntry('fabric.mod.json');
        const meta = fmj ? JSON.parse(fmj.getData().toString('utf8')) : null;
        return { id: meta?.id || null, loaderConstraint: meta?.depends?.fabricloader ?? null };
    } catch { return { id: null, loaderConstraint: null }; }
}

/** Arşivdeki mods/*.jar'ların fabric.mod.json kimlikleri ve loader koşulları. */
function inspectArchive(zipFile) {
    let zip;
    try { zip = new AdmZip(zipFile); } catch { throw codedError('EBADARCHIVE', 'İndirilen arşiv açılamadı'); }
    const mods = [];
    for (const entry of zip.getEntries()) {
        const name = entry.entryName.replace(/\\/g, '/');
        if (entry.isDirectory || !MOD_JAR.test(name)) continue;
        mods.push({ file: name.split('/').pop(), ...readFabricMeta(entry.getData()) });
    }
    if (!mods.length) throw codedError('EBADARCHIVE', 'Arşivde mod dosyası bulunamadı (beklenen: <klasör>/mods/*.jar)');
    return { mods, hasLicenseStamp: !!zip.getEntry('.hs-license') };
}

/** Kurulu mods/ klasöründeki jar'ların kimlikleri ve loader koşulları. */
function inspectModsDir(modsDir) {
    const fs = require('fs');
    const path = require('path');
    let names = [];
    try { names = fs.readdirSync(modsDir).filter((n) => n.endsWith('.jar')); } catch { /* klasör yok */ }
    return names.map((file) => ({ file, ...readFabricMeta(fs.readFileSync(path.join(modsDir, file))) }));
}

// ─── Ağ (geliştirmede taban adresler mock'a çevrilebilir) ──────────────────

const DEFAULT_ENDPOINTS = { modrinthApi: 'https://api.modrinth.com', fabricMeta: 'https://meta.fabricmc.net' };

async function fetchFabricApi(mcVersion, endpoints = DEFAULT_ENDPOINTS) {
    const q = `loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;
    const versions = await httpGetJson(`${endpoints.modrinthApi}/v2/project/fabric-api/version?${q}`);
    const v = (versions || []).find((x) => x.version_number === FABRIC_API_VERSION);
    const file = v?.files?.find((f) => f.primary) || v?.files?.[0];
    if (!file?.hashes?.sha512) throw codedError('EDEPENDENCY', `Fabric API ${FABRIC_API_VERSION} Modrinth'te bulunamadı`);
    return { url: file.url, sha512: file.hashes.sha512, size: file.size, filename: file.filename };
}

async function fetchFabricLoaders(mcVersion, endpoints = DEFAULT_ENDPOINTS) {
    return httpGetJson(`${endpoints.fabricMeta}/v2/versions/loader/${encodeURIComponent(mcVersion)}`);
}

/**
 * Sunucu loader sürümünü sabitlemediyse (v1.4: loader.version null) §11.1 kuralı:
 * kurulu modların depends.fabricloader koşullarını sağlayan en yeni kararlı Fabric.
 */
async function resolveFabricLoader(modsDir, mcVersion, endpoints = DEFAULT_ENDPOINTS) {
    const constraints = inspectModsDir(modsDir).map((m) => m.loaderConstraint).filter(Boolean);
    const version = pickLoaderVersion(await fetchFabricLoaders(mcVersion, endpoints), constraints);
    if (!version) throw codedError('EDEPENDENCY', 'Modların istediği Fabric sürümü bulunamadı');
    return version;
}

/**
 * v1.4 §11.0: ürün launcher'a açıksa by-license yanıtının kökünde `install` gelir;
 * files[0] de kind/extract (ya da path) taşır. Bu durumda tablo yerine bu kullanılır.
 * @returns {object|null} sözleşme §7 biçiminde bildirim ya da null (install yok)
 */
function manifestFromResponse(data, file) {
    const inst = data?.install;
    if (!inst || typeof inst !== 'object' || !file?.kind) return null;
    const f1 = { id: 'f1', kind: file.kind, source: 'hardsetups', url: file.url, sha256: file.sha256, sizeBytes: String(file.sizeBytes) };
    if (file.kind === 'archive') f1.extract = file.extract; else f1.path = file.path;
    return {
        installId: `bylicense-${Date.now()}`,
        instance: inst.instance,
        version: { id: String(file.versionId || ''), version: String(file.version || ''), channel: String(file.channel || 'STABLE') },
        minecraft: inst.minecraft,
        loader: inst.loader,
        java: inst.java,
        memory: inst.memory,
        files: [f1, ...(Array.isArray(inst.files) ? inst.files : [])],
        licenseConfig: inst.licenseConfig,
        managedPaths: inst.managedPaths,
        quickPlay: inst.quickPlay,
    };
}

/** by-license yanıtındaki en uygun dosya: STABLE içinde en yeni sürüm. */
function pickFile(files) {
    const list = (Array.isArray(files) ? files : []).filter((f) => f && typeof f.url === 'string' && f.sha256);
    const stable = list.filter((f) => (f.channel || 'STABLE') === 'STABLE');
    return (stable.length ? stable : list).sort((a, b) => compareVersions(b.version || '0.0.0', a.version || '0.0.0'))[0] || null;
}

/**
 * by-license yanıtından + arşiv incelemesinden sözleşme §7 biçiminde kurulum
 * bildirimi üretir (installer.syncProduct'a verilir).
 */
function buildManifest({ product, table, file, licenseKey, loaderVersion, fabricApi }) {
    const files = [{
        id: 'f1', kind: 'archive', source: 'hardsetups', url: file.url, sha256: file.sha256, sizeBytes: String(file.sizeBytes),
        extract: [{ from: '.hs-license', to: '.hardsetups/lisans-damgasi.json' }],
    }];
    if (fabricApi) {
        files.push({ id: 'f2', kind: 'file', source: 'modrinth', path: `mods/${fabricApi.filename}`, url: fabricApi.url, sha512: fabricApi.sha512, sizeBytes: String(fabricApi.size) });
    }
    return {
        installId: `bylicense-${Date.now()}`,
        instance: { id: product, folderName: product, displayName: table.name },
        version: { id: String(file.versionId || ''), version: String(file.version || ''), channel: String(file.channel || 'STABLE') },
        minecraft: { version: table.mc },
        loader: { type: 'fabric', version: loaderVersion },
        java: { major: table.java },
        memory: table.memory,
        files,
        licenseConfig: { path: CONFIG_PATH, schemaVersion: 2, format: 'flat-map', entries: { [`lisans.anahtar.${table.gameId}`]: licenseKey } },
        managedPaths: ['mods/'],
        quickPlay: { singleplayer: null },
    };
}

/** Arşivdeki mods/*.jar üyeleri mods/ altına (§11.1); installer'a launcher içi kural olarak verilir. */
const ARCHIVE_RULES = { f1: [{ pattern: MOD_JAR, toDir: 'mods/' }] };

module.exports = {
    PRODUCTS, CONFIG_PATH, FABRIC_API_VERSION, ARCHIVE_RULES, DEFAULT_ENDPOINTS,
    satisfies, pickLoaderVersion, inspectArchive, inspectModsDir, fetchFabricApi, fetchFabricLoaders, resolveFabricLoader,
    pickFile, buildManifest, manifestFromResponse,
};
