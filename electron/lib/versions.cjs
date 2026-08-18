// Mojang sürüm listesi: son 3 yılın release'leri, 12 saat disk önbelleği.
const fs = require('fs');
const path = require('path');
const { httpGetJson } = require('./http.cjs');
const { getRootPath } = require('./paths.cjs');

const MANIFEST_CACHE_MS = 12 * 60 * 60 * 1000;
const RECENT_YEARS = 3;
const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

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
    } catch { /* bozuk önbellek yenilenir */ }

    const manifest = await httpGetJson(MANIFEST_URL);
    const cutoff = Date.now() - RECENT_YEARS * 365 * 24 * 60 * 60 * 1000;
    const versions = (manifest.versions || [])
        .filter((v) => v.type === 'release' && new Date(v.releaseTime).getTime() >= cutoff)
        .map((v) => ({ id: v.id, releaseTime: v.releaseTime }))
        .sort((a, b) => new Date(b.releaseTime) - new Date(a.releaseTime));

    try {
        fs.writeFileSync(cachePath, JSON.stringify({ fetchedAt: Date.now(), versions }, null, 2));
    } catch { /* önbellek yazılamazsa da liste döner */ }

    return versions;
}

async function getLatestRelease() {
    const versions = await getRecentReleaseVersions();
    if (!versions.length) throw new Error('Sürüm listesi alınamadı');
    return versions[0].id;
}

module.exports = { getRecentReleaseVersions, getLatestRelease };
