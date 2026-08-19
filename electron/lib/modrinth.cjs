// Modrinth entegrasyonu: mod arama, sürüm seçimi, bağımlılık çözümü ve
// SHA-1 doğrulamalı kurulum. API anahtarı gerektirmez.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { httpGetJson, httpPostJson } = require('./http.cjs');
const { downloadFile } = require('./download.cjs');
const log = require('./logger.cjs');

const API = 'https://api.modrinth.com/v2';

// Modrinth'te mod yükleyici kategorileri; quilt fabric modlarını da yükleyebilir.
function loaderFacets(loader) {
    if (loader === 'quilt') return ['quilt', 'fabric'];
    return [loader];
}

async function search({ query = '', mcVersion, loader, limit = 20, offset = 0 }) {
    const facets = [['project_type:mod']];
    if (mcVersion) facets.push([`versions:${mcVersion}`]);
    if (loader && loader !== 'release' && loader !== 'optifine') {
        facets.push(loaderFacets(loader).map((l) => `categories:${l}`));
    }
    const params = new URLSearchParams({
        query,
        limit: String(limit),
        offset: String(offset),
        index: query ? 'relevance' : 'downloads',
        facets: JSON.stringify(facets),
    });
    const res = await httpGetJson(`${API}/search?${params}`);
    return {
        total: res.total_hits || 0,
        hits: (res.hits || []).map((h) => ({
            id: h.project_id,
            slug: h.slug,
            title: h.title,
            description: h.description,
            downloads: h.downloads,
            iconUrl: h.icon_url || null,
        })),
    };
}

/** Projenin bu MC sürümü + loader ile uyumlu en yeni sürümünü döndürür. */
async function pickVersion(projectIdOrSlug, mcVersion, loader, versionId = null) {
    const params = new URLSearchParams({
        game_versions: JSON.stringify([mcVersion]),
        loaders: JSON.stringify(loaderFacets(loader)),
    });
    const versions = await httpGetJson(`${API}/project/${projectIdOrSlug}/version?${params}`);
    if (!Array.isArray(versions) || !versions.length) return null;
    if (versionId) return versions.find((v) => v.id === versionId) || null;
    return versions[0]; // API en yeniden eskiye sıralar
}

function primaryFile(version) {
    return version.files.find((f) => f.primary) || version.files[0];
}

/**
 * Bir projeyi bağımlılıklarıyla birlikte kurar.
 * @returns {Promise<Array<{project:string, file:string}>>} kurulan dosyalar
 */
async function installProject({ modsDir, projectIdOrSlug, mcVersion, loader, versionId = null, onProgress = () => {}, _seen = new Set(), _depth = 0 }) {
    if (_depth > 5) return []; // döngüsel bağımlılık emniyeti
    if (_seen.has(projectIdOrSlug)) return [];
    _seen.add(projectIdOrSlug);

    const version = await pickVersion(projectIdOrSlug, mcVersion, loader, versionId);
    if (!version) {
        throw new Error(`"${projectIdOrSlug}" için ${mcVersion} (${loader}) uyumlu sürüm bulunamadı`);
    }
    _seen.add(version.project_id);

    const installed = [];

    // Önce zorunlu bağımlılıklar
    for (const dep of version.dependencies || []) {
        if (dep.dependency_type !== 'required' || !dep.project_id) continue;
        try {
            installed.push(...await installProject({
                modsDir, projectIdOrSlug: dep.project_id, mcVersion, loader,
                versionId: dep.version_id || null, onProgress, _seen, _depth: _depth + 1,
            }));
        } catch (err) {
            log.warn(`[MODRINTH] Bağımlılık kurulamadı (${dep.project_id}): ${err.message}`);
        }
    }

    const file = primaryFile(version);
    if (!file) throw new Error(`"${projectIdOrSlug}" sürümünde dosya yok`);
    const dest = path.join(modsDir, file.filename);

    if (!fs.existsSync(dest)) {
        onProgress({ key: 'be.downloading', params: { name: file.filename } });
        await downloadFile(file.url, dest, { sha1: file.hashes?.sha1 });
        log.info(`[MODRINTH] Kuruldu: ${file.filename}`);
    }
    installed.push({ project: version.project_id, file: file.filename });
    return installed;
}

/** mods klasöründeki jar dosyalarını listeler. */
function listModFiles(modsDir) {
    try {
        return fs.readdirSync(modsDir)
            .filter((f) => f.endsWith('.jar'))
            .map((f) => {
                const stat = fs.statSync(path.join(modsDir, f));
                return { file: f, sizeBytes: stat.size, modifiedAt: stat.mtimeMs };
            })
            .sort((a, b) => a.file.localeCompare(b.file));
    } catch { return []; }
}

function removeModFile(modsDir, fileName) {
    // Yol kaçışlarına izin verme
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
        throw new Error('Geçersiz dosya adı');
    }
    const target = path.join(modsDir, fileName);
    if (!fs.existsSync(target)) return false;
    fs.unlinkSync(target);
    return true;
}

// Performans preset'i: Fabric/Quilt için kanıtlanmış optimizasyon modları.
const PERFORMANCE_MODS = ['sodium', 'lithium', 'ferrite-core', 'immediatelyfast', 'entityculling'];

async function installPerformancePreset({ modsDir, mcVersion, loader, onProgress = () => {} }) {
    if (!['fabric', 'quilt'].includes(loader)) {
        throw new Error('Performans paketi Fabric veya Quilt profili gerektirir');
    }
    const report = { installed: [], skipped: [] };
    const seen = new Set();
    for (const slug of PERFORMANCE_MODS) {
        try {
            onProgress({ key: 'be.installingName', params: { name: slug } });
            const files = await installProject({ modsDir, projectIdOrSlug: slug, mcVersion, loader, onProgress, _seen: seen });
            report.installed.push(...files.map((f) => f.file));
        } catch (err) {
            log.warn(`[PRESET] ${slug} atlandı: ${err.message}`);
            report.skipped.push({ mod: slug, reason: err.message });
        }
    }
    return report;
}

// ─── Güncelleme denetimi ────────────────────────────────────────────────────

function hashFileSha1(filePath) {
    return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * Saf karşılaştırma: dosya hash'leri + mevcut/en yeni sürüm haritalarından
 * güncelleme listesi üretir (test edilebilir olması için ayrık).
 * @param {Array<{file:string, hash:string}>} fileHashes
 * @param {Record<string, object>} currentByHash  hash → Modrinth version (dosyanın ait olduğu)
 * @param {Record<string, object>} latestByHash   hash → Modrinth version (uyumlu en yeni)
 */
function computeUpdates(fileHashes, currentByHash, latestByHash) {
    const updates = [];
    let unknown = 0;
    for (const { file, hash } of fileHashes) {
        const current = currentByHash[hash];
        if (!current) { unknown++; continue; } // Modrinth dışı / elle eklenmiş mod
        const latest = latestByHash[hash];
        if (!latest || latest.id === current.id) continue;
        const newFile = latest.files?.find((f) => f.primary) || latest.files?.[0];
        if (!newFile) continue;
        updates.push({
            oldFile: file,
            projectId: latest.project_id,
            currentVersion: current.version_number,
            latestVersion: latest.version_number,
            url: newFile.url,
            filename: newFile.filename,
            sha1: newFile.hashes?.sha1 || null,
        });
    }
    return { updates, unknown };
}

/** Kurulu modları Modrinth'e hash ile sorup güncellemeleri bulur. */
async function checkUpdates({ modsDir, mcVersion, loader }) {
    const files = listModFiles(modsDir);
    if (!files.length) return { checked: 0, updates: [], unknown: 0 };

    const fileHashes = files.map((f) => ({ file: f.file, hash: hashFileSha1(path.join(modsDir, f.file)) }));
    const hashes = fileHashes.map((f) => f.hash);

    // Hangi dosya hangi Modrinth sürümü? (bilinmeyenler yanıtta yer almaz)
    const currentByHash = await httpPostJson(`${API}/version_files`, { hashes, algorithm: 'sha1' });
    // Aynı hash'ler için bu MC sürümü + loader ile uyumlu en yeni sürüm
    const latestByHash = await httpPostJson(`${API}/version_files/update`, {
        hashes,
        algorithm: 'sha1',
        loaders: loaderFacets(loader),
        game_versions: [mcVersion],
    });

    const result = computeUpdates(fileHashes, currentByHash, latestByHash);
    log.info(`[MODRINTH] Güncelleme denetimi: ${files.length} dosya, ${result.updates.length} güncelleme, ${result.unknown} bilinmeyen`);
    return { checked: files.length, ...result };
}

/** Tek bir güncellemeyi uygular: yeni dosyayı indirir, eskisini kaldırır. */
async function applyUpdate(modsDir, { oldFile, url, filename, sha1 }) {
    const dest = path.join(modsDir, filename);
    await downloadFile(url, dest, { sha1: sha1 || undefined });
    if (oldFile && oldFile !== filename) {
        try { removeModFile(modsDir, oldFile); } catch { /* eski dosya zaten yoksa geç */ }
    }
    log.info(`[MODRINTH] Güncellendi: ${oldFile} → ${filename}`);
    return filename;
}

module.exports = {
    search, pickVersion, installProject, listModFiles, removeModFile,
    installPerformancePreset, PERFORMANCE_MODS,
    checkUpdates, applyUpdate, computeUpdates, hashFileSha1,
};
