// HardSetups resim önbelleği (sözleşme §2 "Resimler"): renderer sunucunun verdiği
// resim adresini doğrudan yüklemez; `hlimg://c/<base64url(adres)>` ister, ana süreç:
//   - adresin host'u izinli listede mi (config.imageHosts) → değilse 404
//   - yalnızca https (geliştirmede yerel http), yönlendirme yok, en çok 5 MB
//   - yanıt gerçekten resim mi (PNG/JPEG/GIF/WebP/AVIF imzası) → değilse reddedilir
//   - <veri kökü>\cache\img\<sha256(adres)> olarak saklanır; ağ yoksa bayat kopya verilir
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEME = 'hlimg';
const MAX_BYTES = 5 * 1024 * 1024;
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 15 * 1000;

/** İçerik imzasından resim türü (saf, testli); resim değilse null. */
function sniffImageType(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    if (buf.toString('ascii', 4, 12) === 'ftypavif') return 'image/avif';
    return null;
}

function encodeImageUrl(url) {
    return `${SCHEME}://c/${Buffer.from(String(url), 'utf8').toString('base64url')}`;
}

function decodeImageUrl(requestUrl) {
    const m = /^hlimg:\/\/c\/([A-Za-z0-9_-]{1,4000})$/.exec(String(requestUrl));
    if (!m) return null;
    try { return Buffer.from(m[1], 'base64url').toString('utf8'); } catch { return null; }
}

/**
 * @param {object} o
 * @param {string} o.cacheDir
 * @param {(host: string, protocol: string) => boolean} o.isAllowed izinli host denetimi
 * @param {typeof fetch} [o.fetchImpl]
 */
function createImageCache({ cacheDir, isAllowed, fetchImpl = globalThis.fetch, log }) {
    const inflight = new Map();

    async function fetchFresh(url, file) {
        const res = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'image/*' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const len = Number(res.headers.get('content-length'));
        if (len && len > MAX_BYTES) throw new Error('resim çok büyük');
        const chunks = [];
        let size = 0;
        for await (const chunk of res.body) {
            size += chunk.length;
            if (size > MAX_BYTES) throw new Error('resim çok büyük');
            chunks.push(chunk);
        }
        const buf = Buffer.concat(chunks);
        if (!sniffImageType(buf)) throw new Error('resim değil');
        fs.mkdirSync(cacheDir, { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, file);
        return buf;
    }

    /** @returns {Promise<{status: number, type?: string, body?: Buffer}>} */
    async function get(url) {
        let u;
        try { u = new URL(url); } catch { return { status: 400 }; }
        if (!isAllowed(u.hostname, u.protocol)) return { status: 404 };
        const file = path.join(cacheDir, crypto.createHash('sha256').update(u.href).digest('hex'));
        let cached = null;
        try {
            const st = fs.statSync(file);
            cached = { buf: fs.readFileSync(file), fresh: Date.now() - st.mtimeMs < FRESH_MS };
        } catch { /* önbellekte yok */ }
        if (cached?.fresh) return { status: 200, type: sniffImageType(cached.buf), body: cached.buf };

        if (!inflight.has(file)) inflight.set(file, fetchFresh(u.href, file).finally(() => inflight.delete(file)));
        try {
            const buf = await inflight.get(file);
            return { status: 200, type: sniffImageType(buf), body: buf };
        } catch (err) {
            if (cached) return { status: 200, type: sniffImageType(cached.buf), body: cached.buf }; // bayat ama var
            log?.info(`[IMG] Resim alınamadı (${u.host}): ${err.message}`);
            return { status: 404 };
        }
    }

    return { get };
}

module.exports = { SCHEME, createImageCache, encodeImageUrl, decodeImageUrl, sniffImageType };
