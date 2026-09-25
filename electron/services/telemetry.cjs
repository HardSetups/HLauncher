// Kullanım sayaçları (sözleşme §15). Yalnızca İKİ koşul birden tutarken çalışır:
// sunucu config.features.telemetry === true VE oyuncu Ayarlar'da ayrıca onay vermiş
// (varsayılan kapalı). Olaylar bellekte (tür, ürün) başına sayılır ve toplu gönderilir;
// koşul kalkınca biriken sayılar atılır.
// Kişisel veri yok: istek anonimdir (token ve kurulum kimliği gitmez); yalnızca olay türü,
// ürün kodu, launcher sürümü, işletim sistemi ve sayı gider.
const TYPES = new Set(['launch', 'launch_failed', 'crash', 'install', 'install_failed']);
const MAX_EVENTS_PER_REQUEST = 100;
const MAX_COUNT_PER_EVENT = 1000;
const MAX_KEYS = 200; // bellekte en çok bu kadar farklı (tür, ürün) çifti
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,80}$/;

const osName = (platform = process.platform) => (platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux');

/**
 * @param {object} o
 * @param {(body: {events: object[]}) => Promise<unknown>} o.post  anonim POST /v1/launcher/telemetry
 * @param {() => boolean} o.isEnabled  sunucu açık VE oyuncu onaylı mı (her çağrıda yeniden sorulur)
 * @param {string} o.launcherVersion
 * @param {string} [o.platform]
 * @param {{info: Function}} [o.log]
 */
function createTelemetry({ post, isEnabled, launcherVersion, platform = process.platform, log = { info() {} } }) {
    const counts = new Map(); // "tür|ürün" → sayı
    let flushing = null;

    /** Olayı say; koşul yoksa hiçbir şey tutulmaz. */
    function record(type, product = null) {
        if (!TYPES.has(type) || !isEnabled()) return false;
        const slug = typeof product === 'string' && SLUG_RE.test(product) ? product : '';
        const key = `${type}|${slug}`;
        if (!counts.has(key) && counts.size >= MAX_KEYS) return false;
        counts.set(key, Math.min((counts.get(key) || 0) + 1, 1e6));
        return true;
    }

    /** Sayıları sözleşme olaylarına çevirir (bir olay en çok 1000 sayar). */
    function toEvents(map) {
        const os = osName(platform);
        const events = [];
        for (const [key, total] of map) {
            const [type, slug] = key.split('|');
            for (let left = total; left > 0; left -= MAX_COUNT_PER_EVENT) {
                events.push({ type, product: slug || null, launcherVersion, os, count: Math.min(left, MAX_COUNT_PER_EVENT) });
            }
        }
        return events;
    }

    function restore(events) {
        for (const e of events) {
            const key = `${e.type}|${e.product || ''}`;
            if (!counts.has(key) && counts.size >= MAX_KEYS) continue;
            counts.set(key, Math.min((counts.get(key) || 0) + e.count, 1e6));
        }
    }

    /** Birikenleri gönderir; hata olursa gönderilemeyenler bir sonraki denemeye kalır. */
    function flush() {
        if (flushing) return flushing;
        flushing = (async () => {
            if (!counts.size) return 0;
            if (!isEnabled()) { counts.clear(); return 0; }
            const events = toEvents(counts);
            counts.clear();
            let sent = 0;
            for (let i = 0; i < events.length; i += MAX_EVENTS_PER_REQUEST) {
                const batch = events.slice(i, i + MAX_EVENTS_PER_REQUEST);
                try {
                    await post({ events: batch });
                    sent += batch.length;
                } catch (err) {
                    restore(events.slice(i));
                    log.info(`[TELEMETRY] Gönderilemedi, sonra denenecek: ${err?.code || err?.message || err}`);
                    break;
                }
            }
            return sent;
        })().finally(() => { flushing = null; });
        return flushing;
    }

    return { record, flush, pending: () => counts.size };
}

module.exports = { createTelemetry, TYPES, osName };
