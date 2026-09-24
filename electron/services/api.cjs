// HardSetups API istemcisi (sözleşme §0). HardSetups'a giden her istek buradan
// geçer; renderer bu istemciyi görmez, token'lar ana süreçte kalır.
// - Başlıklar (User-Agent, X-HL-Version, X-HL-Device, Accept-Language) ve
//   Authorization yalnızca API host'una gider (indirmeler downloader.cjs'te).
// - Hata gövdesi {error:{code,message,details,requestId}} → ApiError.
// - 401 ACCESS_TOKEN_EXPIRED: oturum bir kez (tek uçuşlu) yenilenir, istek bir kez tekrarlanır.
// - 401 DEVICE_REVOKED / REFRESH_TOKEN_INVALID: oturum kapatılır.
// - 426 → 'outdated', 503 MAINTENANCE_MODE → 'maintenance' olayı.
// - 429: Retry-After kadar beklenir (en çok 30 sn); GET'ler ağ/5xx hatasında 3 kez denenir.
const os = require('os');
const crypto = require('crypto');

const DEFAULT_BASE = 'https://api.hardsetups.com';
const RESPONSE_TIMEOUT_MS = 30 * 1000;
const GET_ATTEMPTS = 3;
const MAX_RETRY_AFTER_S = 30;
const SIGN_OUT_CODES = new Set(['DEVICE_REVOKED', 'REFRESH_TOKEN_INVALID']);

class ApiError extends Error {
    constructor({ status = 0, code = 'NETWORK', message = '', details = {}, requestId = null } = {}) {
        super(message || code);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details || {};
        this.requestId = requestId;
    }

    /** Renderer'a gidebilecek güvenli özet (token/gövde içermez). */
    toJSON() {
        return { status: this.status, code: this.code, message: this.message, details: this.details, requestId: this.requestId };
    }
}

/**
 * API taban adresini doğrular: https zorunlu; http yalnızca geliştirmede yerel
 * sunucu (127.0.0.1/localhost) için.
 */
function resolveBaseUrl(raw, { allowLocalHttp = false } = {}) {
    let u;
    try { u = new URL(raw || DEFAULT_BASE); } catch { u = new URL(DEFAULT_BASE); }
    const local = ['127.0.0.1', 'localhost'].includes(u.hostname);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && local && allowLocalHttp)) {
        return u.origin;
    }
    return DEFAULT_BASE;
}

function userAgent(appVersion) {
    const osName = process.platform === 'win32' ? 'Windows' : process.platform;
    return `HLauncher/${appVersion} (${osName} ${os.release()}; ${process.arch})`;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} o
 * @param {string} o.baseUrl
 * @param {string} o.appVersion
 * @param {() => string} o.getInstallId  X-HL-Device (kurulum kimliği, donanım değil)
 * @param {() => string} [o.getLanguage] 'tr' | 'en'
 * @param {{getAccessToken: () => Promise<string|null>, refresh: (failedToken: string) => Promise<string|null>, signOut: (reason: string) => void}} [o.session]
 * @param {(type: string, payload: object) => void} [o.onEvent]
 */
function createApiClient({ baseUrl, appVersion, getInstallId, getLanguage = () => 'tr', session = null, onEvent = () => {}, fetchImpl = globalThis.fetch, sleep = defaultSleep }) {
    const base = baseUrl.replace(/\/+$/, '');

    function headersFor({ token, body, idempotencyKey, etag }) {
        const h = {
            'User-Agent': userAgent(appVersion),
            'X-HL-Version': appVersion,
            'X-HL-Device': getInstallId(),
            'Accept-Language': getLanguage() === 'en' ? 'en' : 'tr',
            Accept: 'application/json',
        };
        if (body !== undefined) h['Content-Type'] = 'application/json';
        if (token) h.Authorization = `Bearer ${token}`;
        if (idempotencyKey) h['Idempotency-Key'] = idempotencyKey;
        if (etag) h['If-None-Match'] = etag;
        return h;
    }

    async function parseError(res) {
        let payload = null;
        try { payload = await res.json(); } catch { /* gövdesiz hata */ }
        const e = payload?.error || {};
        const details = { ...(e.details || {}) };
        if (res.status === 429) {
            const header = Number(res.headers.get('retry-after'));
            details.retryAfterSeconds = details.retryAfterSeconds ?? (Number.isFinite(header) ? header : 1);
        }
        return new ApiError({
            status: res.status,
            code: e.code || `HTTP_${res.status}`,
            message: e.message || `Sunucu hatası (HTTP ${res.status})`,
            details,
            requestId: e.requestId || res.headers.get('x-request-id') || null,
        });
    }

    /**
     * @param {'GET'|'POST'} method
     * @param {string} path '/v1/launcher/...'
     * @param {{body?: object, auth?: 'required'|'optional'|'none', idempotencyKey?: string|true, etag?: string, signal?: AbortSignal}} [opts]
     * @returns {Promise<{status: number, data: any, etag: string|null, date: string|null, notModified: boolean}>}
     */
    async function request(method, path, opts = {}) {
        const { body, auth = 'required', etag, signal } = opts;
        const idempotencyKey = opts.idempotencyKey === true ? crypto.randomUUID() : opts.idempotencyKey;
        const retriable = method === 'GET' || !!idempotencyKey;
        let refreshed = false;
        let attempt = 0;

        for (;;) {
            attempt++;
            let token = null;
            if (auth !== 'none' && session) token = await session.getAccessToken();
            if (auth === 'required' && !token) {
                throw new ApiError({ status: 401, code: 'NOT_SIGNED_IN', message: 'HardSetups hesabına bağlı değilsin' });
            }

            let res;
            try {
                const timeout = AbortSignal.timeout(RESPONSE_TIMEOUT_MS);
                res = await fetchImpl(`${base}${path}`, {
                    method,
                    headers: headersFor({ token, body, idempotencyKey, etag }),
                    body: body === undefined ? undefined : JSON.stringify(body),
                    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
                    redirect: 'error', // API yönlendirmesi beklenmez; token başka host'a taşınmasın
                });
            } catch (err) {
                if (signal?.aborted) throw new ApiError({ code: 'CANCELED', message: 'İstek iptal edildi' });
                const netErr = new ApiError({ code: 'NETWORK', message: 'HardSetups sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.' });
                netErr.cause = err;
                if (retriable && attempt < GET_ATTEMPTS) { await sleep(500 * 3 ** (attempt - 1)); continue; }
                throw netErr;
            }

            if (res.status === 304) return { status: 304, data: null, etag: res.headers.get('etag'), date: res.headers.get('date'), notModified: true };
            if (res.ok) {
                const text = res.status === 204 ? '' : await res.text();
                let data = null;
                if (text) {
                    try { data = JSON.parse(text); } catch { throw new ApiError({ status: res.status, code: 'BAD_RESPONSE', message: 'Sunucudan geçersiz yanıt geldi' }); }
                }
                return { status: res.status, data, etag: res.headers.get('etag'), date: res.headers.get('date'), notModified: false };
            }

            const err = await parseError(res);
            if (res.status === 401 && err.code === 'ACCESS_TOKEN_EXPIRED' && token && session && !refreshed) {
                refreshed = true;
                const next = await session.refresh(token);
                if (next) continue;
            }
            if (res.status === 401 && SIGN_OUT_CODES.has(err.code) && session) session.signOut(err.code);
            if (res.status === 426) onEvent('outdated', { minVersion: err.details.minVersion || null });
            if (res.status === 503 && err.code === 'MAINTENANCE_MODE') onEvent('maintenance', { message: err.details.message || err.message, scheduledEnd: err.details.scheduledEnd || null });
            if (res.status === 429 && retriable && attempt < GET_ATTEMPTS) {
                await sleep(Math.min(Number(err.details.retryAfterSeconds) || 1, MAX_RETRY_AFTER_S) * 1000);
                continue;
            }
            if (res.status >= 500 && method === 'GET' && attempt < GET_ATTEMPTS && err.code !== 'MAINTENANCE_MODE') {
                await sleep(500 * 3 ** (attempt - 1));
                continue;
            }
            throw err;
        }
    }

    return {
        base,
        request,
        get: (path, opts) => request('GET', path, opts),
        post: (path, body, opts = {}) => request('POST', path, { ...opts, body }),
    };
}

module.exports = { createApiClient, resolveBaseUrl, ApiError, userAgent, DEFAULT_BASE };
