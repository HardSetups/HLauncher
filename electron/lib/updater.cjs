// Otomatik güncelleme (electron-updater + GitHub Releases).
// Yalnızca paketli sürümde ve ayarlardan açıksa çalışır; hatalar loglanır,
// kullanıcıyı asla engellemez. Yayın deposu package.json build.publish'te tanımlı.
const log = require('./logger.cjs');

function initUpdater(app, store) {
    if (!app.isPackaged) return;
    if (!store.get('settings').checkUpdates) return;
    try {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.logger = log;
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.checkForUpdatesAndNotify().catch((err) => {
            log.info(`[UPDATER] Güncelleme kontrolü başarısız: ${err.message}`);
        });
    } catch (err) {
        log.info(`[UPDATER] Başlatılamadı: ${err.message}`);
    }
}

module.exports = { initUpdater };
