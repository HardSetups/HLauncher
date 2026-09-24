// ELECTRON_RUN_AS_NODE tanımlıysa Electron pencere açmadan düz Node olarak çalışır.
// Bazı makinelerde bu değişken sistem geneli tanımlı olabildiğinden, kendimizi
// temiz ortamla yeniden başlatıyoruz. electron require edilmeden ÖNCE çalışmalı.
if (process.env.ELECTRON_RUN_AS_NODE) {
    delete process.env.ELECTRON_RUN_AS_NODE;
    const { spawn } = require('child_process');
    spawn(process.execPath, process.argv.slice(1), {
        env: process.env,
        detached: true,
        stdio: 'ignore',
    }).unref();
    process.exit(0);
}

const { app, BrowserWindow, ipcMain, dialog, shell, session, clipboard, protocol } = require('electron');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu-cache');
// Chromium sandbox'ı açık. Yalnızca STATUS_BREAKPOINT çökmesinin görüldüğü
// makinelerde kapanır (ayrıntı ve otomatik geri dönüş: lib/compat.cjs).
const compat = require('./lib/compat.cjs');
const NO_SANDBOX = compat.sandboxDisabled(require('./lib/store.cjs').getStore());
if (NO_SANDBOX) {
    app.commandLine.appendSwitch('no-sandbox');
}

// Tek instance: ikinci kopya açılırsa mevcut pencereye odaklan.
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    startApp();
}

function startApp() {
    const log = require('./lib/logger.cjs');
    const { getStore, sanitizeSettingsPatch, sanitizeServers } = require('./lib/store.cjs');
    const { getLogsDir, getRootPath } = require('./lib/paths.cjs');
    const { friendlyError } = require('./lib/errors.cjs');
    const { launchGame, stopGame, isGameRunning } = require('./launcher.cjs');
    const { getRecentReleaseVersions, getLatestRelease } = require('./lib/versions.cjs');
    const instances = require('./lib/instances.cjs');
    const accounts = require('./lib/accounts.cjs');
    const modrinth = require('./lib/modrinth.cjs');
    const content = require('./lib/content.cjs');
    const skins = require('./lib/skins.cjs');
    const mrpack = require('./lib/mrpack.cjs');
    const servermanifest = require('./lib/servermanifest.cjs');
    const optifineLoader = require('./lib/loaders/optifine.cjs');
    const updater = require('./lib/updater.cjs');
    const { getNews } = require('./lib/news.cjs');
    const links = require('./lib/links.cjs');

    process.on('uncaughtException', (err) => log.error(`[MAIN] Yakalanmamış hata: ${err.stack || err.message}`));
    process.on('unhandledRejection', (reason) => log.error(`[MAIN] İşlenmemiş promise reddi: ${reason}`));

    // Sandbox'lı alt süreç açılışta STATUS_BREAKPOINT ile düşerse bu makinede
    // sandbox'ı kalıcı olarak kapatıp bir kez yeniden başla (lib/compat.cjs).
    const startedAt = Date.now();
    const onProcessGone = (kind, details) => {
        log.warn(`[MAIN] Alt süreç kapandı (${kind}): ${details.type || ''} ${details.reason} ${details.exitCode}`);
        if (NO_SANDBOX || !compat.isSandboxCrash(details, Date.now() - startedAt)) return;
        log.warn('[MAIN] STATUS_BREAKPOINT: sandbox bu makinede kapatılıyor, yeniden başlatılıyor');
        getStore().set('compat', { ...getStore().get('compat'), noSandbox: true });
        app.relaunch();
        app.exit(0);
    };
    app.on('child-process-gone', (_e, details) => onProcessGone('child', details));
    app.on('render-process-gone', (_e, _wc, details) => onProcessGone('renderer', details));

    // HardSetups portalı (hesap, config, cihaz kodu girişi) — app ready sonrası kurulur
    const { createPortal } = require('./services/portal.cjs');
    let portal = null;

    // Sunucu resimleri hlimg:// üzerinden ana süreç önbelleğinden gelir (sözleşme §2).
    // Şema app ready'den ÖNCE kaydedilmeli.
    const imagecache = require('./services/imagecache.cjs');
    protocol.registerSchemesAsPrivileged([{ scheme: imagecache.SCHEME, privileges: { standard: true, secure: true } }]);

    // Tarayıcıda yalnızca https + izinli host açılır (sözleşme §2): launcher'ın
    // sabit listesi + sunucunun linkHosts'u. trusted: geliştirmede yerel mock onay sayfası.
    const openExternalSafe = (url, hosts = null, { trusted = false } = {}) => {
        const allowed = [...links.DEFAULT_LINK_HOSTS, ...(hosts || portal?.linkHosts() || [])];
        if (trusted || links.isAllowedLink(url, allowed)) {
            shell.openExternal(url);
            return true;
        }
        let host = '';
        try { host = new URL(url).host; } catch { /* geçersiz adres */ }
        log.warn(`[MAIN] İzinsiz bağlantı açılmadı: ${host || '(geçersiz adres)'}`);
        return false;
    };

    let mainWindow;

    // Tepsi (kullanıcı kararı: Ayarlar'da, varsayılan kapalı). Tepsi yalnızca ayar
    // açıkken ve pencere ilk kez gizlenince oluşur; "Çıkış" gerçekten kapatır.
    let tray = null;
    let quitting = false;
    app.on('before-quit', () => { quitting = true; });
    const trayEnabled = () => getStore().get('settings')?.minimizeToTray === true;
    const showWindow = () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    };
    function ensureTray() {
        if (tray) return;
        const { Tray, Menu } = require('electron');
        const icon = app.isPackaged ? path.join(process.resourcesPath, 'public', 'logo.ico') : path.join(__dirname, '..', 'public', 'logo.ico');
        const en = getStore().get('settings')?.language === 'en';
        tray = new Tray(icon);
        tray.setToolTip('HLauncher');
        tray.setContextMenu(Menu.buildFromTemplate([
            { label: en ? 'Open HLauncher' : 'HLauncher\'ı aç', click: showWindow },
            { type: 'separator' },
            { label: en ? 'Quit' : 'Çıkış', click: () => { quitting = true; app.quit(); } },
        ]));
        tray.on('click', showWindow);
    }

    function createWindow() {
        const saved = getStore().get('windowBounds');
        mainWindow = new BrowserWindow({
            width: saved?.width || 1200,
            height: saved?.height || 800,
            ...(Number.isFinite(saved?.x) && Number.isFinite(saved?.y) ? { x: saved.x, y: saved.y } : {}),
            minWidth: 980,
            minHeight: 640,
            frame: false,
            backgroundColor: '#0b0c0f',
            webPreferences: {
                preload: path.join(__dirname, 'preload.cjs'),
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
                allowRunningInsecureContent: false,
            },
        });
        if (saved?.maximized) mainWindow.maximize();

        // Güvenlik: renderer yeni pencere açamaz ve uygulama dışına gezinemez.
        // İzinli https bağlantılar (Discord, haberler, mağaza) sistem tarayıcısında açılır.
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            openExternalSafe(url);
            return { action: 'deny' };
        });
        mainWindow.webContents.on('will-navigate', (e, url) => {
            const allowed = process.env.NODE_ENV === 'development'
                ? url.startsWith('http://127.0.0.1:5173')
                : url.startsWith('file://');
            if (!allowed) {
                e.preventDefault();
                openExternalSafe(url);
            }
        });
        // <webview> hiçbir koşulda eklenemez
        mainWindow.webContents.on('will-attach-webview', (e) => e.preventDefault());

        // Büyüt/küçült durumunu arayüze bildir (başlık çubuğu simgesi için)
        mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
        mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));

        // Pencere boyut/konumunu kapanışta hatırla. "Tepsiye küçült" açıksa kapatmak gizler.
        mainWindow.on('close', (e) => {
            if (!quitting && trayEnabled()) {
                e.preventDefault();
                ensureTray();
                mainWindow.hide();
                return;
            }
            try {
                const maximized = mainWindow.isMaximized();
                const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
                getStore().set('windowBounds', { ...bounds, maximized });
            } catch { /* pencere çoktan yok olduysa geç */ }
        });

        if (process.env.NODE_ENV === 'development') {
            mainWindow.loadURL('http://127.0.0.1:5173');
        } else {
            mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
        }

        // Tanıtım görseli modu (site/dokümantasyon için): HL_SCREENSHOT=<png yolu>
        // Pencere yüklendikten ~6.5 sn sonra (sunucu durumları gelsin diye) kare alır ve çıkar.
        if (process.env.HL_SCREENSHOT) {
            mainWindow.webContents.once('did-finish-load', () => {
                setTimeout(async () => {
                    try {
                        const img = await mainWindow.webContents.capturePage();
                        require('fs').writeFileSync(process.env.HL_SCREENSHOT, img.toPNG());
                        log.info(`[MAIN] Ekran görüntüsü kaydedildi: ${process.env.HL_SCREENSHOT}`);
                    } catch (err) {
                        log.error(`[MAIN] Ekran görüntüsü hatası: ${err.message}`);
                    }
                    app.quit();
                }, parseInt(process.env.HL_SCREENSHOT_DELAY || '6500', 10));
            });
        }
    }

    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        log.info(`[MAIN] HLauncher ${app.getVersion()} başladı (veri: ${getRootPath()}, sandbox: ${NO_SANDBOX ? 'kapalı' : 'açık'})`);

        // Kamera, mikrofon, bildirim, konum vb. hiçbir tarayıcı izni verilmez;
        // yalnızca panoya yazma (UUID / adres kopyalama) serbest.
        const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write']);
        session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
        session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));

        createWindow();
        updater.initUpdater(app, getStore(), mainWindow);

        portal = createPortal({
            app,
            store: getStore(),
            dataRoot: getRootPath(),
            log,
            openExternal: openExternalSafe,
            send: (channel, payload) => {
                if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
            },
            isGameRunning,
        });
        log.info(`[PORTAL] API: ${portal.baseUrl}`);

        const images = imagecache.createImageCache({
            cacheDir: path.join(getRootPath(), 'cache', 'img'),
            isAllowed: (host, proto) => portal.imageHostAllowed(host, proto),
            log,
        });
        protocol.handle(imagecache.SCHEME, async (request) => {
            const url = imagecache.decodeImageUrl(request.url);
            const res = url ? await images.get(url) : { status: 400 };
            if (res.status !== 200) return new Response(null, { status: res.status });
            return new Response(res.body, { headers: { 'Content-Type': res.type, 'Cache-Control': 'max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
        });
        portal.loadConfig().then(() => portal.refreshMe({ force: true }));
        // Pencere odaklanınca hesap özeti (bakiye, bildirim sayısı) tazelenir (en sık dakikada bir)
        mainWindow.on('focus', () => portal?.refreshMe());

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });

    // ── Pencere / uygulama ──────────────────────────────────────────────────
    ipcMain.on('close-app', () => mainWindow.close()); // tepsi ayarı 'close' olayında değerlendirilir
    ipcMain.on('minimize-app', () => mainWindow.minimize());
    ipcMain.on('toggle-maximize', () => {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    });
    // Başlık çubuğu ilk açılışta sorar (pencere büyütülmüş açılmış olabilir)
    ipcMain.handle('window:is-maximized', () => !!mainWindow?.isMaximized());
    ipcMain.on('hide-launcher', () => mainWindow.hide());
    ipcMain.on('show-launcher', () => { mainWindow.show(); mainWindow.focus(); });

    // ── Oyun ────────────────────────────────────────────────────────────────
    // HardSetups ürünü açılmadan önce lisans kapısı (sözleşme §6.3); kapı mesajları Türkçe
    const LAUNCH_BLOCK_TEXT = {
        LAUNCHER_OUTDATED: 'Bu launcher sürümü HardSetups tarafından artık desteklenmiyor. HardSetups ürünlerini oynamak için launcher\'ı güncelle.',
        NOT_SIGNED_IN: 'Bu ürünü oynamak için HardSetups hesabını bağla (Hesap sayfası).',
        LICENSE_REQUIRED: 'Bu ürün için hesabında aktif bir lisans yok.',
        OFFLINE_NO_ENVELOPE: 'İnternet yok ve bu cihazda çevrimdışı oynama izni henüz alınmamış. Bir kez internete bağlanıp launcher\'ı aç.',
        OFFLINE_EXPIRED: 'Çevrimdışı oynama süren doldu. Lisansının doğrulanması için internete bağlan.',
        OFFLINE_CLOCK: 'Bilgisayarının saati geri alınmış görünüyor. Saati düzeltip tekrar dene.',
        OFFLINE_INVALID: 'Çevrimdışı lisans bilgisi doğrulanamadı. İnternete bağlanıp tekrar dene.',
    };
    ipcMain.on('launch-game', async (event, options) => {
        const opts = options || {};
        const inst = opts.instanceId ? instances.get(opts.instanceId) : null;
        if (inst?.origin === 'hardsetups') {
            const check = portal ? await portal.launchCheck(inst) : { allowed: false, reason: 'NOT_READY' };
            if (!check.allowed) {
                log.warn(`[LAUNCH] HardSetups ürünü açılmadı: ${inst.product} (${check.reason})`);
                event.reply('launch-error', LAUNCH_BLOCK_TEXT[check.reason] || `Bu ürünün lisansı şu an aktif değil (${check.reason}).`);
                return;
            }
        }
        // "Kaldığın yerden devam" sırası + son seçilen profil
        if (inst) {
            instances.markPlayed(opts.instanceId);
            getStore().set('activeInstanceId', opts.instanceId);
        }
        launchGame(event, opts).catch((err) => {
            log.error(`[MAIN] launch-game hatası: ${err.stack || err.message}`);
            event.reply('launch-error', friendlyError(err));
        });
    });
    ipcMain.on('stop-game', () => stopGame());

    // ── Sistem / ayarlar ────────────────────────────────────────────────────
    // Paketli exe'nin Authenticode imzası (bir kez okunur). İmzasız derleme arayüzde
    // "dev" olarak işaretlenir (sözleşme C4); geliştirmede null.
    let signedPromise = null;
    const checkSigned = () => {
        if (!app.isPackaged || process.platform !== 'win32') return Promise.resolve(null);
        if (!signedPromise) {
            signedPromise = new Promise((resolve) => {
                const exe = process.execPath.replace(/'/g, "''");
                require('child_process').execFile('powershell.exe',
                    ['-NoProfile', '-NonInteractive', '-Command', `(Get-AuthenticodeSignature -LiteralPath '${exe}').Status`],
                    { timeout: 8000, windowsHide: true },
                    (err, stdout) => resolve(err ? null : String(stdout).trim() === 'Valid'));
            });
        }
        return signedPromise;
    };
    ipcMain.handle('system:info', async () => ({
        totalMemGb: Math.round(os.totalmem() / (1024 ** 3)),
        appVersion: app.getVersion(),
        logsDir: getLogsDir(),
        packaged: app.isPackaged,
        signed: await checkSigned(),
    }));

    ipcMain.handle('system:open-logs', () => shell.openPath(getLogsDir()));

    // Aktif profilin ekran görüntüleri klasörünü aç (yoksa oluştur)
    ipcMain.handle('system:open-screenshots', () => {
        const { getInstanceDir } = require('./lib/paths.cjs');
        const dir = path.join(getInstanceDir(getStore().get('activeInstanceId') || 'default'), 'screenshots');
        require('fs').mkdirSync(dir, { recursive: true });
        return shell.openPath(dir);
    });

    // Önbellek temizliği: manifest/haber önbelleği + installer jar'ları.
    // Oyun dosyalarına, profillere ve modlara DOKUNMAZ.
    ipcMain.handle('system:clear-cache', () => {
        const fs = require('fs');
        const { getInstallersDir } = require('./lib/paths.cjs');
        let freed = 0;
        const targets = [
            path.join(getRootPath(), 'version_manifest_cache.json'),
            path.join(getRootPath(), 'news_cache.json'),
        ];
        try {
            for (const f of fs.readdirSync(getInstallersDir())) targets.push(path.join(getInstallersDir(), f));
        } catch { /* installers klasörü yoksa geç */ }
        for (const f of targets) {
            try {
                freed += fs.statSync(f).size;
                fs.unlinkSync(f);
            } catch { /* dosya yoksa geç */ }
        }
        log.info(`[MAIN] Önbellek temizlendi: ${Math.round(freed / 1024)} KB`);
        return { freedBytes: freed };
    });

    ipcMain.handle('instances:open-dir', (_e, id) => {
        if (!instances.get(id)) throw new Error(`Profil bulunamadı: ${id}`);
        const { getInstanceDir } = require('./lib/paths.cjs');
        return shell.openPath(getInstanceDir(id));
    });

    ipcMain.handle('news:get', () => getNews());

    // Launcher'ın kendi güncellemeleri
    ipcMain.handle('updates:status', () => updater.getStatus());
    ipcMain.handle('updates:check', () => updater.checkNow());
    ipcMain.on('updates:install', () => updater.installNow());

    ipcMain.handle('store:all', () => {
        const store = getStore();
        return {
            settings: store.get('settings'),
            servers: store.get('servers'),
            activeInstanceId: store.get('activeInstanceId'),
            account: accounts.getCurrent(),
            lastSeenVersion: store.get('lastSeenVersion') || null,
        };
    });
    // "Bu sürümde neler var" gösterildi: bu sürüm bir daha sorulmaz
    ipcMain.handle('app:seen-version', () => { getStore().set('lastSeenVersion', app.getVersion()); return true; });
    ipcMain.handle('settings:patch', (_e, patch) => {
        const clean = sanitizeSettingsPatch(patch);
        // Otomatik güncelleme anahtarı yeniden başlatmadan etkili olsun
        if (typeof clean.checkUpdates === 'boolean') updater.setEnabled(clean.checkUpdates);
        return getStore().patchSettings(clean);
    });
    ipcMain.handle('servers:set', (_e, servers) => {
        getStore().set('servers', sanitizeServers(servers));
        return true;
    });
    ipcMain.handle('instances:set-active', (_e, id) => {
        if (!instances.get(id)) throw new Error(`Profil bulunamadı: ${id}`);
        getStore().set('activeInstanceId', id);
        return true;
    });

    ipcMain.handle('select-java-path', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Java Çalıştırılabilir Dosyasını Seç',
            filters: [{ name: 'Java', extensions: ['exe'] }],
            properties: ['openFile'],
            defaultPath: 'C:\\Program Files',
        });
        if (result.canceled || !result.filePaths.length) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('get-version-manifest', async () => {
        try {
            return { versions: await getRecentReleaseVersions() };
        } catch (err) {
            return { versions: [], error: friendlyError(err) };
        }
    });

    // ── Hesap ───────────────────────────────────────────────────────────────
    ipcMain.handle('account:login-microsoft', async () => {
        try {
            return { ok: true, account: await accounts.loginMicrosoft() };
        } catch (err) {
            log.error(`[MAIN] Microsoft giriş hatası: ${err.stack || err.message}`);
            return { ok: false, error: friendlyError(err) };
        }
    });
    ipcMain.handle('account:login-offline', (_e, name) => {
        try {
            return { ok: true, account: accounts.loginOffline(name) };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    });
    ipcMain.handle('account:logout', () => { accounts.logout(); return true; });

    // ── HardSetups hesabı (portal) ─────────────────────────────────────────
    // Hepsi {ok, ...} | {ok:false, error} döndürür; token ve deviceCode renderer'a gitmez.
    const portalCall = (label, fn) => async (_e, ...args) => {
        if (!portal) return { ok: false, error: { code: 'NOT_READY', message: 'Launcher henüz hazır değil' } };
        try {
            return { ok: true, ...(await fn(...args)) };
        } catch (err) {
            log.error(`[PORTAL] ${label}: ${err.code || ''} ${err.message}`);
            // Ana süreçte üretilen kodlu hatalar (PURCHASE_DISABLED, PORTAL_UNAVAILABLE…) kodunu korur
            return { ok: false, error: err?.toJSON?.() || { code: err.code || 'UNKNOWN', message: friendlyError(err), details: err.details || {} } };
        }
    };
    ipcMain.handle('portal:state', portalCall('Durum', () => ({ state: portal.publicState() })));
    ipcMain.handle('portal:refresh', portalCall('Yenileme', async () => {
        await portal.loadConfig();
        await portal.refreshMe({ force: true });
        return { state: portal.publicState() };
    }));
    ipcMain.handle('portal:login-start', portalCall('Giriş', () => portal.startLogin()));
    ipcMain.handle('portal:login-cancel', portalCall('Giriş iptali', () => { portal.cancelLogin(); return {}; }));
    ipcMain.handle('portal:open-verification', portalCall('Onay sayfası', () => ({ opened: portal.openVerification() })));
    ipcMain.handle('portal:copy-verification', portalCall('Adres kopyalama', () => {
        const url = portal.verificationUrl();
        if (url) clipboard.writeText(url);
        return { copied: !!url };
    }));
    ipcMain.handle('portal:logout', portalCall('Çıkış', async () => { await portal.logout(); return {}; }));
    ipcMain.handle('portal:open-link', portalCall('Bağlantı', (kind) => ({ opened: portal.openLink(String(kind || '')) })));
    ipcMain.handle('portal:open-url', portalCall('Bağlantı', (url) => ({ opened: portal.openUrl(url) })));
    // Vitrin, ürün, satın alma, bildirimler (C3)
    ipcMain.handle('portal:home', portalCall('Vitrin', (reason) => portal.home({ reason: ['open', 'focus', 'refresh'].includes(reason) ? reason : 'open' })));
    ipcMain.handle('portal:dismiss-announcement', portalCall('Duyuru', (id) => ({ dismissed: portal.dismissAnnouncement(id) })));
    ipcMain.handle('portal:product', portalCall('Ürün', (slug) => portal.product(String(slug || ''))));
    ipcMain.handle('portal:quote', portalCall('Teklif', (productSlug, plan, coupon) => portal.quote(String(productSlug || ''), String(plan || ''), coupon ? String(coupon) : null)));
    ipcMain.handle('portal:purchase', portalCall('Satın alma', (quoteId, consents) => portal.purchase(String(quoteId || ''), Array.isArray(consents) ? consents.map(String) : [])));
    ipcMain.handle('portal:notifications', portalCall('Bildirimler', (cursor) => portal.notifications(cursor ? String(cursor) : null)));
    // Sorun bildir (§10): önizleme temizlenmiş içerik; gönderimde dosyalar yeniden toplanır
    ipcMain.handle('portal:report-preview', portalCall('Rapor önizleme', (instanceId) => portal.reportPreview(instanceId ? String(instanceId) : null)));
    ipcMain.handle('portal:report-send', portalCall('Rapor gönderme', (payload) => portal.sendReport({
        instanceId: payload?.instanceId ? String(payload.instanceId) : null,
        subject: String(payload?.subject || ''),
        message: String(payload?.message || ''),
        fileIds: Array.isArray(payload?.fileIds) ? payload.fileIds.map(String).slice(0, 5) : [],
        consent: payload?.consent === true,
    })));
    ipcMain.handle('portal:notifications-read', portalCall('Bildirim okundu', (opts) => portal.markNotificationsRead({
        ids: Array.isArray(opts?.ids) ? opts.ids.map(String) : null, all: opts?.all === true,
    })));

    // ── Profiller ───────────────────────────────────────────────────────────
    ipcMain.handle('instances:list', () => instances.list());
    // Renderer yalnızca kullanıcı alanlarını yazabilir (origin/managedFiles vb. korunur)
    ipcMain.handle('instances:create', (_e, data) => {
        const clean = instances.sanitizeInstancePatch(data);
        return instances.create({ ...clean, name: clean.name || '', loader: clean.loader || 'release' });
    });
    ipcMain.handle('instances:update', (_e, id, patch) => {
        const clean = instances.sanitizeInstancePatch(patch);
        // HardSetups ürününün sürümü ve loader'ı sunucunun kurulum bildiriminden gelir
        if (instances.get(id)?.origin === 'hardsetups') { delete clean.mcVersion; delete clean.loader; }
        return instances.update(id, clean);
    });
    ipcMain.handle('instances:delete', (_e, id) => {
        const inst = instances.get(id);
        // Yönetilen örnek: dünyalar yedeklenerek kaldırılır (sözleşme §7.7)
        if (inst?.origin === 'hardsetups' && portal) return !!portal.uninstallProduct(inst.product, { backupWorlds: true });
        const removed = instances.remove(id);
        if (getStore().get('activeInstanceId') === id) getStore().set('activeInstanceId', 'default');
        return removed;
    });

    // ── Modlar ──────────────────────────────────────────────────────────────
    // Uzun işlemlerin ilerlemesi renderer'daki indirme çubuğuna gider; taskId
    // sayesinde aynı anda süren işlemler birbirine karışmaz.
    const modProgress = (event, taskId = null) => (p) => {
        if (!event.sender.isDestroyed()) event.sender.send('mod-progress', { ...p, taskId });
    };

    // ── Profil içeriği (mod / kaynak paketi / shader) ──────────────────────
    // Hepsi {ok, ...} | {ok:false, error} döndürür — IPC üzerinden hata fırlatmaz.
    const contentCall = (label, fn) => async (event, ...args) => {
        try {
            return { ok: true, ...(await fn(event, ...args)) };
        } catch (err) {
            log.error(`[MAIN] ${label}: ${err.stack || err.message}`);
            return { ok: false, error: friendlyError(err) };
        }
    };
    const resolveVersion = async (instance) => instance.mcVersion || await getLatestRelease();
    const requireInstance = (id) => {
        const inst = instances.get(id);
        if (!inst) throw new Error(`Profil bulunamadı: ${id}`);
        return inst;
    };

    // opts.meta === false → yalnızca yerel dosyalar (ağsız, sayım için hızlı)
    ipcMain.handle('content:list', contentCall('İçerik listesi', async (_e, instanceId, type, opts) => {
        const dir = instances.getContentDir(instanceId, type);
        return { items: opts?.meta === false ? content.listEntries(dir, type) : await content.listContent(dir, type) };
    }));
    ipcMain.handle('content:toggle', contentCall('İçerik aç/kapat', (_e, instanceId, type, file, enabled) => ({
        file: content.setEnabled(instances.getContentDir(instanceId, type), file, !!enabled),
    })));
    ipcMain.handle('content:remove', contentCall('İçerik silme', (_e, instanceId, type, file) => ({
        removed: content.removeContent(instances.getContentDir(instanceId, type), file),
    })));
    ipcMain.handle('content:open-dir', contentCall('Klasör açma', async (_e, instanceId, type) => ({
        error: await shell.openPath(instances.getContentDir(instanceId, type)) || undefined,
    })));
    ipcMain.handle('content:search', contentCall('Modrinth araması', (_e, params) => content.search(params || {})));
    ipcMain.handle('content:install', contentCall('İçerik kurulumu', async (event, instanceId, type, projectId, taskId) => {
        const instance = requireInstance(instanceId);
        if (type === 'mod' && !['fabric', 'quilt', 'forge', 'neoforge'].includes(instance.loader)) {
            throw new Error('Mod kurmak için profil bir mod loader kullanmalı (Fabric, Quilt, Forge, NeoForge)');
        }
        const files = await content.installProject({
            dir: instances.getContentDir(instanceId, type),
            type,
            projectId,
            mcVersion: await resolveVersion(instance),
            loader: instance.loader,
            onProgress: modProgress(event, taskId),
        });
        return { installed: files.map((f) => f.file) };
    }));
    ipcMain.handle('content:check-updates', contentCall('Güncelleme denetimi', async (_e, instanceId, type) => {
        const instance = requireInstance(instanceId);
        return content.checkUpdates({
            dir: instances.getContentDir(instanceId, type),
            type,
            mcVersion: await resolveVersion(instance),
            loader: instance.loader,
        });
    }));
    ipcMain.handle('content:apply-update', contentCall('İçerik güncelleme', async (_e, instanceId, type, update) => ({
        file: await content.applyUpdate(instances.getContentDir(instanceId, type), update || {}),
    })));
    ipcMain.handle('modpack:install', contentCall('Modpack kurulumu', async (event, projectId, taskId) => {
        const summary = await content.installModpack(String(projectId || ''), modProgress(event, taskId));
        if (summary.iconUrl) instances.update(summary.instanceId, { iconUrl: summary.iconUrl });
        return summary;
    }));

    // ── HardSetups kütüphanesi ve kurulumlar (C2) ───────────────────────────
    // Uzun işler taskId'li 'mod-progress' olaylarıyla indirme paneline ilerleme yollar.
    const portalTask = (label, fn) => async (event, ...args) => {
        if (!portal) return { ok: false, error: { code: 'NOT_READY', message: 'Launcher henüz hazır değil' } };
        try {
            return { ok: true, ...(await fn(event, ...args)) };
        } catch (err) {
            log.error(`[PORTAL] ${label}: ${err.code || ''} ${err.message}`);
            return { ok: false, error: err?.toJSON?.() || { code: err.code || 'UNKNOWN', message: friendlyError(err), details: err.details || {} } };
        }
    };
    ipcMain.handle('portal:library', portalTask('Kütüphane', (_e, opts) => portal.libraryView({ refresh: opts?.refresh !== false })));
    ipcMain.handle('portal:install', portalTask('Kurulum', (event, slug, action, taskId) =>
        portal.installProduct(String(slug || ''), String(action || 'INSTALL'), { onProgress: modProgress(event, taskId) })));
    ipcMain.handle('portal:install-key', portalTask('Anahtarla kurulum', (event, licenseKey, taskId) =>
        portal.installByLicense(String(licenseKey || ''), { onProgress: modProgress(event, taskId) })));
    ipcMain.handle('portal:uninstall', portalTask('Kaldırma', (_e, slug, opts) =>
        portal.uninstallProduct(String(slug || ''), { backupWorlds: opts?.backupWorlds !== false })));
    ipcMain.handle('portal:open-backups', portalTask('Yedek klasörü', async () => {
        const dir = path.join(getRootPath(), 'yedekler');
        require('fs').mkdirSync(dir, { recursive: true });
        return { error: await shell.openPath(dir) || undefined };
    }));

    ipcMain.handle('mods:performance-preset', async (event, instanceId, taskId) => {
        try {
            const instance = instances.get(instanceId);
            if (!instance) throw new Error(`Profil bulunamadı: ${instanceId}`);
            const report = await modrinth.installPerformancePreset({
                modsDir: instances.getModsDir(instanceId),
                mcVersion: instance.mcVersion || await getLatestRelease(),
                loader: instance.loader,
                onProgress: modProgress(event, taskId),
            });
            return { ok: true, ...report };
        } catch (err) {
            log.error(`[MAIN] Performans preset hatası: ${err.stack || err.message}`);
            return { ok: false, error: friendlyError(err) };
        }
    });

    ipcMain.handle('mrpack:import', async (event, taskId) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Modrinth Modpack Seç',
            filters: [{ name: 'Modrinth Modpack', extensions: ['mrpack'] }],
            properties: ['openFile'],
        });
        if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
        try {
            const summary = await mrpack.importMrpack(result.filePaths[0], modProgress(event, taskId));
            return { ok: true, ...summary };
        } catch (err) {
            log.error(`[MAIN] mrpack hatası: ${err.stack || err.message}`);
            return { ok: false, error: friendlyError(err) };
        }
    });

    // ── Skinler ───────────────────────────────────────────────────────────
    const skinCall = (label, fn) => contentCall(label, fn);
    const withToken = async (fn) => fn(await accounts.getMinecraftToken());

    ipcMain.handle('skins:list', skinCall('Skin listesi', () => ({ skins: skins.listLibrary() })));
    ipcMain.handle('skins:import-file', skinCall('Skin içe aktarma', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Skin dosyası seç (PNG, 64×64)',
            filters: [{ name: 'Minecraft skin', extensions: ['png'] }],
            properties: ['openFile'],
        });
        if (result.canceled || !result.filePaths.length) return { canceled: true };
        return { skin: skins.importFile(result.filePaths[0]) };
    }));
    ipcMain.handle('skins:import-username', skinCall('Kullanıcı adından skin', async (_e, name) => ({
        skin: await skins.importFromUsername(name),
    })));
    ipcMain.handle('skins:update', skinCall('Skin düzenleme', (_e, id, patch) => ({ skin: skins.updateEntry(String(id), patch || {}) })));
    ipcMain.handle('skins:remove', skinCall('Skin silme', (_e, id) => ({ removed: skins.removeEntry(String(id)) })));
    ipcMain.handle('skins:profile', skinCall('Skin profili', () => withToken(async (token) => ({ profile: await skins.getProfile(token) }))));
    ipcMain.handle('skins:apply', skinCall('Skin uygulama', (_e, id) => withToken(async (token) => ({ profile: await skins.applySkin(token, String(id)) }))));
    ipcMain.handle('skins:reset', skinCall('Skin sıfırlama', () => withToken(async (token) => ({ profile: await skins.resetSkin(token) }))));
    ipcMain.handle('skins:cape', skinCall('Pelerin seçimi', (_e, capeId) => withToken(async (token) => ({ profile: await skins.setCape(token, capeId || null) }))));
    ipcMain.handle('skins:save-current', skinCall('Skin kaydetme', () => withToken(async (token) => ({ skin: await skins.saveCurrent(token) }))));

    // ── Sunucu manifesti ────────────────────────────────────────────────────
    ipcMain.handle('server:apply-manifest', async (event, url, taskId) => {
        try {
            const summary = await servermanifest.applyManifest(url, modProgress(event, taskId));
            return { ok: true, ...summary };
        } catch (err) {
            log.error(`[MAIN] Manifest hatası: ${err.stack || err.message}`);
            return { ok: false, error: friendlyError(err) };
        }
    });

    // ── OptiFine manuel kurulum ─────────────────────────────────────────────
    ipcMain.handle('optifine:manual-install', async (_e, mcVersion) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'OptiFine Jar Dosyasını Seç',
            filters: [{ name: 'OptiFine Jar', extensions: ['jar'] }],
            properties: ['openFile'],
        });
        if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
        try {
            const versionId = optifineLoader.installFromJar(getRootPath(), mcVersion, result.filePaths[0]);
            return { ok: true, versionId };
        } catch (err) {
            return { ok: false, error: friendlyError(err) };
        }
    });
}
