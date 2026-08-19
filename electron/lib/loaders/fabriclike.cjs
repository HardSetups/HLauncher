// Fabric ve Quilt kurulumu — her ikisi de meta sunucularından MCLC uyumlu
// hazır version profili verir; tek farkları meta adresi ve isimlendirme.
const fs = require('fs');
const path = require('path');
const { httpGetJson } = require('../http.cjs');
const log = require('../logger.cjs');

const META = {
    fabric: { base: 'https://meta.fabricmc.net/v2', prefix: 'fabric-loader' },
    quilt:  { base: 'https://meta.quiltmc.org/v3', prefix: 'quilt-loader' },
};

function findInstalled(kind, rootPath, mcVer) {
    const { prefix } = META[kind];
    try {
        const dir = path.join(rootPath, 'versions');
        if (!fs.existsSync(dir)) return null;
        return fs.readdirSync(dir).find((d) =>
            d.startsWith(`${prefix}-`) && d.endsWith(`-${mcVer}`) &&
            fs.existsSync(path.join(dir, d, `${d}.json`))
        ) || null;
    } catch { return null; }
}

function pickLoader(kind, loaders) {
    if (!Array.isArray(loaders) || !loaders.length) return null;
    if (kind === 'fabric') {
        return (loaders.find((l) => l.loader?.stable) || loaders[0]).loader.version;
    }
    // Quilt meta'sında stable bayrağı yok; beta/pre olmayan ilk sürümü tercih et.
    const stable = loaders.find((l) => l.loader?.version && !/beta|pre|rc/i.test(l.loader.version));
    return (stable || loaders[0]).loader?.version || null;
}

async function install(kind, rootPath, mcVer, onProgress) {
    const meta = META[kind];
    if (!meta) throw new Error(`Bilinmeyen loader: ${kind}`);
    const label = kind === 'fabric' ? 'Fabric' : 'Quilt';

    const local = findInstalled(kind, rootPath, mcVer);
    if (local) { log.info(`[${label.toUpperCase()}] Yerel: ${local}`); return local; }

    onProgress({ type: kind, percent: 0, key: 'be.checkingVersions', params: { name: label } });
    const loaders = await httpGetJson(`${meta.base}/versions/loader/${mcVer}`);
    const loaderVersion = pickLoader(kind, loaders);
    if (!loaderVersion) throw new Error(`${mcVer} için ${label} bulunamadı`);

    const fullId = `${meta.prefix}-${loaderVersion}-${mcVer}`;
    const versionDir = path.join(rootPath, 'versions', fullId);
    const versionJson = path.join(versionDir, `${fullId}.json`);
    if (fs.existsSync(versionJson)) return fullId;

    onProgress({ type: kind, percent: 40, key: 'be.downloadingProfile', params: { name: label, v: loaderVersion } });
    const profile = await httpGetJson(`${meta.base}/versions/loader/${mcVer}/${loaderVersion}/profile/json`);
    profile.id = fullId;

    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(versionJson, JSON.stringify(profile, null, 2));

    onProgress({ type: kind, percent: 100, key: 'be.ready', params: { name: `${label} ${loaderVersion}` } });
    log.info(`[${label.toUpperCase()}] Kuruldu: ${fullId}`);
    return fullId;
}

module.exports = { install, findInstalled, pickLoader };
