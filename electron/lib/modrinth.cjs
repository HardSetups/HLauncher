// Modrinth entegrasyonu: mod arama, sürüm seçimi, bağımlılık çözümü ve
// SHA-1 doğrulamalı kurulum. API anahtarı gerektirmez.
const fs = require('fs');
const path = require('path');
const { httpGetJson } = require('./http.cjs');
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
        onProgress({ message: `${file.filename} indiriliyor...` });
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
            onProgress({ message: `${slug} kuruluyor...` });
            const files = await installProject({ modsDir, projectIdOrSlug: slug, mcVersion, loader, onProgress, _seen: seen });
            report.installed.push(...files.map((f) => f.file));
        } catch (err) {
            log.warn(`[PRESET] ${slug} atlandı: ${err.message}`);
            report.skipped.push({ mod: slug, reason: err.message });
        }
    }
    return report;
}

module.exports = { search, pickVersion, installProject, listModFiles, removeModFile, installPerformancePreset, PERFORMANCE_MODS };
