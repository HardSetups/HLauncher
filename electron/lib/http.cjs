// HTTP yardımcıları: yönlendirme takibi, zaman aşımı ve ortak User-Agent ile
// akış / metin / JSON indirme. Tüm ağ erişimi bu modülden geçer.
const https = require('https');
const http = require('http');

const USER_AGENT = 'HLauncher/1.0';
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT = 20000;
const MAX_TEXT_BYTES = 10 * 1024 * 1024; // JSON/metin yanıtları için üst sınır

/**
 * Yönlendirmeleri çözerek 200 dönen yanıt akışını verir.
 * @returns {Promise<import('http').IncomingMessage>}
 */
function httpGetStream(url, { timeout = DEFAULT_TIMEOUT, headers = {} } = {}, _redirects = 0) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (err) => { if (!settled) { settled = true; reject(err); } };

        const proto = url.startsWith('https://') ? https : http;
        const req = proto.get(url, { headers: { 'User-Agent': USER_AGENT, ...headers } }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                res.resume();
                if (_redirects >= MAX_REDIRECTS) return fail(new Error(`Çok fazla yönlendirme: ${url}`));
                let next;
                try { next = new URL(res.headers.location, url).toString(); }
                catch { return fail(new Error(`Geçersiz yönlendirme adresi: ${res.headers.location}`)); }
                settled = true;
                return httpGetStream(next, { timeout, headers }, _redirects + 1).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                const err = new Error(`HTTP ${res.statusCode}`);
                err.statusCode = res.statusCode;
                err.url = url;
                return fail(err);
            }
            settled = true;
            resolve(res);
        });
        req.setTimeout(timeout, () => {
            req.destroy(Object.assign(new Error(`Zaman aşımı: ${url}`), { code: 'ETIMEDOUT' }));
        });
        req.on('error', fail);
    });
}

async function httpGetText(url, opts = {}) {
    const res = await httpGetStream(url, opts);
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        res.on('data', (c) => {
            size += c.length;
            if (size > MAX_TEXT_BYTES) {
                res.destroy();
                return reject(new Error(`Yanıt çok büyük: ${url}`));
            }
            chunks.push(c);
        });
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
    });
}

async function httpGetJson(url, opts = {}) {
    const text = await httpGetText(url, opts);
    try { return JSON.parse(text); }
    catch { throw new Error(`Geçersiz JSON yanıtı: ${url}`); }
}

/** JSON gövdeli POST; JSON yanıt döndürür. */
function httpPostJson(url, body, { timeout = DEFAULT_TIMEOUT } = {}) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const u = new URL(url);
        const proto = u.protocol === 'https:' ? https : http;
        const req = proto.request(u, {
            method: 'POST',
            headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { statusCode: res.statusCode, url }));
            }
            let size = 0;
            const chunks = [];
            res.on('data', (c) => {
                size += c.length;
                if (size > MAX_TEXT_BYTES) { res.destroy(); return reject(new Error(`Yanıt çok büyük: ${url}`)); }
                chunks.push(c);
            });
            res.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
                catch { reject(new Error(`Geçersiz JSON yanıtı: ${url}`)); }
            });
            res.on('error', reject);
        });
        req.setTimeout(timeout, () => {
            req.destroy(Object.assign(new Error(`Zaman aşımı: ${url}`), { code: 'ETIMEDOUT' }));
        });
        req.on('error', reject);
        req.end(payload);
    });
}

module.exports = { httpGetStream, httpGetText, httpGetJson, httpPostJson, USER_AGENT };
