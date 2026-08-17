const electronApi = require('electron');
console.log('[DEBUG] electron type:', typeof electronApi, '| keys:', electronApi ? Object.keys(electronApi).slice(0, 5) : 'null/undefined');
const { app, BrowserWindow, ipcMain } = electronApi;
const path = require('path');

app.commandLine.appendSwitch('disable-gpu-cache');

const { launchGame, stopGame } = require('./launcher.js');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        transparent: true,
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
ipcMain.on('stop-game', () => stopGame());
ipcMain.on('launch-game', (event, options) => {
    launchGame(event, options).catch(err => {
        console.error(err);
        event.reply('launch-error', err.message);
    });
});
