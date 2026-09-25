// Basit, atomik JSON ayar deposu — %APPDATA%\.hlauncher\config.json
// Renderer localStorage'ı yerine main süreçte tek doğruluk kaynağı.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
    settings: {
        language: 'tr',
        accent: '#A52B12',      // HardSetups Kiremit (docs/tema/KIMLIK.md); src/utils/accents.js ile aynı
        bgImage: 'bg.png',
        ram: 4,                 // GB
        fullscreen: false,
        javaPath: '',
        connectAddress: '',
        jvmPreset: 'balanced',  // balanced | lowram | zgc | custom
        customJvmArgs: '',
        rpcEnabled: true,   // Discord Rich Presence (client ID discord.cjs'te)
        checkUpdates: true,
        minimizeToTray: false,  // kullanıcı kararı: ayar olarak, varsayılan kapalı
        telemetryConsent: false, // anonim kullanım sayaçları (sözleşme §15): yalnızca açık onayla
        hsBetaChannel: false,    // HardSetups ürünlerinin beta sürümleri de kurulsun mu (kullanıcı kararı: ayar)
        onboarded: false,
    },
    account: null,              // { type:'offline', name } | { type:'microsoft', name, uuid, refresh }
    servers: [],                // [{ id, name, address, favorite, manifestUrl?, addedAt }]
    activeInstanceId: 'default',
    windowBounds: null,         // { width, height, x, y, maximized }
    compat: { noSandbox: false }, // lib/compat.cjs — yalnızca main süreç yazar
    lastSeenVersion: null,      // "Bu sürümde neler var" bir kez gösterilsin diye
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

// JVM'e kod yükleten ya da komut çalıştıran bayraklar. Ayar ele geçirilmiş bir renderer'dan
// gelse bile oyun başlatma bir kod çalıştırma yoluna dönüşmesin (ör. -javaagent:\\host\a.jar).
const UNSAFE_JVM_ARG = /^(@|-javaagent|-agentpath|-agentlib|-xx:onerror|-xx:onoutofmemoryerror|-cp$|-classpath|--class-path|-xbootclasspath|-djava\.library\.path|-djava\.system\.class\.loader|-djava\.security\.manager|-dorg\.lwjgl\.librarypath)/i;
/** Tek bir JVM argümanı güvenli mi? (saf, testli; launcher.cjs başlatmada da süzer) */
function isSafeJvmArg(token) {
    const t = String(token || '');
    return !UNSAFE_JVM_ARG.test(t) && !t.includes('\\\\') && !t.startsWith('//');
}

/** Java yolu: boş (otomatik) ya da java/javaw çalıştırılabiliri; ağ (UNC) yolu değil. */
function isValidJavaPath(p) {
    const s = String(p ?? '');
    if (s === '') return true;
    if (s.length > 400 || /^(\\\\|\/\/)/.test(s) || /[\r\n\0]/.test(s)) return false;
    return /^javaw?(\.exe)?$/i.test(path.basename(s.trim()));
}

const BOOL_KEYS = new Set(['fullscreen', 'rpcEnabled', 'checkUpdates', 'minimizeToTray', 'telemetryConsent', 'hsBetaChannel', 'onboarded']);
const SETTING_VALIDATORS = {
    language: (v) => v === 'tr' || v === 'en',
    accent: (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v),
    bgImage: (v) => typeof v === 'string' && /^[\w.-]{1,64}$/.test(v),
    ram: (v) => Number.isInteger(v) && v >= 1 && v <= 64,
    javaPath: (v) => typeof v === 'string' && isValidJavaPath(v),
    connectAddress: (v) => typeof v === 'string' && v.length <= 120 && /^[\w.:\-[\]]*$/.test(v),
    jvmPreset: (v) => ['balanced', 'lowram', 'zgc', 'custom'].includes(v),
    customJvmArgs: (v) => typeof v === 'string' && v.length <= 1000 && v.split(/\s+/).filter(Boolean).every(isSafeJvmArg),
};

/** settings:patch için yalnızca bilinen anahtarları ve geçerli değerleri geçirir (geçersiz değer yazılmaz). */
function sanitizeSettingsPatch(patch) {
    const clean = {};
    if (!patch || typeof patch !== 'object') return clean;
    for (const [key, value] of Object.entries(patch)) {
        if (!SETTING_KEYS.has(key)) continue;
        const ok = BOOL_KEYS.has(key) ? typeof value === 'boolean' : (SETTING_VALIDATORS[key] ? SETTING_VALIDATORS[key](value) : false);
        if (ok) clean[key] = value;
    }
    return clean;
}

/** servers:set için liste şemasını zorlar. Sunucu manifesti yalnızca https (ağdaki biri mod enjekte etmesin). */
function sanitizeServers(servers) {
    const crypto = require('crypto');
    return (Array.isArray(servers) ? servers : [])
        .slice(0, 20)
        .map((s) => ({
            id: String(s?.id || '').slice(0, 60) || crypto.randomUUID(),
            name: String(s?.name || '').slice(0, 60),
            address: String(s?.address || '').trim().slice(0, 120),
            favorite: s?.favorite === true,
            manifestUrl: /^https:\/\//.test(String(s?.manifestUrl || '')) ? String(s.manifestUrl).slice(0, 300) : '',
            addedAt: Number(s?.addedAt) || Date.now(),
        }))
        .filter((s) => s.address);
}

/**
 * Tek seferlik geçişler (saf, testli). alpha.7: eski varsayılan vurgu (#ff6a3d) yeni
 * varsayılana (Kiremit) taşınır — neredeyse herkes onu hiç değiştirmemişti. Başka renk
 * seçenlere dokunulmaz; geçiş bir kez çalışır (migrations.accentKiremit).
 */
function migrate(data) {
    const done = data.migrations || {};
    if (done.accentKiremit) return false;
    if (String(data.settings?.accent || '').toLowerCase() === '#ff6a3d') data.settings = { ...data.settings, accent: DEFAULTS.settings.accent };
    data.migrations = { ...done, accentKiremit: true };
    return true;
}

let instance = null;
function getStore() {
    if (!instance) {
        const { getRootPath } = require('./paths.cjs');
        instance = new Store(path.join(getRootPath(), 'config.json'), DEFAULTS);
        if (migrate(instance.data)) instance._save();
    }
    return instance;
}

module.exports = { getStore, Store, DEFAULTS, sanitizeSettingsPatch, sanitizeServers, migrate, isSafeJvmArg, isValidJavaPath };
