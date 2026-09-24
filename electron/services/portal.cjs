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
            imageHosts: Array.isArray(cfg?.imageHosts) ? cfg.imageHosts : [],
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
        const fromServer = Array.isArray(state.config?.downloadHosts) ? state.config.downloadHosts : [];
        return [...new Set([...BASE_DOWNLOAD_HOSTS, ...fromServer])];
    }

    // ── Kütüphane ve yönetilen örnekler (C2) ─────────────────────────────────

    // Geliştirmede yerel mock, zarfı sözleşme vektörlerinin TEST anahtarıyla imzalar;
    // o anahtar yalnızca paketlenmemiş + yerel API ile eklenir, üretimde asla.
    function devKeyring() {
        if (!isDev || !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl)) return undefined;
        try {
            const vectors = require('../../tests/fixtures/launcher-offline-vectors.json');
            return offline.buildKeyring({ ...offline.EMBEDDED_KEYS, ...Object.fromEntries(vectors.keys.map((k) => [k.kid, k.publicKeyRawBase64url])) });
        } catch { return undefined; }
    }
    library = createLibrary({ api, dataRoot, getDeviceId: () => session.getDeviceId(), log, keyring: devKeyring() });

    const managedId = (folderName) => `hs-${folderName}`;
    /** Sunucu resmi yalnızca imageHosts altındaysa saklanır/gösterilir (§2). */
    function imageAllowed(url) {
        let u;
        try { u = new URL(url); } catch { return false; }
        const httpOk = u.protocol === 'https:' || (isDev && u.protocol === 'http:');
        return httpOk && hostMatches(u.hostname, state.config?.imageHosts || []);
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
        const mcVersion = manifest ? manifest.minecraft?.version : table.mc;
        const hasFabricApi = info.mods.some((m) => m.id === 'fabric-api') || (manifest?.files || []).some((f) => /fabric-api/i.test(f.path || ''));
        const fabricApi = hasFabricApi ? null : await bylicense.fetchFabricApi(mcVersion, externalEndpoints);

        let extraRules = {};
        if (manifest) {
            if (fabricApi) manifest.files.push({ id: 'dep-fabric-api', kind: 'file', source: 'modrinth', path: `mods/${fabricApi.filename}`, url: fabricApi.url, sha512: fabricApi.sha512, sizeBytes: String(fabricApi.size) });
        } else {
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
    };
}

module.exports = { createPortal, LINK_KINDS };
