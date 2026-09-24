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

const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
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
    const { launchGame, stopGame } = require('./launcher.cjs');
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

    // Tarayıcıda yalnızca https + izinli host açılır (sözleşme §2).
    const openExternalSafe = (url) => {
        if (links.isAllowedLink(url)) {
            shell.openExternal(url);
            return true;
        }
        let host = '';
        try { host = new URL(url).host; } catch { /* geçersiz adres */ }
        log.warn(`[MAIN] İzinsiz bağlantı açılmadı: ${host || '(geçersiz adres)'}`);
        return false;
    };

    let mainWindow;

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

        // Pencere boyut/konumunu kapanışta hatırla
        mainWindow.on('close', () => {
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

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });

    // ── Pencere / uygulama ──────────────────────────────────────────────────
    ipcMain.on('close-app', () => app.quit());
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
    ipcMain.on('launch-game', (event, options) => {
        const opts = options || {};
        // "Kaldığın yerden devam" sırası + son seçilen profil
        if (opts.instanceId && instances.get(opts.instanceId)) {
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
    ipcMain.handle('system:info', () => ({
        totalMemGb: Math.round(os.totalmem() / (1024 ** 3)),
        appVersion: app.getVersion(),
        logsDir: getLogsDir(),
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
        };
    });
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

    // ── Profiller ───────────────────────────────────────────────────────────
    ipcMain.handle('instances:list', () => instances.list());
    // Renderer yalnızca kullanıcı alanlarını yazabilir (origin/managedFiles vb. korunur)
    ipcMain.handle('instances:create', (_e, data) => {
        const clean = instances.sanitizeInstancePatch(data);
        return instances.create({ ...clean, name: clean.name || '', loader: clean.loader || 'release' });
    });
    ipcMain.handle('instances:update', (_e, id, patch) => instances.update(id, instances.sanitizeInstancePatch(patch)));
    ipcMain.handle('instances:delete', (_e, id) => {
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
