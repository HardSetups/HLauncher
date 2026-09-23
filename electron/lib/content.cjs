// Profil içeriği: modlar, kaynak paketleri, shader paketleri.
// Tek bir soyutlama: her tür bir klasör + uzantılar. Devre dışı bırakma,
// dosyayı "<ad>.disabled" olarak yeniden adlandırmaktır (Minecraft yok sayar;
// Modrinth App ile aynı kural). Modrinth meta verisi SHA-1 ile eşlenir.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { httpGetJson, httpPostJson } = require('./http.cjs');
const { downloadFile } = require('./download.cjs');
const log = require('./logger.cjs');

const API = 'https://api.modrinth.com/v2';
const DISABLED_SUFFIX = '.disabled';

const CONTENT_TYPES = {
    mod: { dir: 'mods', exts: ['.jar'], projectType: 'mod', allowDirs: false },
    resourcepack: { dir: 'resourcepacks', exts: ['.zip'], projectType: 'resourcepack', allowDirs: true },
    shader: { dir: 'shaderpacks', exts: ['.zip'], projectType: 'shader', allowDirs: true },
};

function typeInfo(type) {
    const info = CONTENT_TYPES[type];
    if (!info) throw new Error(`Bilinmeyen içerik türü: ${type}`);
    return info;
}

/** Modrinth sürüm filtresi için loader listesi. null → filtre yok. */
function loadersFor(type, loader) {
    if (type === 'mod') return loader === 'quilt' ? ['quilt', 'fabric'] : [loader];
    if (type === 'resourcepack') return ['minecraft'];
    if (type === 'shader') return ['iris', 'optifine', 'canvas', 'vanilla'];
    return null;
}

function assertSafeName(fileName) {
    const name = String(fileName || '');
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..') || path.isAbsolute(name)) {
        throw new Error('Geçersiz dosya adı');
    }
    return name;
}

/**
 * Saf sınıflandırma (test edilebilir): klasör girdisini içerik öğesine çevirir
 * ya da içerik değilse null döner.
 */
function classifyEntry(type, fileName, isDir) {
    const info = typeInfo(type);
    const enabled = !fileName.endsWith(DISABLED_SUFFIX);
    const baseName = enabled ? fileName : fileName.slice(0, -DISABLED_SUFFIX.length);
    if (!baseName || baseName.startsWith('.')) return null;
    if (isDir) {
        if (!info.allowDirs) return null;
    } else if (!info.exts.some((ext) => baseName.toLowerCase().endsWith(ext))) {
        return null;
    }
    return { file: fileName, name: baseName, enabled, isDir };
}

function listEntries(dir, type) {
    let names;
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    const items = [];
    for (const d of names) {
        const item = classifyEntry(type, d.name, d.isDirectory());
        if (!item) continue;
        try {
            const stat = fs.statSync(path.join(dir, d.name));
            items.push({ ...item, sizeBytes: item.isDir ? 0 : stat.size, modifiedAt: stat.mtimeMs });
        } catch { /* yarışta silindiyse geç */ }
    }
    return items.sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
}

// Hash önbelleği: yol + boyut + mtime değişmedikçe dosya yeniden okunmaz.
const hashCache = new Map();
function sha1Of(filePath, stat) {
    const key = `${filePath}|${stat.size}|${stat.mtimeMs}`;
    const cached = hashCache.get(key);
    if (cached) return cached;
    const hash = crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
    hashCache.set(key, hash);
    return hash;
}

// Proje meta önbelleği (oturum boyunca)
const projectCache = new Map();

async function fetchProjects(ids) {
    const missing = ids.filter((id) => !projectCache.has(id));
    for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        const res = await httpGetJson(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(chunk))}`);
        for (const p of Array.isArray(res) ? res : []) {
            projectCache.set(p.id, { title: p.title, iconUrl: p.icon_url || null, slug: p.slug });
        }
    }
    return Object.fromEntries(ids.map((id) => [id, projectCache.get(id) || null]));
}

/**
 * Klasördeki içeriği listeler; Modrinth'te bilinen dosyalara ad/ikon/sürüm ekler.
 * Ağ hatası listeyi bozmaz — meta olmadan döner.
 */
async function listContent(dir, type) {
    const items = listEntries(dir, type);
    const files = items.filter((i) => !i.isDir);
    if (!files.length) return items;

    const byHash = {};
    for (const item of files) {
        try {
            const full = path.join(dir, item.file);
            item.hash = sha1Of(full, fs.statSync(full));
            byHash[item.hash] = item;
        } catch { /* okunamadı */ }
    }

    try {
        const hashes = Object.keys(byHash);
        const versions = await httpPostJson(`${API}/version_files`, { hashes, algorithm: 'sha1' });
        const projectIds = [...new Set(Object.values(versions || {}).map((v) => v.project_id))];
        const projects = projectIds.length ? await fetchProjects(projectIds) : {};
        for (const [hash, version] of Object.entries(versions || {})) {
            const item = byHash[hash];
            if (!item) continue;
            const project = projects[version.project_id];
            item.projectId = version.project_id;
            item.version = version.version_number;
            item.title = project?.title || null;
            item.iconUrl = project?.iconUrl || null;
        }
    } catch (err) {
        log.warn(`[CONTENT] Modrinth meta alınamadı: ${err.message}`);
    }
    return items;
}

/** Aç/kapat: dosyayı ".disabled" ekleyerek/çıkararak yeniden adlandırır. */
function setEnabled(dir, fileName, enabled) {
    const current = assertSafeName(fileName);
    const isDisabled = current.endsWith(DISABLED_SUFFIX);
    if (enabled === !isDisabled) return current; // zaten istenen durumda
    const next = enabled ? current.slice(0, -DISABLED_SUFFIX.length) : current + DISABLED_SUFFIX;
    const from = path.join(dir, current);
    const to = path.join(dir, next);
    if (!fs.existsSync(from)) throw new Error('Dosya bulunamadı');
    if (fs.existsSync(to)) throw new Error(`Aynı adda bir dosya zaten var: ${next}`);
    fs.renameSync(from, to);
    return next;
}

function removeContent(dir, fileName) {
    const target = path.join(dir, assertSafeName(fileName));
    if (!fs.existsSync(target)) return false;
    fs.rmSync(target, { recursive: true, force: true });
    return true;
}

// ─── Modrinth arama / kurulum ─────────────────────────────────────────────

const SORTS = new Set(['relevance', 'downloads', 'follows', 'newest', 'updated']);
// Kategori listesinde loader/platform adları da gelir; kart etiketlerinde gürültü
const LOADER_CATEGORIES = new Set(['minecraft', 'fabric', 'forge', 'neoforge', 'quilt', 'iris', 'optifine', 'canvas', 'vanilla', 'liteloader', 'modloader', 'rift', 'datapack', 'bukkit', 'paper', 'spigot', 'purpur', 'folia', 'velocity', 'bungeecord', 'waterfall', 'sponge']);

async function search({ query = '', type = 'mod', mcVersion = null, loader = null, sort = null, limit = 20, offset = 0 }) {
    const projectType = type === 'modpack' ? 'modpack' : typeInfo(type).projectType;
    const facets = [[`project_type:${projectType}`]];
    if (mcVersion) facets.push([`versions:${mcVersion}`]);
    if (type === 'mod' && loader && !['release', 'optifine'].includes(loader)) {
        facets.push(loadersFor('mod', loader).map((l) => `categories:${l}`));
    }
    const index = SORTS.has(sort) ? sort : (query ? 'relevance' : 'downloads');
    const params = new URLSearchParams({
        query,
        limit: String(Math.min(Math.max(limit, 1), 50)),
        offset: String(Math.max(offset, 0)),
        index,
        facets: JSON.stringify(facets),
    });
    const res = await httpGetJson(`${API}/search?${params}`);
    return {
        total: res.total_hits || 0,
        hits: (res.hits || []).map((h) => ({
            id: h.project_id,
            slug: h.slug,
            title: h.title,
            author: h.author,
            description: h.description,
            downloads: h.downloads,
            follows: h.follows,
            iconUrl: h.icon_url || null,
            updatedAt: h.date_modified || null,
            categories: (h.display_categories || h.categories || []).filter((c) => !LOADER_CATEGORIES.has(c)).slice(0, 3),
        })),
    };
}

async function pickVersion(projectId, { mcVersion = null, loaders = null, versionId = null } = {}) {
    const params = new URLSearchParams();
    if (mcVersion) params.set('game_versions', JSON.stringify([mcVersion]));
    if (loaders) params.set('loaders', JSON.stringify(loaders));
    const versions = await httpGetJson(`${API}/project/${encodeURIComponent(projectId)}/version?${params}`);
    if (!Array.isArray(versions) || !versions.length) return null;
    if (versionId) return versions.find((v) => v.id === versionId) || null;
    return versions[0]; // API en yeniden eskiye sıralar
}

function primaryFile(version) {
    return version.files.find((f) => f.primary) || version.files[0];
}

/** Kurulu dosya adları (açık/kapalı fark etmeksizin) — aynı dosyayı tekrar indirme. */
function existingBaseNames(dir) {
    try {
        return new Set(fs.readdirSync(dir).map((f) => (f.endsWith(DISABLED_SUFFIX) ? f.slice(0, -DISABLED_SUFFIX.length) : f)));
    } catch { return new Set(); }
}

/** Bir projeyi (mod ise zorunlu bağımlılıklarıyla) kurar. */
async function installProject({ dir, type, projectId, mcVersion, loader, versionId = null, onProgress = () => {}, _seen = new Set(), _depth = 0 }) {
    if (_depth > 5 || _seen.has(projectId)) return [];
    _seen.add(projectId);

    const version = await pickVersion(projectId, { mcVersion, loaders: loadersFor(type, loader), versionId });
    if (!version) throw new Error(`"${projectId}" için ${mcVersion} ile uyumlu sürüm bulunamadı`);
    _seen.add(version.project_id);

    const installed = [];
    if (type === 'mod') {
        for (const dep of version.dependencies || []) {
            if (dep.dependency_type !== 'required' || !dep.project_id) continue;
            try {
                installed.push(...await installProject({
                    dir, type, projectId: dep.project_id, mcVersion, loader,
                    versionId: dep.version_id || null, onProgress, _seen, _depth: _depth + 1,
                }));
            } catch (err) {
                log.warn(`[CONTENT] Bağımlılık kurulamadı (${dep.project_id}): ${err.message}`);
            }
        }
    }

    const file = primaryFile(version);
    if (!file) throw new Error(`"${projectId}" sürümünde dosya yok`);
    fs.mkdirSync(dir, { recursive: true });
    if (!existingBaseNames(dir).has(file.filename)) {
        onProgress({ key: 'be.downloading', params: { name: file.filename }, percent: 0 });
        let last = -1;
        await downloadFile(file.url, path.join(dir, assertSafeName(file.filename)), {
            sha1: file.hashes?.sha1,
            // Yüzde değiştikçe (en fazla 100 olay) bildir — IPC'yi boğma
            onProgress: (pct) => {
                if (pct === last) return;
                last = pct;
                onProgress({ key: 'be.downloadingPct', params: { name: file.filename, pct }, percent: pct });
            },
        });
        log.info(`[CONTENT] Kuruldu (${type}): ${file.filename}`);
    }
    installed.push({ project: version.project_id, file: file.filename });
    return installed;
}

/** Modrinth modpack'ini indirir ve .mrpack içe aktarıcısına verir → yeni profil. */
async function installModpack(projectId, onProgress = () => {}) {
    const { importMrpack } = require('./mrpack.cjs');
    const version = await pickVersion(projectId);
    if (!version) throw new Error('Modpack sürümü bulunamadı');
    const file = version.files.find((f) => f.filename.endsWith('.mrpack')) || primaryFile(version);
    const tmp = path.join(os.tmpdir(), `hlauncher-${crypto.randomBytes(4).toString('hex')}.mrpack`);
    // Birleşik ilerleme: paket dosyası %0-10, içindeki dosyalar %10-100
    onProgress({ percent: 0, key: 'be.downloading', params: { name: file.filename } });
    try {
        await downloadFile(file.url, tmp, {
            sha1: file.hashes?.sha1,
            onProgress: (pct) => onProgress({ percent: Math.floor(pct / 10), key: 'be.downloadingPct', params: { name: file.filename, pct } }),
        });
        const summary = await importMrpack(tmp, (p) => onProgress({ ...p, percent: p.percent == null ? null : 10 + Math.floor(p.percent * 0.9) }));
        let iconUrl = null;
        try { iconUrl = (await fetchProjects([projectId]))[projectId]?.iconUrl || null; } catch { /* ikon şart değil */ }
        return { ...summary, iconUrl };
    } finally {
        try { fs.unlinkSync(tmp); } catch { /* geçici dosya */ }
    }
}

// ─── Güncellemeler ───────────────────────────────────────────────────────

async function checkUpdates({ dir, type, mcVersion, loader }) {
    const { computeUpdates } = require('./modrinth.cjs');
    const files = listEntries(dir, type).filter((i) => !i.isDir);
    if (!files.length) return { checked: 0, updates: [], unknown: 0 };

    const fileHashes = files.map((f) => {
        const full = path.join(dir, f.file);
        return { file: f.file, hash: sha1Of(full, fs.statSync(full)) };
    });
    const hashes = fileHashes.map((f) => f.hash);
    const currentByHash = await httpPostJson(`${API}/version_files`, { hashes, algorithm: 'sha1' });
    const latestByHash = await httpPostJson(`${API}/version_files/update`, {
        hashes, algorithm: 'sha1', loaders: loadersFor(type, loader), game_versions: [mcVersion],
    });
    const result = computeUpdates(fileHashes, currentByHash, latestByHash);
    return { checked: files.length, ...result };
}

/** Güncellemeyi uygular; eski dosya kapalıysa yenisi de kapalı kalır. */
async function applyUpdate(dir, { oldFile, url, filename, sha1 }) {
    const old = assertSafeName(oldFile);
    const wasDisabled = old.endsWith(DISABLED_SUFFIX);
    const target = assertSafeName(filename) + (wasDisabled ? DISABLED_SUFFIX : '');
    if (!/^https:\/\/cdn\.modrinth\.com\//.test(String(url))) throw new Error('Geçersiz indirme adresi');
    await downloadFile(url, path.join(dir, target), { sha1: sha1 || undefined });
    if (old !== target) {
        try { removeContent(dir, old); } catch { /* eski dosya yoksa geç */ }
    }
    log.info(`[CONTENT] Güncellendi: ${old} → ${target}`);
    return target;
}

module.exports = {
    CONTENT_TYPES, DISABLED_SUFFIX,
    classifyEntry, listEntries, listContent, setEnabled, removeContent,
    search, installProject, installModpack, checkUpdates, applyUpdate, loadersFor,
};
