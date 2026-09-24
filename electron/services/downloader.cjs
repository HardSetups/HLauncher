// Doğrulamalı indirme çekirdeği (sözleşme §2, §7.3). Kurallar:
// - Yalnızca HTTPS ve izinli host; her yönlendirme hedefi de ayrıca denetlenir.
// - Dosya önce <ad>.part olarak iner; kopan indirme Range ile kaldığı yerden sürer.
// - sizeBytes ve sha256/sha512 doğrulanmadan dosya asla yerine konmaz (atomik rename).
// - Hash/boyut uyuşmazlığında bir kez baştan denenir, sonra açık hata.
// - Süresi dolan imzalı adres (403/410) için refreshUrl() ile taze adres alınır.
// - AbortSignal ile iptal: .part diskte kalır, sonraki denemede sürdürülür.
// İndirme isteğine yalnızca User-Agent ve Range gider; API başlıkları/token asla.
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { isAllowedDownload } = require('../lib/links.cjs');
const { USER_AGENT } = require('../lib/http.cjs');

const CONNECT_TIMEOUT_MS = 10 * 1000;
const IDLE_TIMEOUT_MS = 30 * 1000;
const MAX_REDIRECTS = 5;
const NETWORK_ATTEMPTS = 3;
const EXPIRED_STATUSES = new Set([401, 403, 410]);

const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(canceledError()); }, { once: true });
});

function canceledError() {
    return Object.assign(new Error('İndirme iptal edildi'), { code: 'ECANCELED' });
}

function codedError(code, message, extra = {}) {
    return Object.assign(new Error(message), { code, ...extra });
}

function hostOf(url) {
    try { return new URL(url).host; } catch { return '?'; }
}

/** Beklenen hash'lerle hasher listesi; sha256 her zaman hesaplanır (manifest için). */
function createHashers(expected) {
    const list = [{ name: 'sha256', hash: crypto.createHash('sha256'), expected: expected.sha256?.toLowerCase() || null }];
    if (expected.sha512) list.push({ name: 'sha512', hash: crypto.createHash('sha512'), expected: expected.sha512.toLowerCase() });
    return list;
}

/** Mevcut .part içeriğini hasher'lara besler (Range ile sürdürme öncesi). */
function feedExisting(file, hashers, signal) {
    return new Promise((resolve, reject) => {
        const stream = fs.createReadStream(file);
        const onAbort = () => { stream.destroy(); reject(canceledError()); };
        signal?.addEventListener('abort', onAbort, { once: true });
        stream.on('data', (chunk) => { for (const h of hashers) h.hash.update(chunk); });
        stream.on('error', reject);
        stream.on('end', () => { signal?.removeEventListener('abort', onAbort); resolve(); });
    });
}

/**
 * Tek istek: yönlendirmeleri izin listesine göre izler, yanıtı döndürür.
 * @returns {Promise<import('http').IncomingMessage>}
 */
function request(url, { headers, allowedHosts, allowLocalHttp, signal }, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(canceledError());
        if (!isAllowedDownload(url, allowedHosts, { allowLocalHttp })) {
            return reject(codedError('EHOSTNOTALLOWED', `İzin verilmeyen indirme adresi engellendi: ${hostOf(url)}`));
        }
        const proto = url.startsWith('https://') ? https : http;
        const req = proto.get(url, { headers: { 'User-Agent': USER_AGENT, ...headers } });
        let settled = false;
        const fail = (err) => { if (!settled) { settled = true; reject(err); } };
        const onAbort = () => { req.destroy(); fail(canceledError()); };
        signal?.addEventListener('abort', onAbort, { once: true });

        const connectTimer = setTimeout(() => req.destroy(codedError('ETIMEDOUT', `Bağlantı zaman aşımı: ${hostOf(url)}`)), CONNECT_TIMEOUT_MS);
        req.on('socket', (socket) => {
            const clear = () => clearTimeout(connectTimer);
            if (socket.connecting) socket.once(url.startsWith('https://') ? 'secureConnect' : 'connect', clear);
            else clear();
        });
        req.setTimeout(IDLE_TIMEOUT_MS, () => req.destroy(codedError('ETIMEDOUT', `Yanıt zaman aşımı: ${hostOf(url)}`)));
        req.on('error', (err) => { clearTimeout(connectTimer); fail(err); });
        req.on('response', (res) => {
            clearTimeout(connectTimer);
            signal?.removeEventListener('abort', onAbort);
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                res.resume();
                if (redirects >= MAX_REDIRECTS) return fail(codedError('EREDIRECT', 'Çok fazla yönlendirme'));
                let next;
                try { next = new URL(res.headers.location, url).toString(); } catch {
                    return fail(codedError('EREDIRECT', 'Geçersiz yönlendirme adresi'));
                }
                settled = true;
                return request(next, { headers, allowedHosts, allowLocalHttp, signal }, redirects + 1).then(resolve, reject);
            }
            settled = true;
            resolve(res);
        });
    });
}

/** Tek bir indirme denemesi: .part'a yazar (gerekirse sürdürür), hash'leri döndürür. */
async function attempt(url, partPath, expected, opts) {
    const { signal, onBytes } = opts;
    let offset = 0;
    try { offset = fs.statSync(partPath).size; } catch { offset = 0; }
    if (expected.size !== null && offset > expected.size) {
        fs.rmSync(partPath, { force: true });
        offset = 0;
    }

    let hashers = createHashers(expected);
    if (offset > 0) await feedExisting(partPath, hashers, signal);
    if (offset > 0 && expected.size !== null && offset === expected.size) {
        onBytes?.(offset);
        return { hashers, bytes: offset }; // önceki denemede tamamlanmış
    }

    const res = await request(url, {
        headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
        allowedHosts: opts.allowedHosts,
        allowLocalHttp: opts.allowLocalHttp,
        signal,
    });

    if (res.statusCode === 416) { // .part sunucudaki dosyayla uyuşmuyor: baştan
        res.resume();
        fs.rmSync(partPath, { force: true });
        throw codedError('ERESTART', 'Kısmi dosya geçersiz, baştan indiriliyor');
    }
    if (EXPIRED_STATUSES.has(res.statusCode)) {
        res.resume();
        throw codedError('EURLEXPIRED', `İndirme adresinin süresi dolmuş (HTTP ${res.statusCode})`, { statusCode: res.statusCode });
    }
    let append = false;
    if (res.statusCode === 206 && offset > 0) {
        const m = /^bytes (\d+)-/.exec(res.headers['content-range'] || '');
        if (!m || Number(m[1]) !== offset) {
            res.resume();
            fs.rmSync(partPath, { force: true });
            throw codedError('ERESTART', 'Sunucu farklı bir aralık gönderdi, baştan indiriliyor');
        }
        append = true;
    } else if (res.statusCode === 200) {
        if (offset > 0) hashers = createHashers(expected); // sunucu Range desteklemiyor: baştan
        offset = 0;
    } else {
        res.resume();
        throw codedError('EHTTP', `İndirme başarısız (HTTP ${res.statusCode})`, { statusCode: res.statusCode });
    }
    if (offset > 0) onBytes?.(offset);

    fs.mkdirSync(path.dirname(partPath), { recursive: true });
    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(partPath, { flags: append ? 'a' : 'w' });
        let written = offset;
        let failed = false;
        const abort = (err) => {
            if (failed) return;
            failed = true;
            res.destroy();
            out.destroy();
            reject(err);
        };
        const onAbort = () => abort(canceledError());
        signal?.addEventListener('abort', onAbort, { once: true });
        res.on('data', (chunk) => {
            written += chunk.length;
            if (expected.size !== null && written > expected.size) {
                return abort(codedError('ESIZEMISMATCH', 'Dosya beklenenden büyük geldi'));
            }
            for (const h of hashers) h.hash.update(chunk);
            onBytes?.(chunk.length);
        });
        res.on('error', abort);
        res.on('aborted', () => abort(codedError('ECONNRESET', 'Bağlantı koptu')));
        out.on('error', abort);
        res.pipe(out);
        out.on('finish', () => {
            signal?.removeEventListener('abort', onAbort);
            if (!failed) resolve();
        });
    });

    return { hashers, bytes: fs.statSync(partPath).size };
}

function verify({ hashers, bytes }, expected) {
    if (expected.size !== null && bytes !== expected.size) {
        throw codedError('ESIZEMISMATCH', `Dosya boyutu uyuşmuyor (${bytes}/${expected.size} bayt)`);
    }
    const digests = {};
    for (const h of hashers) {
        digests[h.name] = h.hash.digest('hex');
        if (h.expected && digests[h.name] !== h.expected) {
            throw codedError('EHASHMISMATCH', `${h.name.toUpperCase()} doğrulaması başarısız — dosya bozuk indi`);
        }
    }
    return digests;
}

/**
 * Tek dosyayı doğrulayarak indirir.
 * @param {{url: string, dest: string, sha256?: string, sha512?: string, sizeBytes?: string|number}} file
 * @param {{allowedHosts: string[], allowLocalHttp?: boolean, signal?: AbortSignal,
 *          onBytes?: (delta: number) => void, refreshUrl?: () => Promise<string>}} opts
 * @returns {Promise<{path: string, bytes: number, sha256: string, sha512?: string}>}
 */
async function downloadVerified(file, opts) {
    if (!file.sha256 && !file.sha512) throw codedError('ENOHASH', 'Hash bilgisi olmayan dosya indirilmez');
    const expected = {
        sha256: file.sha256 || null,
        sha512: file.sha512 || null,
        size: file.sizeBytes === undefined || file.sizeBytes === null ? null : Number(file.sizeBytes),
    };
    if (expected.size !== null && !(Number.isSafeInteger(expected.size) && expected.size >= 0)) {
        throw codedError('EBADSIZE', 'Geçersiz dosya boyutu');
    }
    const partPath = `${file.dest}.part`;
    let url = file.url;
    let hashRetried = false;
    let urlRefreshed = 0;
    let networkFailures = 0;

    for (;;) {
        if (opts.signal?.aborted) throw canceledError();
        // İlerleme sayacı her denemede .part boyutundan yeniden kurulur
        let counted = 0;
        const onBytes = (d) => { counted += d; opts.onBytes?.(d); };
        try {
            const result = await attempt(url, partPath, expected, { ...opts, onBytes });
            const digests = verify(result, expected);
            fs.mkdirSync(path.dirname(file.dest), { recursive: true });
            fs.renameSync(partPath, file.dest);
            return { path: file.dest, bytes: result.bytes, ...digests };
        } catch (err) {
            if (counted) opts.onBytes?.(-counted); // bu denemenin ilerlemesini geri al
            if (err.code === 'ECANCELED') throw err;
            if (err.code === 'EHASHMISMATCH' || err.code === 'ESIZEMISMATCH') {
                fs.rmSync(partPath, { force: true });
                if (hashRetried) throw err;
                hashRetried = true;
                continue;
            }
            if (err.code === 'ERESTART') continue;
            if (err.code === 'EURLEXPIRED' && opts.refreshUrl && urlRefreshed < 2) {
                urlRefreshed++;
                url = await opts.refreshUrl();
                continue;
            }
            const permanent = ['EHOSTNOTALLOWED', 'EURLEXPIRED'].includes(err.code) || (err.code === 'EHTTP' && err.statusCode < 500);
            if (permanent) throw err;
            networkFailures++;
            if (networkFailures >= NETWORK_ATTEMPTS) throw err;
            await sleep(networkFailures * 1500, opts.signal);
        }
    }
}

/**
 * İşleri en çok `concurrency` paralel çalıştırır. Biri başarısız olursa
 * kalanlar iptal edilir ve ilk hata fırlatılır.
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, signal: AbortSignal) => Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function runQueue(items, worker, { concurrency = 4, signal } = {}) {
    const inner = new AbortController();
    const forward = () => inner.abort();
    signal?.addEventListener('abort', forward, { once: true });
    const results = new Array(items.length);
    let next = 0;
    let firstError = null;

    const lane = async () => {
        while (!firstError && !inner.signal.aborted && next < items.length) {
            const index = next++;
            try {
                results[index] = await worker(items[index], inner.signal);
            } catch (err) {
                if (!firstError) firstError = err;
                inner.abort();
            }
        }
    };
    try {
        await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
    } finally {
        signal?.removeEventListener('abort', forward);
    }
    if (firstError) throw firstError;
    if (signal?.aborted) throw canceledError();
    return results;
}

module.exports = { downloadVerified, runQueue, canceledError };
