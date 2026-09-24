// HardSetups portalının ana süreç tarafı: başlangıç ayarları (config), hesap
// oturumu, cihaz kodu girişi, hesap özeti (/me) ve sunucunun verdiği bağlantılar.
// Renderer yalnızca publicState() özetini görür: token, deviceCode ya da
// yenileme token'ı asla renderer'a gitmez.
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createApiClient, resolveBaseUrl } = require('./api.cjs');
const { createSession } = require('./hsession.cjs');
const { createEncryptedFileStorage } = require('./session-file.cjs');
const { compareVersions } = require('../lib/semver.cjs');
const { DEFAULT_LINK_HOSTS, BASE_DOWNLOAD_HOSTS } = require('../lib/links.cjs');

const CONFIG_RETRY_MS = 5 * 60 * 1000;
const ME_MIN_INTERVAL_MS = 60 * 1000;
// Renderer'ın açtırabileceği bağlantı türleri (IPC girdisi bu listeyle sınırlı)
const LINK_KINDS = new Set(['account', 'wallet', 'topup', 'devices', 'licenses', 'site', 'store', 'support', 'launcher']);

/**
 * @param {object} o
 * @param {Electron.App} o.app
 * @param {{get: Function, set: Function}} o.store
 * @param {string} o.dataRoot
 * @param {object} o.log
 * @param {(url: string, hosts: string[]) => boolean} o.openExternal izin listesiyle açar
 * @param {(channel: string, payload: object) => void} o.send renderer'a olay
 */
function createPortal({ app, store, dataRoot, log, openExternal, send }) {
    const isDev = !app.isPackaged;
    const baseUrl = resolveBaseUrl(process.env.HL_API_BASE, { allowLocalHttp: isDev });
    const appVersion = app.getVersion();

    // X-HL-Device: ilk açılışta üretilen rastgele kurulum kimliği (donanım kimliği değil)
    let installId = store.get('installId');
    if (typeof installId !== 'string' || !/^[0-9a-f-]{36}$/.test(installId)) {
        installId = crypto.randomUUID();
        store.set('installId', installId);
    }

    const state = {
        config: null,
        maintenance: null, // { message, scheduledEnd }
        outdated: null,    // { minVersion }
        me: null,
        lastError: null,
    };
    let loginFlow = null; // { verificationUriComplete, cancel }
    let meFetchedAt = 0;
    let configTimer = null;

    const emitState = () => send('portal:state', publicState());

    const session = createSession({
        storage: createEncryptedFileStorage(path.join(dataRoot, 'hardsetups-session.json'), { log }),
        onChange: (e) => {
            if (!e.signedIn) {
                state.me = null;
                if (e.reason && e.reason !== 'logout') log.warn(`[PORTAL] Oturum kapatıldı: ${e.reason}`);
            }
            send('portal:session', { signedIn: e.signedIn, reason: e.reason || null });
            emitState();
        },
    });

    const api = createApiClient({
        baseUrl,
        appVersion,
        getInstallId: () => installId,
        getLanguage: () => store.get('settings')?.language || 'tr',
        session,
        onEvent: (type, payload) => {
            if (type === 'outdated') state.outdated = { minVersion: payload.minVersion || state.outdated?.minVersion || null };
            if (type === 'maintenance') state.maintenance = { message: payload.message || null, scheduledEnd: payload.scheduledEnd || null };
            emitState();
        },
    });
    session.setTransport((p, body, auth) => api.post(p, body, { auth }));

    function publicState() {
        const snap = session.snapshot();
        const cfg = state.config;
        return {
            apiBase: isDev ? baseUrl : undefined,
            signedIn: snap.signedIn,
            user: snap.user,
            wallet: state.me?.wallet || null,
            unreadNotifications: state.me?.unreadNotifications ?? 0,
            features: cfg?.features || null,
            maintenance: state.maintenance,
            outdated: state.outdated,
            loggingIn: !!loginFlow,
            configLoaded: !!cfg,
        };
    }

    // ── Başlangıç ayarları (§2) ──
    async function loadConfig() {
        clearTimeout(configTimer);
        try {
            const { data } = await api.get('/v1/launcher/config', { auth: 'none' });
            state.config = data;
            state.maintenance = data?.maintenance?.active ? { message: data.maintenance.message || null, scheduledEnd: null } : null;
            const min = data?.minVersion;
            state.outdated = min && compareVersions(appVersion, min) < 0 ? { minVersion: min } : null;
            if (state.outdated) log.warn(`[PORTAL] Launcher sürümü (${appVersion}) en düşük sürümün (${min}) altında`);
        } catch (err) {
            state.lastError = err?.toJSON?.() || { message: String(err?.message || err) };
            log.info(`[PORTAL] Config alınamadı: ${err.code || err.message}`);
            configTimer = setTimeout(loadConfig, CONFIG_RETRY_MS);
        }
        emitState();
        return state.config;
    }

    /** Sunucu listesi + geliştirmede yerel API kökeni (onay sayfası oradan gelir). */
    function linkHosts() {
        return Array.isArray(state.config?.linkHosts) && state.config.linkHosts.length ? state.config.linkHosts : DEFAULT_LINK_HOSTS;
    }

    function openLinkUrl(url) {
        if (isDev && baseUrl.startsWith('http://') && typeof url === 'string' && url.startsWith(`${baseUrl}/`)) {
            return openExternal(url, null, { trusted: true });
        }
        return openExternal(url, linkHosts());
    }

    // ── Hesap özeti (§3) ──
    async function refreshMe({ force = false } = {}) {
        if (!session.isSignedIn()) return null;
        if (!force && state.me && Date.now() - meFetchedAt < ME_MIN_INTERVAL_MS) return state.me;
        try {
            const { data } = await api.get('/v1/launcher/me');
            state.me = data;
            meFetchedAt = Date.now();
        } catch (err) {
            log.info(`[PORTAL] /me alınamadı: ${err.code || err.message}`);
        }
        emitState();
        return state.me;
    }

    // ── Cihaz kodu girişi (§1) ──
    async function startLogin() {
        if (loginFlow) cancelLogin();
        const flow = await session.startDeviceLogin({
            deviceName: os.hostname().slice(0, 64),
            os: process.platform === 'win32' ? 'windows' : process.platform,
            osVersion: os.release(),
            arch: process.arch,
            appVersion,
        });
        loginFlow = flow;
        emitState();
        openLinkUrl(flow.verificationUriComplete);
        flow.done.then((result) => {
            if (loginFlow === flow) loginFlow = null;
            if (result.state === 'success') {
                log.info(`[PORTAL] HardSetups hesabı bağlandı: ${result.user?.username}`);
                refreshMe({ force: true });
            }
            send('portal:login', { state: result.state, user: result.user || null, error: result.error || null });
            emitState();
        });
        return { userCode: flow.userCode, verificationUri: flow.verificationUri, expiresIn: flow.expiresIn };
    }

    function cancelLogin() {
        if (!loginFlow) return;
        loginFlow.cancel();
        loginFlow = null;
        emitState();
    }

    function openVerification() {
        return loginFlow ? openLinkUrl(loginFlow.verificationUriComplete) : false;
    }

    function verificationUrl() {
        return loginFlow?.verificationUriComplete || null;
    }

    async function logout() {
        cancelLogin();
        await session.logout();
        state.me = null;
        emitState();
    }

    function openLink(kind) {
        if (!LINK_KINDS.has(kind)) return false;
        const url = state.me?.links?.[kind] || state.config?.links?.[kind];
        return url ? openLinkUrl(url) : false;
    }

    /** İndirme izin listesi: launcher'ın sabit listesi + sunucunun downloadHosts'u. */
    function downloadHosts() {
        const fromServer = Array.isArray(state.config?.downloadHosts) ? state.config.downloadHosts : [];
        return [...new Set([...BASE_DOWNLOAD_HOSTS, ...fromServer])];
    }

    return {
        api,
        session,
        loadConfig,
        refreshMe,
        startLogin,
        cancelLogin,
        openVerification,
        verificationUrl,
        logout,
        openLink,
        publicState,
        downloadHosts,
        linkHosts,
        isDev,
        baseUrl,
    };
}

module.exports = { createPortal, LINK_KINDS };
