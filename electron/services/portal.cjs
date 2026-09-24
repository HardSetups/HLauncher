// HardSetups portalının ana süreç tarafı: başlangıç ayarları (config), hesap
// oturumu, cihaz kodu girişi, hesap özeti (/me) ve sunucunun verdiği bağlantılar.
// Renderer yalnızca publicState() özetini görür: token, deviceCode ya da
// yenileme token'ı asla renderer'a gitmez.
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createApiClient, resolveBaseUrl, DEFAULT_BASE } = require('./api.cjs');
const { createSession } = require('./hsession.cjs');
const { createEncryptedFileStorage } = require('./session-file.cjs');
const { compareVersions } = require('../lib/semver.cjs');
const { DEFAULT_LINK_HOSTS, BASE_DOWNLOAD_HOSTS, hostMatches } = require('../lib/links.cjs');
const { isValidFolderName } = require('../lib/safepath.cjs');
const { getInstanceDir } = require('../lib/paths.cjs');
const instances = require('../lib/instances.cjs');
const installer = require('./installer.cjs');
const bylicense = require('./bylicense.cjs');
const offline = require('./offline.cjs');
const { createLibrary } = require('./library.cjs');
const { downloadVerified } = require('./downloader.cjs');

const codedError = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

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
 * @param {() => boolean} [o.isGameRunning] oyun açıkken kurulum/onarma yapılmaz (§7.5)
 */
function createPortal({ app, store, dataRoot, log, openExternal, send, isGameRunning = () => false }) {
    const isDev = !app.isPackaged;
    const baseUrl = resolveBaseUrl(process.env.HL_API_BASE, { allowLocalHttp: isDev });
    const appVersion = app.getVersion();
    // Config alınamazken (uçlar canlıda henüz yok ya da ağ hatası) üretim tabanında sözleşme
    // §2'deki host kullanılır: §11 (lisans anahtarıyla kurulum) canlıda config'siz de çalışır
    // ve imzalı dosyalar cdn.hardsetups.com'dan iner. Başka tabanlarda (lokal) boş liste.
    const fallbackHosts = baseUrl === DEFAULT_BASE ? ['cdn.hardsetups.com'] : [];

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
        unavailable: false, // sunucu launcher uçlarına 404 veriyor (hesap bağlantısı henüz açılmadı)
    };
    let loginFlow = null; // { verificationUriComplete, cancel }
    let library = null;   // createLibrary — api kurulduktan sonra atanır
    let meFetchedAt = 0;
    let configTimer = null;

    const emitState = () => send('portal:state', publicState());

    const session = createSession({
        storage: createEncryptedFileStorage(path.join(dataRoot, 'hardsetups-session.json'), { log }),
        onChange: (e) => {
            if (!e.signedIn) {
                state.me = null;
                library?.clear(); // başka bir hesap bağlanırsa eski lisanslar/zarf kalmasın
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
            imageHosts: serverHosts('imageHosts'),
            maintenance: state.maintenance,
            outdated: state.outdated,
            loggingIn: !!loginFlow,
            configLoaded: !!cfg,
            accountAvailable: !state.unavailable,
        };
    }

    /** Sunucunun host listesi; config hiç gelmediyse üretim yedeği (yukarıda). */
    function serverHosts(key) {
        if (!state.config) return fallbackHosts;
        return Array.isArray(state.config[key]) ? state.config[key] : [];
    }

    // Launcher uçları sunucuda yoksa (404) hesap/mağaza "henüz açılmadı" durumuna geçer;
    // lisans anahtarıyla kurulum (§11) bundan etkilenmez.
    const UNAVAILABLE_TEXT = 'HardSetups hesap bağlantısı henüz açılmadı';
    function markUnavailable(err) {
        if (err?.status !== 404 || err.code !== 'NOT_FOUND') return err;
        if (!state.unavailable) { state.unavailable = true; emitState(); }
        return codedError('PORTAL_UNAVAILABLE', UNAVAILABLE_TEXT);
    }

    // ── Başlangıç ayarları (§2) ──
    async function loadConfig() {
        clearTimeout(configTimer);
        try {
            const { data } = await api.get('/v1/launcher/config', { auth: 'none' });
            state.config = data;
            state.unavailable = false;
            state.maintenance = data?.maintenance?.active ? { message: data.maintenance.message || null, scheduledEnd: null } : null;
            const min = data?.minVersion;
            state.outdated = min && compareVersions(appVersion, min) < 0 ? { minVersion: min } : null;
            if (state.outdated) log.warn(`[PORTAL] Launcher sürümü (${appVersion}) en düşük sürümün (${min}) altında`);
        } catch (err) {
            state.lastError = err?.toJSON?.() || { message: String(err?.message || err) };
            if (err?.status === 404 && err.code === 'NOT_FOUND') state.unavailable = true;
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
        // Geliştirmede (paketlenmemiş) sunucu http adresleri verir (hardsetups.test, yerel mock):
        // yalnızca linkHosts'taki host'lar ya da API'nin kendi kökeni için http açılır.
        if (isDev && typeof url === 'string' && url.startsWith('http://')) {
            let host = '';
            try { host = new URL(url).hostname; } catch { /* geçersiz */ }
            if (url.startsWith(`${baseUrl}/`) || hostMatches(host, linkHosts())) return openExternal(url, null, { trusted: true });
        }
        return openExternal(url, linkHosts());
    }

    /** minVersion altındaysa HardSetups bölümü kilitli (kullanıcı kararı: genel launcher çalışmaya devam eder). */
    function assertSupported() {
        if (state.outdated) {
            throw Object.assign(new Error(`Bu launcher sürümü HardSetups tarafından artık desteklenmiyor (en az ${state.outdated.minVersion || '?'})`), {
                code: 'LAUNCHER_OUTDATED',
                toJSON() { return { code: 'LAUNCHER_OUTDATED', message: this.message, details: { minVersion: state.outdated?.minVersion || null } }; },
            });
        }
    }

    // ── Hesap özeti (§3) ──
    async function refreshMe({ force = false } = {}) {
        if (!session.isSignedIn() || state.outdated) return null;
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
        assertSupported();
        if (loginFlow) cancelLogin();
        let flow;
        try {
            flow = await session.startDeviceLogin({
                deviceName: os.hostname().slice(0, 64),
                os: process.platform === 'win32' ? 'windows' : process.platform,
                osVersion: os.release(),
                arch: process.arch,
                appVersion,
            });
        } catch (err) { throw markUnavailable(err); }
        state.unavailable = false;
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

    /** Sunucunun hata ayrıntısında verdiği adres (ör. details.storeUrl); yalnızca linkHosts. */
    function openUrl(url) {
        if (state.outdated) return false;
        return typeof url === 'string' && url.length < 2048 ? openLinkUrl(url) : false;
    }

    function openLink(kind) {
        if (!LINK_KINDS.has(kind)) return false;
        if (state.outdated && kind !== 'launcher') return false; // indirme sayfası kilitli değil
        const url = state.me?.links?.[kind] || state.config?.links?.[kind];
        return url ? openLinkUrl(url) : false;
    }

    /** İndirme izin listesi: launcher'ın sabit listesi + sunucunun downloadHosts'u. */
    function downloadHosts() {
        return [...new Set([...BASE_DOWNLOAD_HOSTS, ...serverHosts('downloadHosts')])];
    }

    // ── Kütüphane ve yönetilen örnekler (C2) ─────────────────────────────────

    // Geliştirme anahtarları YALNIZCA paketlenmemiş sürümde ve yerel API ile, üretim
    // anahtarlarının yanına eklenir (paketli sürümde hiçbiri okunmaz):
    //   - mock: sözleşme vektörlerinin TEST anahtarı (test-ed1)
    //   - HL_DEV_OFFLINE_KEYS="ed1:<ham32base64url>": lokal HardSetupsWeb'in kendi anahtar halkası
    //     (lokal ortam da kid=ed1 kullanır; aynı kid için birden çok anahtar denenir)
    function devKeyring() {
        if (!isDev || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl)) return undefined;
        const raw = { ...offline.EMBEDDED_KEYS };
        try {
            const vectors = require('../../tests/fixtures/launcher-offline-vectors.json');
            for (const k of vectors.keys) raw[k.kid] = k.publicKeyRawBase64url;
        } catch { /* fixture yoksa geç */ }
        for (const [kid, keys] of Object.entries(offline.parseDevKeys(process.env.HL_DEV_OFFLINE_KEYS))) {
            raw[kid] = [...[].concat(raw[kid] || []), ...keys];
        }
        try { return offline.buildKeyring(raw); } catch { return undefined; }
    }
    library = createLibrary({ api, dataRoot, getDeviceId: () => session.getDeviceId(), log, keyring: devKeyring() });

    const managedId = (folderName) => `hs-${folderName}`;
    /** Sunucu resmi yalnızca imageHosts altındaysa saklanır/gösterilir (§2). */
    function imageHostAllowed(hostname, protocol) {
        const httpOk = protocol === 'https:' || (isDev && protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(hostname));
        return httpOk && hostMatches(hostname, serverHosts('imageHosts'));
    }
    function imageAllowed(url) {
        let u;
        try { u = new URL(url); } catch { return false; }
        return imageHostAllowed(u.hostname, u.protocol);
    }
    const findManaged = (slug) => instances.list().find((i) => i.origin === 'hardsetups' && i.product === slug) || null;

    function requireReady({ account = true } = {}) {
        assertSupported();
        if (account && !session.isSignedIn()) throw codedError('NOT_SIGNED_IN', 'Önce HardSetups hesabını bağla');
        if (isGameRunning()) throw codedError('EGAMERUNNING', 'Oyun açıkken kurulum yapılamaz; önce oyunu kapat');
    }

    /** Kurulum sonrası profil kaydı: yönetilen örnek, kullanıcının RAM seçimi korunur. */
    function registerManaged(manifest, { installedVia, iconUrl = null, product = null }) {
        const id = managedId(manifest.instance.folderName);
        const loader = manifest.loader.type === 'vanilla' ? 'release' : manifest.loader.type;
        const fields = {
            name: manifest.instance.displayName,
            mcVersion: manifest.minecraft.version,
            loader,
            loaderVersion: manifest.loader.version || null,
            product: product || manifest.instance.id,
            installedVia,
            installedVersion: manifest.version.version || null,
            installedVersionId: manifest.version.id || null,
            quickPlayWorld: manifest.quickPlay?.singleplayer || null,
            javaMajor: manifest.java.major,
            ...(iconUrl && imageAllowed(iconUrl) ? { iconUrl } : {}),
        };
        if (!instances.get(id)) {
            const ramGb = Math.max(2, Math.ceil((manifest.memory?.recommendedMb || 4096) / 1024));
            instances.create({ id, name: fields.name, mcVersion: fields.mcVersion, loader, ram: ramGb, origin: 'hardsetups' });
        }
        return instances.update(id, fields);
    }

    /** Kütüphane görünümü: lisanslı ürünler + bu cihazdaki kurulum durumu. */
    async function libraryView({ refresh: doRefresh = true } = {}) {
        let items = library.cachedItems();
        let offlineMode = false;
        let error = null;
        if (session.isSignedIn() && !state.outdated && doRefresh) {
            try { items = await library.refresh(); } catch (err) {
                offlineMode = err?.code === 'NETWORK' || err?.status >= 500;
                error = err?.toJSON?.() || { code: 'UNKNOWN', message: String(err?.message || err) };
            }
        }
        const view = items.map((it) => {
            const inst = findManaged(it.product.slug);
            const installed = inst ? installer.readInstalled(getInstanceDir(inst.id)) : null;
            const latest = it.latestVersion;
            const updateAvailable = !!(installed && latest && (latest.id ? latest.id !== installed.version?.id : compareVersions(latest.version, installed.version?.version || '0.0.0') > 0));
            return { ...it, source: 'account', instanceId: inst?.id || null, installedVersion: installed?.version?.version || null, updateAvailable };
        });
        // Anahtarla kurulanlar (§11) hesabın kütüphanesinde görünmeyebilir: yerelden eklenir
        for (const inst of instances.list().filter((i) => i.origin === 'hardsetups' && i.installedVia === 'licenseKey')) {
            if (view.some((v) => v.product.slug === inst.product)) continue;
            view.push({
                licenseId: null, keyLast4: null, product: { slug: inst.product, name: inst.name, iconUrl: inst.iconUrl || null, coverUrl: null },
                status: 'KEY', expiresAt: null, latestVersion: null, installable: true, reason: null,
                source: 'licenseKey', instanceId: inst.id, installedVersion: inst.installedVersion || null, updateAvailable: false,
            });
        }
        return { items: view, fetchedAt: library.fetchedAt(), offline: offlineMode, error };
    }

    function progressReporter(onProgress) {
        return ({ phase, done, total }) => {
            const percent = phase === 'download' && total > 0 ? Math.min(95, Math.floor((done / total) * 95)) : phase === 'commit' ? 98 : null;
            const mb = (n) => (n / (1024 * 1024)).toFixed(1);
            if (phase === 'download') onProgress({ percent, key: 'be.hsDownloading', params: { done: mb(done), total: mb(total) } });
            else if (phase === 'extract') onProgress({ percent: 96, key: 'be.hsExtracting' });
            else onProgress({ percent, key: 'be.hsApplying' });
        };
    }

    /** Hesapla kurulum / güncelleme / onarma (§7). */
    async function installProduct(slug, action, { onProgress = () => {}, signal } = {}) {
        requireReady();
        if (typeof slug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(slug)) throw codedError('VALIDATION', 'Geçersiz ürün');
        if (!['INSTALL', 'UPDATE', 'REPAIR'].includes(action)) throw codedError('VALIDATION', 'Geçersiz işlem');
        onProgress({ percent: null, key: 'be.hsPreparing' });
        const existing = findManaged(slug);
        const installedVersionId = existing ? installer.readInstalled(getInstanceDir(existing.id))?.version?.id || null : null;
        const body = { product: slug, action, channel: 'STABLE', installedVersionId };
        let manifest = (await api.post('/v1/launcher/install', body)).data;
        if (!isValidFolderName(manifest?.instance?.folderName)) throw codedError('EBADMANIFEST', 'Sunucudan geçersiz kurulum bildirimi geldi');
        // v1.5 §7.8.1: Modrinth bağımlılıkları ayrı alanda gelir; birebir sürümle çözülüp dosyalara eklenir
        manifest.files = [...manifest.files, ...await bylicense.resolveDependencies(manifest.dependencies, {
            mcVersion: manifest.minecraft?.version, loader: manifest.loader?.type,
        }, externalEndpoints)];
        const instanceDir = getInstanceDir(managedId(manifest.instance.folderName));
        const started = Date.now();
        const reportResult = (result, errorCode = null) => api.post(`/v1/launcher/install/${manifest.installId}/result`, { result, errorCode, durationMs: Date.now() - started })
            .catch((err) => log.info(`[PORTAL] Kurulum sonucu bildirilemedi: ${err.code || err.message}`));
        try {
            const result = await installer.syncProduct({
                manifest,
                instanceDir,
                allowedHosts: downloadHosts(),
                allowLocalHttp: isDev,
                meta: { source: 'account' },
                signal,
                onProgress: progressReporter(onProgress),
                refreshUrls: async () => {
                    try {
                        const r = await api.post(`/v1/launcher/install/${manifest.installId}/urls`, {});
                        return Object.fromEntries((r.data?.files || []).map((f) => [f.id, f.url]));
                    } catch (err) {
                        if (err?.code !== 'INSTALL_EXPIRED') throw err;
                        manifest = (await api.post('/v1/launcher/install', body)).data; // installId 1 saati geçti (§7.3)
                        return Object.fromEntries(manifest.files.map((f) => [f.id, f.url]));
                    }
                },
            });
            const validated = installer.validateInstallManifest(manifest);
            await ensureLoaderVersion(validated, instanceDir);
            const libItem = library.cachedItems().find((it) => it.product.slug === slug);
            const inst = registerManaged(validated, { installedVia: 'account', iconUrl: libItem?.product?.iconUrl || null, product: slug });
            await reportResult('SUCCESS');
            log.info(`[PORTAL] ${slug} ${action}: ${result.version} (${result.downloaded} indirildi, ${result.reused} yeniden kullanıldı)`);
            return { instanceId: inst.id, ...result };
        } catch (err) {
            await reportResult('FAILED', err.code || 'UNKNOWN');
            throw err;
        }
    }

    // Geliştirmede Modrinth / Fabric meta adresleri mock'a çevrilebilir (HL_EXTERNAL_BASE);
    // paketli sürümde her zaman gerçek adresler
    const externalEndpoints = isDev && process.env.HL_EXTERNAL_BASE && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(process.env.HL_EXTERNAL_BASE)
        ? { modrinthApi: `${process.env.HL_EXTERNAL_BASE}/modrinth`, fabricMeta: `${process.env.HL_EXTERNAL_BASE}/fabric-meta` }
        : bylicense.DEFAULT_ENDPOINTS;

    /** Sunucu Fabric sürümünü sabitlemediyse (v1.4) modların koşuluna göre seç ve manifeste yaz. */
    async function ensureLoaderVersion(validated, instanceDir) {
        if (validated.loader.version || !['fabric'].includes(validated.loader.type)) return validated.loader.version;
        const version = await bylicense.resolveFabricLoader(path.join(instanceDir, 'mods'), validated.minecraft.version, externalEndpoints);
        validated.loader.version = version;
        installer.setInstalledLoaderVersion(instanceDir, version);
        log.info(`[PORTAL] Fabric sürümü seçildi: ${version} (sunucu sabitlemedi)`);
        return version;
    }

    /**
     * "Lisans anahtarım var" (§11): hesap gerekmez, launcher kapı koymaz (§6.6).
     * Sunucu `install` bilgisini veriyorsa (v1.4 §11.0) o kullanılır; vermiyorsa
     * §11.1 ara dönem tablosu. Arşivde Fabric API yoksa Modrinth'ten eklenir (§11.1).
     */
    async function installByLicense(licenseKey, { onProgress = () => {}, signal } = {}) {
        requireReady({ account: false });
        const key = String(licenseKey || '').trim();
        if (!key || key.length > 64) throw codedError('VALIDATION', 'Geçerli bir lisans anahtarı gir');
        onProgress({ percent: null, key: 'be.hsPreparing' });
        const call = () => api.post('/v1/downloads/by-license', { licenseKey: key, channel: 'STABLE' }, { auth: 'none' });
        const first = (await call()).data;
        const product = first?.license?.product;
        const file = bylicense.pickFile(first?.files);
        if (!file) throw codedError('NOT_FOUND', 'Bu ürün için yayınlanmış sürüm yok', { details: { reason: 'noPublishedVersion' } });

        let manifest = bylicense.manifestFromResponse(first, file);
        const table = bylicense.PRODUCTS[product];
        if (!manifest && !table) throw codedError('UNSUPPORTED_PRODUCT', 'Bu ürün launcher\'dan anahtarla henüz kurulamıyor');
        const folderName = manifest ? manifest.instance?.folderName : product;
        if (!isValidFolderName(folderName)) throw codedError('EBADMANIFEST', 'Sunucudan geçersiz kurulum bilgisi geldi');
        const instanceDir = getInstanceDir(managedId(folderName));
        const report = progressReporter(onProgress);

        // Arşiv önce iner ve incelenir (Fabric API var mı, loader koşulları); syncProduct aynı önbelleği kullanır
        let info = { mods: [] };
        const isArchive = !manifest || file.kind === 'archive';
        if (isArchive) {
            const archiveSize = Number(file.sizeBytes) || 0;
            let done = 0;
            const dest = path.join(instanceDir, '.hl-staging', 'dl', file.sha256.slice(0, 32));
            await downloadVerified(
                { url: file.url, dest, sha256: file.sha256, sizeBytes: file.sizeBytes },
                {
                    allowedHosts: downloadHosts(), allowLocalHttp: isDev, signal,
                    onBytes: (d) => { done += d; report({ phase: 'download', done, total: archiveSize }); },
                    refreshUrl: async () => bylicense.pickFile((await call()).data.files)?.url,
                },
            );
            info = bylicense.inspectArchive(dest);
        }
        let extraRules = {};
        let fabricApi = null;
        if (manifest) {
            // v1.5: sunucu bildiriminde bağımlılıklar `dependencies` alanında (tahmin yok)
            manifest.files.push(...await bylicense.resolveDependencies(manifest.dependencies, {
                mcVersion: manifest.minecraft?.version, loader: manifest.loader?.type,
            }, externalEndpoints));
        } else {
            // §11.1 tablosu: arşivde Fabric API yoksa sabit sürüm Modrinth'ten
            fabricApi = info.mods.some((m) => m.id === 'fabric-api') ? null : await bylicense.fetchFabricApi(table.mc, externalEndpoints);
            const constraints = info.mods.map((m) => m.loaderConstraint).filter(Boolean);
            const loaderVersion = bylicense.pickLoaderVersion(await bylicense.fetchFabricLoaders(table.mc, externalEndpoints), constraints);
            if (!loaderVersion) throw codedError('EDEPENDENCY', 'Modların istediği Fabric sürümü bulunamadı');
            manifest = bylicense.buildManifest({ product, table, file, licenseKey: key, loaderVersion, fabricApi });
            extraRules = bylicense.ARCHIVE_RULES;
        }

        const result = await installer.syncProduct({
            manifest,
            instanceDir,
            allowedHosts: downloadHosts(),
            allowLocalHttp: isDev,
            extraRules,
            meta: { source: 'licenseKey' },
            signal,
            onProgress: report,
            refreshUrls: async () => ({ f1: bylicense.pickFile((await call()).data.files)?.url }),
        });
        const validated = installer.validateInstallManifest(manifest);
        await ensureLoaderVersion(validated, instanceDir);
        const inst = registerManaged(validated, { installedVia: 'licenseKey', product: product || validated.instance.id });
        log.info(`[PORTAL] Anahtarla kuruldu: ${validated.instance.id} ${result.version} (Fabric ${validated.loader.version}${fabricApi ? ', Fabric API Modrinth\'ten' : ''}; ${first.install ? 'sunucu bildirimi' : 'ara dönem tablosu'})`);
        return { instanceId: inst.id, product: validated.instance.id, ...result };
    }

    /** Kaldırma (§7.7): isteğe bağlı dünya yedeği, sonra örnek klasörü ve profil kaydı silinir. */
    function uninstallProduct(slug, { backupWorlds = true } = {}) {
        if (isGameRunning()) throw codedError('EGAMERUNNING', 'Oyun açıkken kaldırılamaz; önce oyunu kapat');
        const inst = findManaged(slug);
        if (!inst) throw codedError('NOT_INSTALLED', 'Bu ürün kurulu değil');
        const { backupPath } = installer.uninstallProduct(getInstanceDir(inst.id), {
            backupDir: backupWorlds ? path.join(dataRoot, 'yedekler') : null,
            label: inst.product,
        });
        instances.remove(inst.id);
        if (store.get('activeInstanceId') === inst.id) store.set('activeInstanceId', 'default');
        log.info(`[PORTAL] Kaldırıldı: ${slug}${backupPath ? ` (dünya yedeği: ${path.basename(backupPath)})` : ''}`);
        return { backupPath };
    }

    // ── Vitrin, ürün, satın alma, bildirimler (C3) ───────────────────────────

    const HOME_MIN_INTERVAL_MS = 5 * 60 * 1000;
    const HOME_FOCUS_INTERVAL_MS = 60 * 1000;
    const ACTION_TYPES = new Set(['product', 'url']);
    const BADGES = new Set(['NEW', 'UPDATED', 'BESTSELLER', 'SALE']); // v1.6
    let homeCache = null; // { at, etag, signedIn, data }

    const arr = (v) => (Array.isArray(v) ? v : []);
    const str = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : null);

    /** Vitrin yanıtını renderer için süzer: bilinmeyen action türü gizlenir (§4), kapatılan duyuru çıkarılır. */
    function sanitizeHome(data) {
        const dismissed = new Set(arr(store.get('dismissedAnnouncements')));
        const action = (a) => (a && ACTION_TYPES.has(a.type) ? { type: a.type, slug: str(a.slug, 64), url: str(a.url, 2048) } : null);
        const card = (p) => (p && typeof p.slug === 'string' ? {
            slug: str(p.slug, 64), name: str(p.name, 120), shortDescription: str(p.shortDescription, 300),
            iconUrl: str(p.iconUrl, 2048), coverUrl: str(p.coverUrl, 2048),
            priceFromMinor: str(p.priceFromMinor, 20), compareAtMinor: str(p.compareAtMinor, 20), currency: str(p.currency, 3) || 'TRY',
            badges: arr(p.badges).filter((b) => BADGES.has(b)), owned: p.owned === true,
        } : null);
        return {
            // action null olabilir (tıklanmaz); bilinmeyen tür ise öğe gizlenir (§4)
            hero: arr(data?.hero)
                .filter((h) => h.action == null || ACTION_TYPES.has(h.action.type))
                .map((h) => ({ id: str(h.id, 64), title: str(h.title, 120), subtitle: str(h.subtitle, 300), imageUrl: str(h.imageUrl, 2048), action: action(h.action) }))
                .filter((h) => h.title),
            announcements: arr(data?.announcements).filter((a) => !dismissed.has(a.id)).map((a) => ({
                id: str(a.id, 64), text: str(a.text, 500), variant: ['INFO', 'WARNING', 'SUCCESS', 'CRITICAL'].includes(a.variant) ? a.variant : 'INFO',
                link: a.link?.url ? { label: str(a.link.label, 60), url: str(a.link.url, 2048) } : null, dismissible: a.dismissible !== false,
            })).filter((a) => a.text),
            featured: arr(data?.featured).map(card).filter(Boolean),
            campaigns: arr(data?.campaigns).map((c) => ({
                id: str(c.id, 64), title: str(c.title, 120), description: str(c.description, 500), couponCode: str(c.couponCode, 40),
                endsAt: str(c.endsAt, 40), products: arr(c.products).map((s) => str(s, 64)).filter(Boolean),
            })).filter((c) => c.title),
            news: arr(data?.news).map((n) => ({ id: str(n.id, 64), title: str(n.title, 160), excerpt: str(n.excerpt, 400), imageUrl: str(n.imageUrl, 2048), url: str(n.url, 2048), publishedAt: str(n.publishedAt, 40) })).filter((n) => n.title),
            updates: arr(data?.updates).map((u) => ({ product: str(u.product, 64), version: str(u.version, 40), publishedAt: str(u.publishedAt, 40), changelog: str(u.changelog, 4000) })).filter((u) => u.product),
            expiring: arr(data?.expiring).map((e) => ({ licenseId: str(e.licenseId, 64), product: str(e.product, 64), expiresAt: str(e.expiresAt, 40), renewUrl: str(e.renewUrl, 2048) })).filter((e) => e.product),
        };
    }

    /** GET /home (§4): ETag'li; en sık 5 dk'da bir, odaklanınca dakikada bir. Girişsiz de çalışır. */
    async function home({ reason = 'open' } = {}) {
        if (state.outdated) throw codedError('LAUNCHER_OUTDATED', 'Bu launcher sürümü HardSetups tarafından artık desteklenmiyor');
        const signedIn = session.isSignedIn();
        const age = homeCache ? Date.now() - homeCache.at : Infinity;
        const minAge = reason === 'refresh' ? 0 : reason === 'focus' ? HOME_FOCUS_INTERVAL_MS : HOME_MIN_INTERVAL_MS;
        if (homeCache && homeCache.signedIn === signedIn && age < minAge) return { home: sanitizeHome(homeCache.data), cached: true };
        let res;
        try {
            res = await api.get('/v1/launcher/home', { auth: 'optional', etag: homeCache?.signedIn === signedIn ? homeCache.etag : undefined });
        } catch (err) { throw markUnavailable(err); }
        if (res.notModified && homeCache) homeCache.at = Date.now();
        else homeCache = { at: Date.now(), etag: res.etag, signedIn, data: res.data };
        return { home: sanitizeHome(homeCache.data), cached: !!res.notModified };
    }

    function dismissAnnouncement(id) {
        if (typeof id !== 'string' || !id || id.length > 64) return false;
        store.set('dismissedAnnouncements', [...new Set([...arr(store.get('dismissedAnnouncements')), id])].slice(-200));
        return true;
    }

    /** GET /products/:slug (§5). */
    async function product(slug) {
        if (state.outdated) throw codedError('LAUNCHER_OUTDATED', 'Bu launcher sürümü HardSetups tarafından artık desteklenmiyor');
        if (typeof slug !== 'string' || !/^[a-z0-9-]{1,64}$/.test(slug)) throw codedError('VALIDATION', 'Geçersiz ürün');
        const { data } = await api.get(`/v1/launcher/products/${slug}`, { auth: 'optional' });
        return { product: data };
    }

    // Satın alma (§8): yalnızca bakiye. Aynı teklif her zaman aynı Idempotency-Key ile gider
    // (çift tıklama / ağ tekrarı iki kez satın almaz).
    const purchaseKeys = new Map(); // quoteId → Idempotency-Key

    function requirePurchase() {
        requireReady();
        if (state.config?.features?.purchase === false) throw codedError('PURCHASE_DISABLED', 'Launcher\'dan satın alma şu an kapalı');
    }

    async function quote(productSlug, plan, couponCode = null) {
        requirePurchase();
        if (!/^[a-z0-9-]{1,64}$/.test(String(productSlug)) || !/^[\w-]{1,64}$/.test(String(plan))) throw codedError('VALIDATION', 'Geçersiz ürün ya da plan');
        const coupon = couponCode ? String(couponCode).trim().slice(0, 40) : null;
        const { data } = await api.post('/v1/launcher/purchase/quote', { product: productSlug, plan, couponCode: coupon || null });
        return { quote: data };
    }

    /** consents: kullanıcının onay penceresinde işaretlediği belge anahtarları (v1.6). */
    async function purchase(quoteId, consents = []) {
        requirePurchase();
        if (typeof quoteId !== 'string' || !quoteId || quoteId.length > 128) throw codedError('VALIDATION', 'Geçersiz teklif');
        const accepted = (Array.isArray(consents) ? consents : []).filter((k) => typeof k === 'string' && /^[\w.:-]{1,64}$/.test(k)).slice(0, 20);
        if (!purchaseKeys.has(quoteId)) purchaseKeys.set(quoteId, crypto.randomUUID());
        let data;
        try {
            ({ data } = await api.post('/v1/launcher/purchase', { quoteId, consents: accepted }, { idempotencyKey: purchaseKeys.get(quoteId) }));
        } catch (err) {
            // Kesin ret (4xx): sipariş oluşmadı → sonraki denemede yeni anahtar. Ağ/5xx: sonuç
            // belirsiz → aynı anahtar korunur, tekrar gönderim ilk siparişi döndürür.
            if (err?.status >= 400 && err.status < 500) purchaseKeys.delete(quoteId);
            throw err;
        }
        log.info(`[PORTAL] Satın alındı: sipariş ${data?.orderNo}${data?.reused ? ' (aynı sipariş, tekrar gönderim)' : ''}`);
        homeCache = null; // "owned" ve kampanyalar değişti
        await Promise.all([refreshMe({ force: true }), library.refresh().catch(() => null)]);
        return { orderNo: data?.orderNo || null, licenseId: data?.licenseId || null, status: data?.status || null, reused: data?.reused === true };
    }

    /** Bildirimler (§9). */
    async function notifications(cursor = null) {
        requireReady();
        const q = cursor && /^[\w.=-]{1,200}$/.test(cursor) ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const { data } = await api.get(`/v1/launcher/notifications${q}`);
        return {
            items: arr(data?.items).map((n) => ({ id: str(n.id, 64), title: str(n.title, 160), body: str(n.body, 1000), url: str(n.url, 2048), createdAt: str(n.createdAt, 40), readAt: str(n.readAt, 40) })),
            nextCursor: str(data?.nextCursor, 200),
        };
    }

    async function markNotificationsRead({ ids = null, all = false } = {}) {
        requireReady();
        const body = all ? { all: true } : { ids: arr(ids).map((i) => str(i, 64)).filter(Boolean).slice(0, 100) };
        await api.post('/v1/launcher/notifications/read', body);
        await refreshMe({ force: true });
        return {};
    }

    // ── Sorun bildir (§10) ──
    const report = require('./report.cjs');
    const { getLogsDir } = require('../lib/paths.cjs');

    function reportSources(instanceId) {
        const inst = instanceId ? instances.get(String(instanceId)) : null;
        return { logsDir: getLogsDir(), instanceDir: inst ? getInstanceDir(inst.id) : null, product: inst?.origin === 'hardsetups' ? inst.product : null };
    }

    /** Gönderilecek dosyaların temizlenmiş önizlemesi (renderer'a yalnızca bu gider). */
    function reportPreview(instanceId) {
        const src = reportSources(instanceId);
        return { files: report.previewOf(report.collectReportFiles(src)), product: src.product };
    }

    async function sendReport({ instanceId = null, subject, message, fileIds = [], consent = false }) {
        assertSupported();
        if (state.config?.features?.report === false) throw codedError('REPORT_DISABLED', 'Sorun bildirme şu an kapalı');
        if (!session.isSignedIn()) throw codedError('NOT_SIGNED_IN', 'Sorun bildirmek için HardSetups hesabını bağla');
        if (consent !== true) throw codedError('CONSENT_REQUIRED', 'Göndermek için onay kutusunu işaretle');
        const subj = String(subject || '').trim().slice(0, 120);
        const msg = String(message || '').trim().slice(0, 5000);
        if (!subj || !msg) throw codedError('VALIDATION', 'Konu ve açıklama gerekli');
        const src = reportSources(instanceId);
        // Dosyalar gönderim anında yeniden toplanıp temizlenir; renderer yalnızca seçim gönderir
        const wanted = new Set((Array.isArray(fileIds) ? fileIds : []).map(String));
        const files = report.collectReportFiles(src).filter((f) => wanted.has(f.id));
        const raw = report.buildMultipart({ subject: report.sanitizeReportText(subj), message: report.sanitizeReportText(msg), product: src.product, consent: 'true' }, files);
        const { data } = await api.post('/v1/launcher/report', undefined, { raw });
        log.info(`[PORTAL] Destek talebi açıldı: ${data?.ticketNo} (${files.length} dosya)`);
        return { ticketNo: data?.ticketNo || null, url: data?.url || null };
    }

    /**
     * HardSetups ürünü açılabilir mi? minVersion altında hiçbiri (§2, v1.3.2);
     * hesapla kurulanlar lisans durumuna / çevrimdışı zarfa bakar (§6.3);
     * anahtarla kurulanlara kapı yok (§6.6, lisansı mod doğrular).
     */
    async function launchCheck(instance) {
        if (instance?.origin !== 'hardsetups') return { allowed: true };
        if (state.outdated) return { allowed: false, reason: 'LAUNCHER_OUTDATED' };
        if (instance.installedVia === 'licenseKey') return { allowed: true };
        if (!session.isSignedIn()) return { allowed: false, reason: 'NOT_SIGNED_IN' };
        return library.launchCheck(instance.product);
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
        openUrl,
        imageHostAllowed,
        publicState,
        downloadHosts,
        linkHosts,
        isDev,
        baseUrl,
        libraryView,
        installProduct,
        installByLicense,
        uninstallProduct,
        launchCheck,
        home,
        dismissAnnouncement,
        product,
        quote,
        purchase,
        notifications,
        markNotificationsRead,
        reportPreview,
        sendReport,
    };
}

module.exports = { createPortal, LINK_KINDS };
