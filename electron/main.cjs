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

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

const { launchGame, stopGame, getRecentReleaseVersions } = require('./launcher.cjs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        backgroundColor: '#0a0a0c',
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.on('close-app', () => app.quit());
ipcMain.on('minimize-app', () => mainWindow.minimize());
ipcMain.on('hide-launcher', () => mainWindow.hide());
ipcMain.on('show-launcher', () => { mainWindow.show(); mainWindow.focus(); });
ipcMain.on('stop-game', () => stopGame());
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
        return { versions: [], error: err.message };
    }
});

ipcMain.on('launch-game', (event, options) => {
    launchGame(event, options).catch(err => {
        console.error(err);
        event.reply('launch-error', err.message);
    });
});
