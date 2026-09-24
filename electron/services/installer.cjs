// HardSetups ürün kurulumu (sözleşme §7): INSTALL, UPDATE ve REPAIR tek bir
// "senkronize et" akışıdır. Sunucunun kurulum bildirimi (manifest) örnek klasörüne
// uygulanır:
//   1. Doğrula: her yol göreli ve kök içinde, her dosyanın hash'i var
//   2. Planla: diskte hash'i tutan dosya yeniden inmez (onarma yalnızca bozuğu indirir)
//   3. İndir: .hl-staging/dl/ altına, izinli host + hash + boyut doğrulamalı, ≤4 paralel
//   4. Aç: arşivden YALNIZCA extract önekleri, zip-slip ve boyut korumalı
//   5. Uygula: yönetilen klasör (mods/) tam manifest kümesi olur — eski yönetilen
//      dosyalar silinir, kullanıcının eklediği jar'lar mods/.yedek/'e taşınır;
//      lisans ayarı birleştirilir; hl-manifest.json en son yazılır
// saves/, screenshots/, options.txt ve diğer kullanıcı dosyalarına HİÇ dokunulmaz.
// Adım 1–4'te bir hata olursa örnek klasörü değişmez.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { normalizeRelative, safeJoin, isValidFolderName } = require('../lib/safepath.cjs');
const { downloadVerified, runQueue } = require('./downloader.cjs');
const { mergeLicenseConfig, validateLicenseConfig } = require('./licenseconfig.cjs');

const MANIFEST_FILE = 'hl-manifest.json';
const STAGING_DIR = '.hl-staging';
const ASIDE_DIR = '.yedek';
const MAX_FILES = 2000;
const MAX_ARCHIVE_ENTRIES = 10000;
const MAX_ARCHIVE_BYTES = 4 * 1024 ** 3;
const LOADERS = new Set(['fabric', 'quilt', 'forge', 'neoforge', 'vanilla']);
const URL_REFRESH_TTL_MS = 30 * 1000;

const codedError = (code, message) => Object.assign(new Error(message), { code });
const hashFile = (file, algo) => crypto.createHash(algo).update(fs.readFileSync(file)).digest('hex');

// ─── 1. Doğrulama ──────────────────────────────────────────────────────────

function validateArchiveFrom(from) {
    if (typeof from !== 'string' || !from || from.length > 240) throw codedError('EBADMANIFEST', 'Geçersiz arşiv öneki');
    const unified = from.replace(/\\/g, '/');
    if (unified.startsWith('/') || unified.split('/').includes('..')) throw codedError('EUNSAFEPATH', 'Güvensiz arşiv öneki');
    return unified;
}

/** Sunucunun kurulum bildirimini doğrular ve normal biçimini döndürür. */
function validateInstallManifest(m) {
    const bad = (why) => { throw codedError('EBADMANIFEST', `Geçersiz kurulum bildirimi: ${why}`); };
    if (!m || typeof m !== 'object') bad('nesne değil');
    if (typeof m.installId !== 'string' || !/^[\w-]{1,128}$/.test(m.installId)) bad('installId');
    const inst = m.instance || {};
    if (!isValidFolderName(inst.folderName)) bad('folderName');
    if (typeof m.minecraft?.version !== 'string' || !/^[\w.-]{1,32}$/.test(m.minecraft.version)) bad('minecraft.version');
    const loaderType = m.loader?.type;
    if (!LOADERS.has(loaderType)) bad('loader.type');
    if (loaderType !== 'vanilla' && (typeof m.loader.version !== 'string' || !/^[\w.+-]{1,64}$/.test(m.loader.version))) bad('loader.version');
    const javaMajor = Number(m.java?.major);
    if (!Number.isInteger(javaMajor) || javaMajor < 8 || javaMajor > 40) bad('java.major');
    if (!Array.isArray(m.files) || !m.files.length || m.files.length > MAX_FILES) bad('files');

    const ids = new Set();
    const files = m.files.map((f) => {
        if (!f || typeof f !== 'object') bad('dosya');
        if (typeof f.id !== 'string' || !/^[\w-]{1,64}$/.test(f.id) || ids.has(f.id)) bad('dosya kimliği');
        ids.add(f.id);
        if (typeof f.url !== 'string') bad(`${f.id}: url`);
        const sha256 = typeof f.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(f.sha256) ? f.sha256.toLowerCase() : null;
        const sha512 = typeof f.sha512 === 'string' && /^[a-f0-9]{128}$/i.test(f.sha512) ? f.sha512.toLowerCase() : null;
        if (!sha256 && !sha512) bad(`${f.id}: hash yok`);
        if (typeof f.sizeBytes !== 'string' && typeof f.sizeBytes !== 'number') bad(`${f.id}: sizeBytes`);
        const size = Number(f.sizeBytes);
        if (!Number.isSafeInteger(size) || size < 0) bad(`${f.id}: sizeBytes`);
        const out = { id: f.id, kind: f.kind === 'archive' ? 'archive' : 'file', source: String(f.source || ''), url: f.url, sha256, sha512, size };
        if (out.kind === 'file') {
            out.path = normalizeRelative(f.path);
        } else {
            if (!Array.isArray(f.extract) || !f.extract.length || f.extract.length > 50) bad(`${f.id}: extract`);
            out.extract = f.extract.map((r) => {
                const from = validateArchiveFrom(r?.from);
                const isDir = from.endsWith('/');
                const to = normalizeRelative(r?.to, { allowDir: isDir });
                if (isDir !== to.endsWith('/')) bad(`${f.id}: extract (dizin/dosya uyuşmazlığı)`);
                return { from, to, isDir };
            });
        }
        return out;
    });

    const managedPaths = (Array.isArray(m.managedPaths) ? m.managedPaths : []).map((p) => {
        const n = normalizeRelative(p, { allowDir: true });
        if (!n.endsWith('/')) bad('managedPaths');
        return n;
    });
    let licenseConfig = null;
    if (m.licenseConfig) {
        validateLicenseConfig(m.licenseConfig);
        licenseConfig = { ...m.licenseConfig, path: normalizeRelative(m.licenseConfig.path) };
    }
    const world = m.quickPlay?.singleplayer;
    // eslint-disable-next-line no-control-regex -- dünya adında kontrol karakteri yasak
    if (world !== null && world !== undefined && (typeof world !== 'string' || !/^[^\\/:*?"<>|\x00-\x1f]{1,64}$/.test(world))) bad('quickPlay');

    return {
        installId: m.installId,
        instance: { id: String(inst.id || inst.folderName), folderName: inst.folderName, displayName: String(inst.displayName || inst.folderName).slice(0, 64) },
        version: { id: String(m.version?.id || ''), version: String(m.version?.version || ''), channel: String(m.version?.channel || 'STABLE') },
        minecraft: { version: m.minecraft.version },
        loader: { type: loaderType, version: loaderType === 'vanilla' ? null : m.loader.version },
        java: { major: javaMajor },
        memory: { minMb: Number(m.memory?.minMb) || null, recommendedMb: Number(m.memory?.recommendedMb) || null },
        files,
        licenseConfig,
        managedPaths,
        quickPlay: { singleplayer: world || null },
    };
}

// ─── Kurulu durum ───────────────────────────────────────────────────────────

function readInstalled(instanceDir) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(instanceDir, MANIFEST_FILE), 'utf8'));
        return data && data.schema === 1 && Array.isArray(data.files) ? data : null;
    } catch { return null; }
}

function writeInstalled(instanceDir, data) {
    const file = path.join(instanceDir, MANIFEST_FILE);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
}

/** Onarma öncesi kontrol: manifestteki bozuk/eksik dosyalar. */
function verifyInstalled(instanceDir) {
    const installed = readInstalled(instanceDir);
    if (!installed) return { installed: false, bad: [] };
    const bad = [];
    for (const f of installed.files) {
        let target;
        try { target = safeJoin(instanceDir, f.path); } catch { bad.push(f.path); continue; }
        if (!fs.existsSync(target) || hashFile(target, 'sha256') !== f.sha256) bad.push(f.path);
    }
    return { installed: true, version: installed.version, bad };
}

// ─── 4. Arşiv açma ─────────────────────────────────────────────────────────

/** Arşiv üyesinin hedef yolu (extract kurallarına göre) ya da null. */
function targetFor(entryName, rules) {
    for (const r of rules) {
        if (r.pattern) {
            if (r.pattern.test(entryName)) return normalizeRelative(`${r.toDir}${path.posix.basename(entryName)}`);
            continue;
        }
        if (r.isDir) {
            if (entryName.startsWith(r.from) && entryName.length > r.from.length) {
                return normalizeRelative(`${r.to}${entryName.slice(r.from.length)}`);
            }
        } else if (entryName === r.from) {
            return r.to;
        }
    }
    return null;
}

/**
 * Arşivden yalnızca kurallara uyan üyeleri outDir'e çıkarır.
 * @returns {{path: string, sha256: string, size: number}[]}
 */
function extractArchive(zipFile, rules, outDir) {
    let zip;
    try { zip = new AdmZip(zipFile); } catch { throw codedError('EBADARCHIVE', 'Arşiv açılamadı (bozuk dosya)'); }
    const entries = zip.getEntries();
    if (entries.length > MAX_ARCHIVE_ENTRIES) throw codedError('EBADARCHIVE', 'Arşivde çok fazla dosya var');
    let total = 0;
    const out = [];
    const matchedRules = new Set();
    for (const entry of entries) {
        if (entry.isDirectory) continue;
        const name = entry.entryName.replace(/\\/g, '/');
        const rel = targetFor(name, rules);
        if (!rel) continue;
        matchedRules.add(rules.find((r) => targetFor(name, [r])));
        total += entry.header.size;
        if (total > MAX_ARCHIVE_BYTES) throw codedError('EBADARCHIVE', 'Arşiv beklenenden çok büyük');
        const data = entry.getData();
        const dest = safeJoin(outDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, data);
        out.push({ path: rel, sha256: crypto.createHash('sha256').update(data).digest('hex'), size: data.length });
    }
    // Dizin kuralı (ör. mods/) en az bir dosya bulmalı: bulamıyorsa arşiv yapısı değişmiş demektir
    const missingDir = rules.find((r) => (r.isDir || r.pattern) && !matchedRules.has(r));
    if (missingDir) throw codedError('EBADARCHIVE', `Arşiv beklenen yapıda değil (${missingDir.from || missingDir.toDir} bulunamadı)`);
    return out;
}

// ─── 5. Uygulama ───────────────────────────────────────────────────────────

function uniqueAside(dir, name) {
    let candidate = path.join(dir, name);
    for (let i = 2; fs.existsSync(candidate); i++) {
        const ext = path.extname(name);
        candidate = path.join(dir, `${path.basename(name, ext)} (${i})${ext}`);
    }
    return candidate;
}

/**
 * Yönetilen klasörü yeni kümeye indirger: eski yönetilen dosyalar silinir,
 * kullanıcının eklediği dosyalar <klasör>/.yedek/'e taşınır.
 */
function pruneManaged(instanceDir, managedPaths, keepPaths, previousPaths) {
    const removed = [];
    const movedAside = [];
    for (const mp of managedPaths) {
        const dir = safeJoin(instanceDir, mp);
        let names;
        try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const d of names) {
            if (!d.isFile()) continue; // alt klasörler (ör. .yedek) kullanıcıya ait
            const rel = `${mp}${d.name}`;
            if (keepPaths.has(rel)) continue;
            const full = path.join(dir, d.name);
            if (previousPaths.has(rel)) {
                fs.rmSync(full, { force: true });
                removed.push(rel);
            } else {
                const asideDir = path.join(dir, ASIDE_DIR);
                fs.mkdirSync(asideDir, { recursive: true });
                fs.renameSync(full, uniqueAside(asideDir, d.name));
                movedAside.push(rel);
            }
        }
    }
    return { removed, movedAside };
}

/**
 * Kurulum bildirimini örnek klasörüne uygular (INSTALL / UPDATE / REPAIR).
 * @param {object} o
 * @param {object} o.manifest sunucunun /install yanıtı (ya da §11 için launcher'ın ürettiği eşdeğeri)
 * @param {string} o.instanceDir
 * @param {string[]} o.allowedHosts indirme izin listesi
 * @param {boolean} [o.allowLocalHttp] yalnızca geliştirme
 * @param {() => Promise<Object<string,string>>} [o.refreshUrls] süresi dolan adresler: {fileId: url}
 * @param {(p: {phase: string, done: number, total: number}) => void} [o.onProgress]
 * @param {AbortSignal} [o.signal]
 * @param {Array<{pattern: RegExp, toDir: string}>} [o.extraRules] yalnızca launcher içi (§11.1) arşiv kuralları
 * @param {object} [o.meta] hl-manifest'e eklenecek ek alanlar (source vb.)
 */
async function syncProduct({ manifest, instanceDir, allowedHosts, allowLocalHttp = false, refreshUrls, onProgress = () => {}, signal, extraRules = {}, meta = {}, now = Date.now }) {
    const started = now();
    const m = manifest.__validated ? manifest : validateInstallManifest(manifest);
    fs.mkdirSync(instanceDir, { recursive: true });
    const previous = readInstalled(instanceDir);
    const staging = path.join(instanceDir, STAGING_DIR);
    const dlDir = path.join(staging, 'dl');
    const outDir = path.join(staging, 'out');
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(dlDir, { recursive: true });

    // ── 2. Plan ──
    const records = [];    // son hâlde kurulu olacak her dosya
    const toMove = [];     // { from (staging), rel }
    const downloads = [];  // { file, dest }
    const archiveRecords = previous?.archives || {};
    for (const f of m.files) {
        if (f.kind === 'file') {
            const target = safeJoin(instanceDir, f.path);
            const ok = fs.existsSync(target) && (f.sha256 ? hashFile(target, 'sha256') === f.sha256 : hashFile(target, 'sha512') === f.sha512);
            if (ok) { records.push({ path: f.path, sha256: hashFile(target, 'sha256'), size: fs.statSync(target).size, fileId: f.id, source: f.source }); continue; }
        } else {
            const prevMembers = (previous?.files || []).filter((r) => r.fileId === f.id);
            const unchanged = archiveRecords[f.id]?.sha256 && archiveRecords[f.id].sha256 === f.sha256 && prevMembers.length &&
                prevMembers.every((r) => { try { const t = safeJoin(instanceDir, r.path); return fs.existsSync(t) && hashFile(t, 'sha256') === r.sha256; } catch { return false; } });
            if (unchanged) { records.push(...prevMembers); continue; }
        }
        const key = (f.sha256 || f.sha512).slice(0, 32);
        downloads.push({ file: f, dest: path.join(dlDir, key) });
    }

    // ── 3. İndirme ──
    const total = downloads.reduce((s, d) => s + d.file.size, 0);
    let done = 0;
    const report = (phase) => onProgress({ phase, done, total });
    let urlCache = null; // { at, map }
    let refreshing = null;
    const freshUrl = async (id) => {
        if (!refreshUrls) throw codedError('EURLEXPIRED', 'İndirme adresinin süresi doldu');
        if (!urlCache || now() - urlCache.at > URL_REFRESH_TTL_MS) {
            refreshing = refreshing || refreshUrls().then((map) => { urlCache = { at: now(), map }; return map; }).finally(() => { refreshing = null; });
            await refreshing;
        }
        const url = urlCache.map[id];
        if (!url) throw codedError('EURLEXPIRED', 'Taze indirme adresi alınamadı');
        return url;
    };
    report('download');
    await runQueue(downloads, async ({ file, dest }, laneSignal) => {
        // Önbellekte (önceki denemeden) doğrulanmış kopya varsa yeniden indirme
        if (fs.existsSync(dest) && (file.sha256 ? hashFile(dest, 'sha256') === file.sha256 : hashFile(dest, 'sha512') === file.sha512)) {
            done += file.size;
            report('download');
            return;
        }
        await downloadVerified(
            { url: file.url, dest, sha256: file.sha256, sha512: file.sha512, sizeBytes: file.size },
            {
                allowedHosts, allowLocalHttp, signal: laneSignal,
                onBytes: (d) => { done += d; report('download'); },
                refreshUrl: () => freshUrl(file.id),
            },
        );
    }, { concurrency: 4, signal });

    // ── 4. Açma / hazırlama ──
    report('extract');
    for (const { file, dest } of downloads) {
        if (file.kind === 'file') {
            // Manifest her dosya için SHA-256 tutar (Modrinth yalnızca sha512 verir)
            records.push({ path: file.path, sha256: file.sha256 || hashFile(dest, 'sha256'), size: file.size, fileId: file.id, source: file.source });
            toMove.push({ from: dest, rel: file.path });
        } else {
            const rules = [...file.extract, ...(extraRules[file.id] || [])];
            const members = extractArchive(dest, rules, outDir);
            for (const mem of members) {
                records.push({ ...mem, fileId: file.id, source: file.source });
                toMove.push({ from: safeJoin(outDir, mem.path), rel: mem.path });
            }
        }
    }
    const seen = new Set();
    for (const r of records) {
        const k = r.path.toLowerCase();
        if (seen.has(k)) throw codedError('EBADMANIFEST', `Aynı yola iki dosya yazılıyor: ${r.path}`);
        seen.add(k);
    }
    if (signal?.aborted) throw codedError('ECANCELED', 'Kurulum iptal edildi');

    // ── 5. Uygula (buradan sonra örnek klasörü değişir) ──
    report('commit');
    const keep = new Set(records.map((r) => r.path));
    const prevPaths = new Set((previous?.files || []).map((r) => r.path));
    const { removed, movedAside } = pruneManaged(instanceDir, m.managedPaths, keep, prevPaths);
    for (const { from, rel } of toMove) {
        const target = safeJoin(instanceDir, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(from, target); // staging aynı birimde; kopya + sonra staging silinir
    }
    let licenseResult = null;
    if (m.licenseConfig) licenseResult = mergeLicenseConfig(instanceDir, m.licenseConfig);

    const archives = {};
    for (const f of m.files) if (f.kind === 'archive') archives[f.id] = { sha256: f.sha256 };
    writeInstalled(instanceDir, {
        schema: 1,
        product: m.instance.id,
        folderName: m.instance.folderName,
        displayName: m.instance.displayName,
        installId: m.installId,
        version: m.version,
        minecraft: m.minecraft,
        loader: m.loader,
        java: m.java,
        memory: m.memory,
        quickPlay: m.quickPlay,
        managedPaths: m.managedPaths,
        licenseConfigPath: m.licenseConfig?.path || null,
        archives,
        files: records.map(({ path: p, sha256, size, fileId, source }) => ({ path: p, sha256, size, fileId, source })),
        installedAt: new Date(now()).toISOString(),
        ...meta,
    });
    fs.rmSync(staging, { recursive: true, force: true });

    return {
        version: m.version.version,
        downloaded: downloads.length,
        reused: m.files.length - downloads.length,
        removed,
        movedAside,
        licenseCorruptBackup: licenseResult?.corruptBackup ? path.basename(licenseResult.corruptBackup) : null,
        durationMs: now() - started,
    };
}

/**
 * Kaldırma (§7.7): isteğe bağlı olarak önce saves/ yedeklenir, sonra örnek klasörü silinir.
 * @returns {{backupPath: string|null}}
 */
function uninstallProduct(instanceDir, { backupDir = null, label = 'urun', now = Date.now } = {}) {
    let backupPath = null;
    const saves = path.join(instanceDir, 'saves');
    if (backupDir && fs.existsSync(saves) && fs.readdirSync(saves).length) {
        fs.mkdirSync(backupDir, { recursive: true });
        const stampText = new Date(now()).toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
        backupPath = path.join(backupDir, `${label}-dunyalar-${stampText}.zip`);
        const zip = new AdmZip();
        zip.addLocalFolder(saves, 'saves');
        zip.writeZip(backupPath);
    }
    fs.rmSync(instanceDir, { recursive: true, force: true });
    return { backupPath };
}

module.exports = {
    validateInstallManifest, syncProduct, verifyInstalled, readInstalled, uninstallProduct,
    extractArchive, targetFor, MANIFEST_FILE,
};
