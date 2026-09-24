// Sunucudan (API, manifest, arşiv) gelen göreli yolları güvenle diske çevirir.
// Tek kural: sonuç her zaman verilen kök klasörün İÇİNDE kalır. Windows'a özgü
// kaçış yolları (sürücü harfi, UNC, \\?\, ADS ':' akışı, CON/NUL gibi ayrılmış
// adlar, sonda nokta/boşluk) açıkça reddedilir — normalize etmek yetmez.
const path = require('path');

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[<>"|?*\x00-\x1f]/;
const MAX_LENGTH = 240;

/**
 * Göreli yolu doğrular ve '/' ayraçlı normal biçimini döndürür.
 * Geçersizse Error fırlatır (code: 'EUNSAFEPATH').
 * @param {string} rel
 * @param {{allowDir?: boolean}} [opts] allowDir: sondaki '/' kabul edilir (dizin öneki)
 */
function normalizeRelative(rel, { allowDir = false } = {}) {
    const fail = (why) => {
        throw Object.assign(new Error(`Güvensiz yol reddedildi (${why}): ${String(rel).slice(0, 80)}`), { code: 'EUNSAFEPATH' });
    };
    if (typeof rel !== 'string' || !rel) fail('boş');
    if (rel.length > MAX_LENGTH) fail('çok uzun');
    if (BAD_CHARS.test(rel)) fail('geçersiz karakter');
    if (rel.includes(':')) fail('sürücü harfi ya da ADS');
    const unified = rel.replace(/\\/g, '/');
    if (unified.startsWith('/')) fail('mutlak yol / UNC');
    const isDir = unified.endsWith('/');
    if (isDir && !allowDir) fail('dosya bekleniyordu');

    const clean = [];
    for (const seg of unified.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') fail('üst dizine çıkış');
        if (/[. ]$/.test(seg)) fail('sonda nokta ya da boşluk');
        if (RESERVED.test(seg)) fail('ayrılmış ad');
        clean.push(seg);
    }
    if (!clean.length) fail('boş');
    return clean.join('/') + (isDir ? '/' : '');
}

/** Kökün içinde kaldığı kanıtlanmış mutlak yol. */
function safeJoin(baseDir, rel) {
    const normalized = normalizeRelative(rel, { allowDir: true });
    const base = path.resolve(baseDir);
    const full = path.resolve(base, normalized);
    const baseCmp = process.platform === 'win32' ? base.toLowerCase() : base;
    const fullCmp = process.platform === 'win32' ? full.toLowerCase() : full;
    if (fullCmp !== baseCmp && !fullCmp.startsWith(baseCmp + path.sep)) {
        throw Object.assign(new Error(`Güvensiz yol reddedildi (kök dışı): ${normalized}`), { code: 'EUNSAFEPATH' });
    }
    return full;
}

/** Örnek klasörü adı (API'nin instance.folderName alanı) — sözleşme §7.1. */
function isValidFolderName(name) {
    return typeof name === 'string' && /^[a-z0-9][a-z0-9-]{1,47}$/.test(name) && !RESERVED.test(name);
}

module.exports = { normalizeRelative, safeJoin, isValidFolderName };
