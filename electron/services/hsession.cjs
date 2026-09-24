// HardSetups hesap oturumu (sözleşme §1): cihaz kodu girişi, token saklama ve
// tek uçuşlu yenileme. Saf mantık; ağ `transport`, disk `storage` ile verilir
// (testlerde bellek içi karşılıkları kullanılır).
//
// Kurallar:
// - Erişim token'ı yalnızca bellekte. Yenileme token'ı storage'a şifreli yazılır;
//   şifreleme yoksa storage hiç yazmaz, oturum bellekte yaşar.
// - Yenileme TEK UÇUŞLU: aynı anda gelen tüm istekler aynı sonucu bekler.
// - Yeni yenileme token'ı, erişim token'ı kullanılmadan ÖNCE diske yazılır.
// - Süresinin %80'i dolan erişim token'ı erkenden yenilenir; yenileme ağ
//   yüzünden olmazsa hâlâ geçerli olan token kullanılmaya devam eder.
// - DEVICE_REVOKED / REFRESH_TOKEN_INVALID → oturum silinir.

const SIGN_OUT_CODES = new Set(['DEVICE_REVOKED', 'REFRESH_TOKEN_INVALID']);
const EARLY_REFRESH_RATIO = 0.8;

const defaultSleep = (ms, isCanceled) => new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
        if (isCanceled() || Date.now() - started >= ms) return resolve();
        setTimeout(tick, Math.min(250, ms));
    };
    tick();
});

/**
 * @param {object} o
 * @param {{load: () => ({refreshToken: string, deviceId: string, user: object}|null), save: (s: object) => boolean, clear: () => void}} o.storage
 * @param {(event: {signedIn: boolean, user: object|null, reason?: string}) => void} [o.onChange]
 * @param {() => number} [o.now]
 */
function createSession({ storage, onChange = () => {}, now = Date.now, sleep = defaultSleep }) {
    /** @type {(path: string, body: object, auth?: string) => Promise<{data: any}>} */
    let transport = null;
    let access = null; // { token, expiresAt, refreshAt }
    let inflight = null;

    const saved = safeLoad();
    let refreshToken = saved?.refreshToken || null;
    let deviceId = saved?.deviceId || null;
    let user = saved?.user || null;

    function safeLoad() {
        try { return storage.load(); } catch { return null; }
    }

    function setAccess(token, expiresInSeconds) {
        const ttl = Math.max(1, Number(expiresInSeconds) || 900) * 1000;
        const t = now();
        access = { token, expiresAt: t + ttl, refreshAt: t + ttl * EARLY_REFRESH_RATIO };
    }

    function persist() {
        try { storage.save({ refreshToken, deviceId, user }); } catch { /* disk hatası: oturum bellekte sürer */ }
    }

    const isSignedIn = () => !!refreshToken || !!(access && now() < access.expiresAt);
    const snapshot = () => ({ signedIn: isSignedIn(), user: user ? { ...user } : null });

    function signOut(reason = 'logout') {
        const wasSignedIn = isSignedIn() || !!user;
        access = null;
        refreshToken = null;
        deviceId = null;
        user = null;
        try { storage.clear(); } catch { /* dosya yoksa geç */ }
        if (wasSignedIn) onChange({ ...snapshot(), reason });
    }

    /** Tek uçuşlu yenileme. failedToken: 401 alan istekteki token (eşzamanlı yenilemeyi tekrarlamamak için). */
    function refresh(failedToken = null) {
        if (inflight) return inflight;
        if (failedToken && access && access.token !== failedToken && now() < access.expiresAt) {
            return Promise.resolve(access.token); // başka bir istek zaten yeniledi
        }
        if (!refreshToken) return Promise.resolve(null);
        const used = refreshToken;
        inflight = (async () => {
            try {
                const { data } = await transport('/v1/launcher/token/refresh', { refreshToken: used }, 'none');
                refreshToken = data.refreshToken;
                persist(); // önce disk (§1.4), sonra kullanım
                setAccess(data.accessToken, data.accessTokenExpiresIn);
                return access.token;
            } catch (err) {
                if (err?.status === 401 && SIGN_OUT_CODES.has(err.code)) {
                    signOut(err.code);
                    return null;
                }
                throw err;
            } finally {
                inflight = null;
            }
        })();
        return inflight;
    }

    async function getAccessToken() {
        if (access && now() < access.refreshAt) return access.token;
        if (!refreshToken) return access && now() < access.expiresAt ? access.token : null;
        try {
            return await refresh(access?.token || null);
        } catch (err) {
            // Erken yenileme ağ yüzünden başarısızsa süresi dolmamış token'la devam
            if (access && now() < access.expiresAt) return access.token;
            throw err;
        }
    }

    /**
     * Cihaz kodu akışını başlatır (§1.1–1.2). deviceCode yalnızca burada kalır.
     * @returns {Promise<{userCode: string, verificationUri: string, verificationUriComplete: string, expiresIn: number,
     *   cancel: () => void, done: Promise<{state: 'success'|'denied'|'expired'|'canceled'|'error', user?: object, error?: object}>}>}
     */
    async function startDeviceLogin(clientInfo) {
        const { data } = await transport('/v1/launcher/device/code', clientInfo, 'none');
        const deviceCode = data.deviceCode;
        let interval = Math.max(1, Number(data.interval) || 5);
        const expiresAt = now() + (Number(data.expiresIn) || 600) * 1000;
        let canceled = false;

        const done = (async () => {
            for (;;) {
                await sleep(interval * 1000, () => canceled);
                if (canceled) return { state: 'canceled' };
                if (now() > expiresAt) return { state: 'expired' };
                try {
                    const { data: tok } = await transport('/v1/launcher/device/token', { deviceCode }, 'none');
                    // Onaylandıysa iptal edilmiş olsa bile oturumu kur: sunucuda cihaz zaten oluştu
                    refreshToken = tok.refreshToken;
                    deviceId = tok.deviceId || null;
                    user = tok.user || null;
                    persist();
                    setAccess(tok.accessToken, tok.accessTokenExpiresIn);
                    onChange(snapshot());
                    return { state: 'success', user: { ...user } };
                } catch (err) {
                    const code = err?.code;
                    if (code === 'AUTHORIZATION_PENDING') {
                        if (err.details?.interval) interval = Math.max(1, Number(err.details.interval));
                        continue;
                    }
                    if (code === 'SLOW_DOWN') {
                        interval = Number(err.details?.interval) || interval + 5;
                        continue;
                    }
                    if (code === 'ACCESS_DENIED') return { state: 'denied' };
                    if (code === 'EXPIRED_TOKEN') return { state: 'expired' };
                    if (code === 'NETWORK' || err?.status === 429 || err?.status >= 500) continue; // geçici
                    return { state: 'error', error: typeof err?.toJSON === 'function' ? err.toJSON() : { message: String(err?.message || err) } };
                }
            }
        })();

        return {
            userCode: data.userCode,
            verificationUri: data.verificationUri,
            verificationUriComplete: data.verificationUriComplete,
            expiresIn: Number(data.expiresIn) || 600,
            cancel: () => { canceled = true; },
            done,
        };
    }

    async function logout() {
        if (isSignedIn()) {
            try { await transport('/v1/launcher/logout', {}, 'required'); } catch { /* yanıt ne olursa olsun yerel oturum silinir (§1.5) */ }
        }
        signOut('logout');
    }

    return {
        setTransport: (fn) => { transport = fn; },
        getAccessToken,
        refresh,
        signOut,
        logout,
        startDeviceLogin,
        snapshot,
        isSignedIn,
        getDeviceId: () => deviceId,
    };
}

/** Bellek içi depolama (testler ve şifreleme olmayan makineler için). */
function createMemoryStorage(initial = null) {
    let data = initial;
    return {
        load: () => data,
        save: (s) => { data = { ...s }; return true; },
        clear: () => { data = null; },
        peek: () => data,
    };
}

module.exports = { createSession, createMemoryStorage };
