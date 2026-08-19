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

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const os = require('os');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu-cache');
// Bazı Windows sistemlerinde (sürücü/antivirüs etkileşimi) Chromium'un korumalı
// alt süreçleri (GPU, ağ servisi, renderer) kurulu konumdan başlatılınca
// STATUS_BREAKPOINT ile çöküyor: pencere ya hiç açılmıyor ya da görünmez
// kalıyor. Uygulama yalnızca yerel paketlenmiş içerik yüklediği için paketli
// sürümde sandbox'ı kapatmak güvenli ve sorunu kökten çözüyor.
if (app.isPackaged) {
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
    const { getStore } = require('./lib/store.cjs');
    const { getLogsDir, getRootPath } = require('./lib/paths.cjs');
    const { friendlyError } = require('./lib/errors.cjs');
    const { launchGame, stopGame } = require('./launcher.cjs');
    const { getRecentReleaseVersions, getLatestRelease } = require('./lib/versions.cjs');
    const instances = require('./lib/instances.cjs');
    const accounts = require('./lib/accounts.cjs');
    const modrinth = require('./lib/modrinth.cjs');
    const mrpack = require('./lib/mrpack.cjs');
    const servermanifest = require('./lib/servermanifest.cjs');
    const optifineLoader = require('./lib/loaders/optifine.cjs');
    const updater = require('./lib/updater.cjs');
    const { getNews } = require('./lib/news.cjs');

    process.on('uncaughtException', (err) => log.error(`[MAIN] Yakalanmamış hata: ${err.stack || err.message}`));
    process.on('unhandledRejection', (reason) => log.error(`[MAIN] İşlenmemiş promise reddi: ${reason}`));

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
            },
        });
        if (saved?.maximized) mainWindow.maximize();

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
    }

    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        log.info(`[MAIN] HLauncher ${app.getVersion()} başladı (veri: ${getRootPath()})`);
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
    ipcMain.on('hide-launcher', () => mainWindow.hide());
    ipcMain.on('show-launcher', () => { mainWindow.show(); mainWindow.focus(); });

    // ── Oyun ────────────────────────────────────────────────────────────────
    ipcMain.on('launch-game', (event, options) => {
        launchGame(event, options || {}).catch((err) => {
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
    ipcMain.handle('settings:patch', (_e, patch) => getStore().patchSettings(patch || {}));
    ipcMain.handle('servers:set', (_e, servers) => {
        getStore().set('servers', Array.isArray(servers) ? servers : []);
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
    ipcMain.handle('instances:create', (_e, data) => instances.create(data || {}));
    ipcMain.handle('instances:update', (_e, id, patch) => instances.update(id, patch || {}));
    ipcMain.handle('instances:delete', (_e, id) => {
        const removed = instances.remove(id);
        if (getStore().get('activeInstanceId') === id) getStore().set('activeInstanceId', 'default');
        return removed;
    });

    // ── Modlar ──────────────────────────────────────────────────────────────
    const modProgress = (event) => (p) => event.sender.send('mod-progress', p);

    ipcMain.handle('mods:search', (_e, params) => modrinth.search(params || {}));
    ipcMain.handle('mods:list', (_e, instanceId) =>
        modrinth.listModFiles(instances.getModsDir(instanceId)));
    ipcMain.handle('mods:remove', (_e, instanceId, fileName) =>
        modrinth.removeModFile(instances.getModsDir(instanceId), fileName));

    ipcMain.handle('mods:install', async (event, { instanceId, projectId }) => {
        try {
            const instance = instances.get(instanceId);
            if (!instance) throw new Error(`Profil bulunamadı: ${instanceId}`);
            if (!['fabric', 'quilt', 'forge', 'neoforge'].includes(instance.loader)) {
                throw new Error('Mod kurmak için profil bir mod loader kullanmalı (Fabric, Quilt, Forge, NeoForge)');
            }
            const files = await modrinth.installProject({
                modsDir: instances.getModsDir(instanceId),
                projectIdOrSlug: projectId,
                // "En yeni" seçiliyse (null) güncel release'e çözümle
                mcVersion: instance.mcVersion || await getLatestRelease(),
                loader: instance.loader,
                onProgress: modProgress(event),
            });
            return { ok: true, installed: files.map((f) => f.file) };
        } catch (err) {
            log.error(`[MAIN] Mod kurulum hatası: ${err.stack || err.message}`);
            return { ok: false, error: friendlyError(err) };
        }
    });

    ipcMain.handle('mods:check-updates', async (_e, instanceId) => {
        try {
            const instance = instances.get(instanceId);
            if (!instance) throw new Error(`Profil bulunamadı: ${instanceId}`);
            const result = await modrinth.checkUpdates({
                modsDir: instances.getModsDir(instanceId),
                mcVersion: instance.mcVersion || await getLatestRelease(),
                loader: instance.loader,
            });
            return { ok: true, ...result };
        } catch (err) {
            log.error(`[MAIN] Güncelleme denetimi hatası: ${err.stack || err.message}`);
            return { ok: false, error: friendlyError(err) };
        }
    });

    ipcMain.handle('mods:apply-update', async (_e, instanceId, update) => {
        try {
            const file = await modrinth.applyUpdate(instances.getModsDir(instanceId), update || {});
            return { ok: true, file };
        } catch (err) {
            log.error(`[MAIN] Mod güncelleme hatası: ${err.stack || err.message}`);
            return { ok: false, error: friendlyError(err) };
        }
    });

    ipcMain.handle('mods:performance-preset', async (event, instanceId) => {
        try {
            const instance = instances.get(instanceId);
            if (!instance) throw new Error(`Profil bulunamadı: ${instanceId}`);
            const report = await modrinth.installPerformancePreset({
                modsDir: instances.getModsDir(instanceId),
                mcVersion: instance.mcVersion || await getLatestRelease(),
                loader: instance.loader,
                onProgress: modProgress(event),
            });
            return { ok: true, ...report };
        } catch (err) {
            log.error(`[MAIN] Performans preset hatası: ${err.stack || err.message}`);
            return { ok: false, error: friendlyError(err) };
        }
    });

    ipcMain.handle('mrpack:import', async (event) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Modrinth Modpack Seç',
            filters: [{ name: 'Modrinth Modpack', extensions: ['mrpack'] }],
            properties: ['openFile'],
        });
        if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
        try {
            const summary = await mrpack.importMrpack(result.filePaths[0], modProgress(event));
            return { ok: true, ...summary };
        } catch (err) {
            log.error(`[MAIN] mrpack hatası: ${err.stack || err.message}`);
            return { ok: false, error: friendlyError(err) };
        }
    });

    // ── Sunucu manifesti ────────────────────────────────────────────────────
    ipcMain.handle('server:apply-manifest', async (event, url) => {
        try {
            const summary = await servermanifest.applyManifest(url, modProgress(event));
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
