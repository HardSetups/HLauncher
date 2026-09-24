// Otomatik güncelleme (electron-updater + GitHub Releases).
// - Kaynak: package.json → build.publish (HardSetups/HLauncher-releases: yalnızca
//   derlenmiş dosyalar, herkese açık). alpha.6 öncesi kurulumlar kaynak repoyu
//   dinlediği için sürümler scripts/release.cjs ile iki repoya birden yüklenir.
//   Sürüm bir ön sürümse (1.0.0-alpha.N) Pre-release'ler de görülür.
// - Açılışta ve açık kaldığı sürece her CHECK_INTERVAL'de bir denetler;
//   Ayarlar'daki anahtar kapatılırsa zamanlayıcı durur (yeniden başlatma gerekmez).
// - Güncelleme arka planda iner; "hazır" olunca arayüz kullanıcıya sorar.
//   Kullanıcı ertelerse launcher kapanırken kurulur.
// Durum makinesi arayüze 'updater-status' kanalıyla akar.
const log = require('./logger.cjs');

const CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 saat
const FIRST_CHECK_DELAY_MS = 8 * 1000;        // açılışı yavaşlatma

let autoUpdater = null;
let mainWindow = null;
let timer = null;
let lastStatus = { state: 'idle' };

function send(status) {
    lastStatus = { ...status, at: Date.now() };
    try { mainWindow?.webContents.send('updater-status', lastStatus); } catch { /* pencere kapalı */ }
}

/**
 * GitHub sürüm notlarını düz metne çevirir (saf, testli). electron-updater
 * notları HTML dize ya da [{version, note}] dizisi olarak verebilir.
 */
function plainReleaseNotes(notes, max = 1500) {
    if (!notes) return '';
    const raw = Array.isArray(notes) ? notes.map((n) => n?.note || '').join('\n\n') : String(notes);
    const text = raw
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|li|h[1-6]|ul|ol)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function check() {
    if (!autoUpdater) return;
    // İndirme sürerken ya da güncelleme hazırken tekrar denetlemeye gerek yok
    if (['downloading', 'ready'].includes(lastStatus.state)) return;
    autoUpdater.checkForUpdates().catch((err) => {
        log.info(`[UPDATER] Güncelleme kontrolü başarısız: ${err.message}`);
    });
}

function startSchedule() {
    stopSchedule();
    setTimeout(check, FIRST_CHECK_DELAY_MS);
    timer = setInterval(check, CHECK_INTERVAL_MS);
}

function stopSchedule() {
    if (timer) clearInterval(timer);
    timer = null;
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

        let pendingVersion = null;
        autoUpdater.on('checking-for-update', () => {
            if (lastStatus.state !== 'downloading') send({ state: 'checking' });
        });
        autoUpdater.on('update-available', (info) => {
            pendingVersion = info.version;
            log.info(`[UPDATER] Yeni sürüm bulundu: ${info.version}`);
            send({ state: 'downloading', version: info.version, percent: 0, notes: plainReleaseNotes(info.releaseNotes) });
        });
        autoUpdater.on('download-progress', (p) => send({
            ...lastStatus,
            state: 'downloading',
            version: pendingVersion,
            percent: Math.floor(p.percent || 0),
            bytesPerSecond: p.bytesPerSecond || 0,
        }));
        autoUpdater.on('update-downloaded', (info) => {
            log.info(`[UPDATER] İndirildi: ${info.version}`);
            send({ state: 'ready', version: info.version, notes: plainReleaseNotes(info.releaseNotes) });
        });
        autoUpdater.on('update-not-available', () => send({ state: 'uptodate' }));
        autoUpdater.on('error', (err) => {
            log.info(`[UPDATER] Hata: ${err.message}`);
            // Hazır bir güncelleme varsa sonraki denetimin ağ hatası onu gölgelemesin
            if (lastStatus.state !== 'ready') send({ state: 'error', message: err.message });
        });

        if (store.get('settings').checkUpdates !== false) startSchedule();
    } catch (err) {
        log.info(`[UPDATER] Başlatılamadı: ${err.message}`);
        lastStatus = { state: 'error', message: err.message };
    }
}

/** Ayarlar'daki "Otomatik güncelleme" anahtarı değişince çağrılır. */
function setEnabled(enabled) {
    if (!autoUpdater) return;
    if (enabled) startSchedule();
    else stopSchedule();
}

/** Ayarlar'daki düğmeden elle denetim. */
function checkNow() {
    if (!autoUpdater) return lastStatus;
    if (['downloading', 'ready'].includes(lastStatus.state)) return lastStatus;
    autoUpdater.checkForUpdates().catch((err) => send({ state: 'error', message: err.message }));
    return { state: 'checking' };
}

/** İndirilen güncellemeyi hemen kur (uygulama yeniden başlar). */
function installNow() {
    if (autoUpdater && lastStatus.state === 'ready') {
        // isSilent=true: kurulum ekranı gösterme; isForceRunAfter=true: bitince launcher'ı aç
        autoUpdater.quitAndInstall(true, true);
    }
}

function getStatus() { return lastStatus; }

module.exports = { initUpdater, setEnabled, checkNow, installNow, getStatus, plainReleaseNotes };
