// Profil (instance) sistemi: her profilin kendi mod/config dizini vardır.
// Kayıtlar %APPDATA%\.hlauncher\instances.json içinde tutulur.
// 'default' profili geriye dönük uyumluluk için kök dizinde oynar.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getRootPath, getInstanceDir } = require('./paths.cjs');

const VALID_LOADERS = ['release', 'optifine', 'fabric', 'quilt', 'forge', 'neoforge'];

function registryPath() {
    return path.join(getRootPath(), 'instances.json');
}

function load() {
    try {
        const data = JSON.parse(fs.readFileSync(registryPath(), 'utf8'));
        if (Array.isArray(data.instances)) return data;
    } catch { /* ilk çalıştırma */ }
    return { instances: [] };
}

function save(data) {
    const tmp = `${registryPath()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, registryPath());
}

function ensureDefault() {
    const data = load();
    if (!data.instances.some((i) => i.id === 'default')) {
        data.instances.unshift({
            id: 'default',
            name: 'Varsayılan',
            mcVersion: null,     // null → en yeni release
            loader: 'release',
            ram: null,           // null → genel ayar
            origin: 'builtin',
            createdAt: Date.now(),
        });
        save(data);
    }
    return data;
}

function list() {
    return ensureDefault().instances;
}

function get(id) {
    return list().find((i) => i.id === id) || null;
}

function slugify(text) {
    const slug = String(text).toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return slug || crypto.randomBytes(4).toString('hex');
}

function create({ name, mcVersion = null, loader = 'release', ram = null, origin = 'manual', serverAddress = null, id = null }) {
    if (!name || !String(name).trim()) throw new Error('Profil adı boş olamaz');
    if (!VALID_LOADERS.includes(loader)) throw new Error(`Geçersiz loader: ${loader}`);

    const data = ensureDefault();
    let finalId = id || slugify(name);
    while (data.instances.some((i) => i.id === finalId)) {
        finalId = `${finalId}-${crypto.randomBytes(2).toString('hex')}`;
    }

    const instance = {
        id: finalId,
        name: String(name).trim(),
        mcVersion,
        loader,
        ram,
        origin,
        serverAddress,
        managedFiles: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    data.instances.push(instance);
    save(data);
    getInstanceDir(finalId); // dizini hazırla
    return instance;
}

function update(id, patch) {
    const data = ensureDefault();
    const idx = data.instances.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error(`Profil bulunamadı: ${id}`);
    if (patch.loader && !VALID_LOADERS.includes(patch.loader)) throw new Error(`Geçersiz loader: ${patch.loader}`);

    const protectedFields = ['id', 'origin', 'createdAt'];
    for (const key of protectedFields) delete patch[key];
    data.instances[idx] = { ...data.instances[idx], ...patch, updatedAt: Date.now() };
    save(data);
    return data.instances[idx];
}

function remove(id) {
    if (id === 'default') throw new Error('Varsayılan profil silinemez');
    const data = ensureDefault();
    const inst = data.instances.find((i) => i.id === id);
    if (!inst) return false;
    data.instances = data.instances.filter((i) => i.id !== id);
    save(data);
    // Profil dizinini (moddlar dahil) kaldır — kök değil, instances/<id>
    const dir = getInstanceDir(id);
    if (dir !== getRootPath()) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* kilitliyse kalsın */ }
    }
    return true;
}

function getModsDir(id) {
    const dir = path.join(getInstanceDir(id), 'mods');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

module.exports = { list, get, create, update, remove, ensureDefault, getModsDir, slugify, VALID_LOADERS };
