// Sunucu dostu katman: sunucu sahibi bir URL'de hlauncher.json yayınlar,
// launcher bu manifesti uygulayarak doğru sürüm + loader + mod setini içeren
// bir profil kurar. Şema: docs/SERVER-MANIFEST.md
const path = require('path');
const { httpGetJson } = require('./http.cjs');
const { downloadFile } = require('./download.cjs');
const instances = require('./instances.cjs');
const modrinth = require('./modrinth.cjs');
const log = require('./logger.cjs');

const VALID_LOADERS = ['release', 'optifine', 'fabric', 'quilt', 'forge', 'neoforge'];
const MAX_MODS = 200;

function validateManifest(m) {
    const errors = [];
    if (!m || typeof m !== 'object') return { ok: false, errors: ['Manifest bir JSON nesnesi değil'] };
    if (m.manifestVersion !== 1) errors.push('manifestVersion 1 olmalı');
    if (!m.name || typeof m.name !== 'string') errors.push('name (sunucu adı) zorunlu');
    if (!m.address || typeof m.address !== 'string') errors.push('address (sunucu adresi) zorunlu');
    if (!m.mcVersion || !/^\d+(\.\d+){1,3}$/.test(String(m.mcVersion))) errors.push('mcVersion geçersiz (örn. "1.21.4")');
    if (!VALID_LOADERS.includes(m.loader)) errors.push(`loader şunlardan biri olmalı: ${VALID_LOADERS.join(', ')}`);
    if (m.recommendedRam !== undefined && (typeof m.recommendedRam !== 'number' || m.recommendedRam < 1 || m.recommendedRam > 64)) {
        errors.push('recommendedRam 1-64 arası sayı olmalı');
    }
    if (m.mods !== undefined) {
        if (!Array.isArray(m.mods)) errors.push('mods bir dizi olmalı');
        else {
            if (m.mods.length > MAX_MODS) errors.push(`En fazla ${MAX_MODS} mod desteklenir`);
            m.mods.forEach((mod, i) => {
                if (mod.type === 'modrinth') {
                    if (!mod.id) errors.push(`mods[${i}]: modrinth türünde id zorunlu`);
                } else if (mod.type === 'url') {
                    if (!mod.url || !/^https:\/\//.test(mod.url)) errors.push(`mods[${i}]: url https:// ile başlamalı`);
                    if (!mod.filename || /[/\\]|\.\./.test(mod.filename)) errors.push(`mods[${i}]: geçerli filename zorunlu`);
                    if (!mod.sha1) errors.push(`mods[${i}]: url türünde sha1 zorunlu`);
                } else {
                    errors.push(`mods[${i}]: type "modrinth" veya "url" olmalı`);
                }
            });
        }
    }
    if (m.announcements !== undefined && !Array.isArray(m.announcements)) errors.push('announcements bir dizi olmalı');
    return { ok: errors.length === 0, errors };
}

async function fetchManifest(url) {
    if (!/^https?:\/\//.test(url)) throw new Error('Manifest adresi http(s) olmalı');
    const manifest = await httpGetJson(url);
    const { ok, errors } = validateManifest(manifest);
    if (!ok) throw new Error(`Manifest geçersiz:\n- ${errors.join('\n- ')}`);
    return manifest;
}

/**
 * Manifesti uygular: sunucuya özel profili oluşturur/günceller ve mod setini
 * eşitler (manifestten çıkan modlar silinir, yenileri kurulur).
 */
async function applyManifest(url, onProgress = () => {}) {
    onProgress({ percent: 0, message: 'Sunucu manifesti alınıyor...' });
    const manifest = await fetchManifest(url);

    const instanceId = `srv-${instances.slugify(manifest.address)}`;
    let instance = instances.get(instanceId);
    if (!instance) {
        instance = instances.create({
            name: manifest.name,
            mcVersion: manifest.mcVersion,
            loader: manifest.loader,
            ram: manifest.recommendedRam || null,
            origin: 'server',
            serverAddress: manifest.address,
            id: instanceId,
        });
    } else {
        instance = instances.update(instanceId, {
            name: manifest.name,
            mcVersion: manifest.mcVersion,
            loader: manifest.loader,
            ram: manifest.recommendedRam || instance.ram,
            serverAddress: manifest.address,
        });
    }

    const modsDir = instances.getModsDir(instanceId);
    const mods = manifest.mods || [];
    const managed = [];

    // Önceki manifest'ten kalan ama artık listede olmayan dosyaları temizle
    const previouslyManaged = instance.managedFiles || [];

    let done = 0;
    for (const mod of mods) {
        onProgress({
            percent: 5 + Math.floor((done / Math.max(mods.length, 1)) * 90),
            message: `Modlar kuruluyor (${done + 1}/${mods.length})...`,
        });
        if (mod.type === 'modrinth') {
            const files = await modrinth.installProject({
                modsDir,
                projectIdOrSlug: mod.id,
                mcVersion: manifest.mcVersion,
                loader: manifest.loader,
                versionId: mod.versionId || null,
                onProgress: (p) => onProgress({ percent: null, message: p.message }),
            });
            managed.push(...files.map((f) => `mods/${f.file}`));
        } else {
            const dest = path.join(modsDir, mod.filename);
            await downloadFile(mod.url, dest, { sha1: mod.sha1 });
            managed.push(`mods/${mod.filename}`);
        }
        done++;
    }

    for (const rel of previouslyManaged) {
        if (rel.startsWith('mods/') && !managed.includes(rel)) {
            try {
                modrinth.removeModFile(modsDir, path.basename(rel));
                log.info(`[MANIFEST] Kaldırıldı (listeden çıkmış): ${rel}`);
            } catch { /* dosya zaten yoksa geç */ }
        }
    }

    instances.update(instanceId, { managedFiles: managed });
    onProgress({ percent: 100, message: `${manifest.name} hazır!` });
    log.info(`[MANIFEST] Uygulandı: ${manifest.name} (${mods.length} mod, ${manifest.loader} ${manifest.mcVersion})`);

    return {
        instanceId,
        name: manifest.name,
        address: manifest.address,
        mcVersion: manifest.mcVersion,
        loader: manifest.loader,
        modCount: mods.length,
        recommendedRam: manifest.recommendedRam || null,
        announcements: (manifest.announcements || []).slice(0, 10),
    };
}

module.exports = { validateManifest, fetchManifest, applyManifest };
