// Basit, atomik JSON ayar deposu — %APPDATA%\.hlauncher\config.json
// Renderer localStorage'ı yerine main süreçte tek doğruluk kaynağı.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
    settings: {
        language: 'tr',
        accent: '#ff6a3d',
        bgImage: 'bg.png',
        ram: 4,                 // GB
        fullscreen: false,
        javaPath: '',
        connectAddress: '',
        jvmPreset: 'balanced',  // balanced | lowram | zgc | custom
        customJvmArgs: '',
        rpcEnabled: true,   // Discord Rich Presence (client ID discord.cjs'te)
        checkUpdates: true,
        onboarded: false,
    },
    account: null,              // { type:'offline', name } | { type:'microsoft', name, uuid, refresh }
    servers: [],                // [{ id, name, address, favorite, manifestUrl?, addedAt }]
    activeInstanceId: 'default',
    windowBounds: null,         // { width, height, x, y, maximized }
};

function deepMerge(base, extra) {
    if (Array.isArray(base) || Array.isArray(extra)) return extra !== undefined ? extra : base;
    if (typeof base === 'object' && base && typeof extra === 'object' && extra) {
        const out = { ...base };
        for (const k of Object.keys(extra)) out[k] = deepMerge(base[k], extra[k]);
        return out;
    }
    return extra !== undefined ? extra : base;
}

class Store {
    constructor(filePath, defaults) {
        this.filePath = filePath;
        this.defaults = defaults;
        this.data = this._load();
    }

    _load() {
        try {
            const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
            return deepMerge(this.defaults, raw);
        } catch {
            return JSON.parse(JSON.stringify(this.defaults));
        }
    }

    _save() {
        const tmp = `${this.filePath}.tmp`;
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
        fs.renameSync(tmp, this.filePath);
    }

    /** Üst düzey anahtar okuma: get('settings'), get('servers')... */
    get(key) { return this.data[key]; }

    set(key, value) {
        this.data[key] = value;
        this._save();
    }

    /** settings altına kısmi yama: patchSettings({ ram: 8 }) */
    patchSettings(patch) {
        this.data.settings = { ...this.data.settings, ...patch };
        this._save();
        return this.data.settings;
    }

    all() { return this.data; }
}

// Renderer'dan gelen veriler ana sürece güvenilmeden yazılmaz — saf, testli süzgeçler:

const SETTING_KEYS = new Set(Object.keys(DEFAULTS.settings));

/** settings:patch için yalnızca bilinen anahtarları geçirir. */
function sanitizeSettingsPatch(patch) {
    const clean = {};
    if (!patch || typeof patch !== 'object') return clean;
    for (const [key, value] of Object.entries(patch)) {
        if (SETTING_KEYS.has(key)) clean[key] = value;
    }
    return clean;
}

/** servers:set için liste şemasını zorlar. */
function sanitizeServers(servers) {
    const crypto = require('crypto');
    return (Array.isArray(servers) ? servers : [])
        .slice(0, 20)
        .map((s) => ({
            id: String(s?.id || '').slice(0, 60) || crypto.randomUUID(),
            name: String(s?.name || '').slice(0, 60),
            address: String(s?.address || '').trim().slice(0, 120),
            favorite: s?.favorite === true,
            manifestUrl: /^https?:\/\//.test(String(s?.manifestUrl || '')) ? String(s.manifestUrl).slice(0, 300) : '',
            addedAt: Number(s?.addedAt) || Date.now(),
        }))
        .filter((s) => s.address);
}

let instance = null;
function getStore() {
    if (!instance) {
        const { getRootPath } = require('./paths.cjs');
        instance = new Store(path.join(getRootPath(), 'config.json'), DEFAULTS);
    }
    return instance;
}

module.exports = { getStore, Store, DEFAULTS, sanitizeSettingsPatch, sanitizeServers };
