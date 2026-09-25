// Adres izin listeleri: tarayıcıda açılacak bağlantılar ve indirme host'ları.
// Desen biçimi: 'ornek.com' yalnızca kendisi, '*.ornek.com' yalnızca alt alan adları.
// Sunucudan gelen config (linkHosts/downloadHosts) varsa o, yoksa buradaki
// varsayılanlar geçerlidir (sözleşme §2).

// Sözleşmedeki linkHosts + launcher'ın kendi bağlantıları (sürüm notları, destek)
const DEFAULT_LINK_HOSTS = [
    'hardsetups.com', '*.hardsetups.com',
    'youtube.com', 'www.youtube.com', 'youtu.be',
    'discord.gg', 'discord.com',
    'modrinth.com',
    'github.com',
];

// Launcher'ın kendi sabit indirme listesi: Mojang, Java, loader'lar, Modrinth.
// HardSetups ürün dosyaları bunlara ek olarak config.downloadHosts'tan gelir.
const BASE_DOWNLOAD_HOSTS = [
    'piston-meta.mojang.com', 'piston-data.mojang.com', 'launchermeta.mojang.com',
    'launcher.mojang.com', 'libraries.minecraft.net', 'resources.download.minecraft.net',
    'api.adoptium.net', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com',
    'meta.fabricmc.net', 'maven.fabricmc.net',
    'cdn.modrinth.com',
];

function normalizeHost(host) {
    return String(host || '').toLowerCase().replace(/\.$/, '');
}

function hostMatches(host, patterns) {
    const h = normalizeHost(host);
    if (!h) return false;
    return (patterns || []).some((raw) => {
        const p = normalizeHost(raw);
        if (p.startsWith('*.')) return h.endsWith(p.slice(1)) && h.length > p.length - 1;
        return h === p;
    });
}

function parseHttpsUrl(url) {
    let u;
    try { u = new URL(String(url)); } catch { return null; }
    if (u.protocol !== 'https:') return null;
    if (u.username || u.password) return null; // https://hardsetups.com@kotu.site gibi hileler
    return u;
}

/** shell.openExternal'a gidebilir mi? Yalnızca https + izinli host. */
function isAllowedLink(url, patterns = DEFAULT_LINK_HOSTS) {
    const u = parseHttpsUrl(url);
    return !!u && hostMatches(u.hostname, patterns);
}

/**
 * İndirme adresi (ve her yönlendirme hedefi) kabul edilir mi?
 * allowLocalHttp yalnızca geliştirmedeki mock sunucu içindir (127.0.0.1/localhost).
 */
function isAllowedDownload(url, patterns, { allowLocalHttp = false } = {}) {
    let u;
    try { u = new URL(String(url)); } catch { return false; }
    if (u.username || u.password) return false;
    if (u.protocol === 'http:') {
        return allowLocalHttp && ['127.0.0.1', 'localhost'].includes(u.hostname);
    }
    return u.protocol === 'https:' && hostMatches(u.hostname, patterns);
}

module.exports = {
    DEFAULT_LINK_HOSTS, BASE_DOWNLOAD_HOSTS,
    hostMatches, isAllowedLink, isAllowedDownload,
};
