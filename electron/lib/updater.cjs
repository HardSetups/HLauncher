// Otomatik güncelleme (electron-updater + GitHub Releases).
// Durum makinesi arayüze 'updater-status' kanalıyla akar; Ayarlar'daki
// "Güncellemeleri Denetle" düğmesi checkNow ile elle tetikler.
// Yalnızca paketli sürümde çalışır; hatalar loglanır, kullanıcıyı engellemez.
const log = require('./logger.cjs');

let autoUpdater = null;
let mainWindow = null;
let lastStatus = { state: 'idle' };

function send(status) {
    lastStatus = status;
    try { mainWindow?.webContents.send('updater-status', status); } catch { /* pencere kapalı */ }
}

function initUpdater(app, store, win) {
    mainWindow = win;
    if (!app.isPackaged) {
        lastStatus = { state: 'dev' };
        return;
    }
    try {
        ({ autoUpdater } = require('electron-updater'));
        autoUpdater.logger = log;
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
        autoUpdater.on('update-available', (info) => send({ state: 'downloading', version: info.version, percent: 0 }));
        autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.floor(p.percent || 0) }));
        autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }));
        autoUpdater.on('update-not-available', () => send({ state: 'uptodate' }));
        autoUpdater.on('error', (err) => {
            log.info(`[UPDATER] Hata: ${err.message}`);
            send({ state: 'error', message: err.message });
        });

        if (store.get('settings').checkUpdates) {
            autoUpdater.checkForUpdates().catch((err) => {
                log.info(`[UPDATER] Güncelleme kontrolü başarısız: ${err.message}`);
            });
        }
    } catch (err) {
        log.info(`[UPDATER] Başlatılamadı: ${err.message}`);
        lastStatus = { state: 'error', message: err.message };
    }
}

/** Ayarlar'daki düğmeden elle denetim. */
function checkNow() {
    if (!autoUpdater) return lastStatus;
    autoUpdater.checkForUpdates().catch((err) => send({ state: 'error', message: err.message }));
    return { state: 'checking' };
}

/** İndirilen güncellemeyi hemen kur (uygulama yeniden başlar). */
function installNow() {
    if (autoUpdater && lastStatus.state === 'ready') autoUpdater.quitAndInstall();
}

function getStatus() { return lastStatus; }

module.exports = { initUpdater, checkNow, installNow, getStatus };
