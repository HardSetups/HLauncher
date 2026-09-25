// Otomatik güncelleme (electron-updater).
// - Kaynak (alpha.7'den beri): HardSetups güncelleme akışı (aşağıda). Sürümler panelden
//   (Admin › Lisanslar › Launcher › Sürümler) yayımlanır. alpha.7 köprü sürümdür: GitHub'a da
//   yüklenir ki GitHub'ı dinleyen kurulu alpha.6 ve öncesi ona geçebilsin.
// - Açılışta ve açık kaldığı sürece her CHECK_INTERVAL'de bir denetler;
//   Ayarlar'daki anahtar kapatılırsa zamanlayıcı durur (yeniden başlatma gerekmez).
// - Güncelleme arka planda iner; "hazır" olunca arayüz kullanıcıya sorar.
//   Kullanıcı ertelerse launcher kapanırken kurulur.
// Durum makinesi arayüze 'updater-status' kanalıyla akar.
const log = require('./logger.cjs');

const CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 saat
const FIRST_CHECK_DELAY_MS = 8 * 1000;        // açılışı yavaşlatma

// Güncelleme kaynağı (sözleşme §12). 'hardsetups': generic sağlayıcı
// https://api.hardsetups.com/v1/launcher/update/<kanal> (latest.yml sunucuda üretilir, dosya
// adresi göreli → 302 ile imzalı CDN; blockmap yok → nsis.differentialPackage: false).
// Kademeli yayın kovası X-HL-Device'tan hesaplanır; kurulum kimliği YALNIZCA bu kaynağa gider.
// 'github': package.json build.publish (HardSetups/HLauncher-releases) — alpha.6'ya kadar.
const UPDATE_SOURCE = 'hardsetups';
const HARDSETUPS_UPDATE_BASE = 'https://api.hardsetups.com/v1/launcher/update';

/** Kaynak + kanal → electron-updater besleme ayarı (saf, testli). */
function feedFor(source, channel = 'stable') {
    if (source !== 'hardsetups') return null; // app-update.yml (GitHub) geçerli
    const ch = channel === 'beta' ? 'beta' : 'stable';
    return { provider: 'generic', url: `${HARDSETUPS_UPDATE_BASE}/${ch}` };
}

/** HardSetups akışına giden başlıklar (saf, testli): kurulum kimliği + sürüm. */
function feedHeaders(installId, appVersion) {
    const h = { 'X-HL-Version': String(appVersion) };
    if (typeof installId === 'string' && /^[0-9a-f-]{36}$/.test(installId)) h['X-HL-Device'] = installId;
    return h;
}

/** Yayımlanmış uygun sürüm yoksa akış latest.yml için 404 döner: bu "güncelleme yok" demektir (§12). */
function isNoReleaseError(err) {
    return err?.statusCode === 404 || /\b404\b/.test(String(err?.message || ''));
}

let autoUpdater = null;
let mainWindow = null;
let timer = null;
let lastStatus = { state: 'idle' };
let activeFeed = null; // HardSetups akışı kullanılıyorsa (feedFor sonucu)

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
        const feed = feedFor(UPDATE_SOURCE, store.get('settings')?.updateChannel);
        activeFeed = feed;
        if (feed) {
            autoUpdater.setFeedURL(feed);
            log.info(`[UPDATER] Kaynak: ${feed.url}`);
        }

        // Başlıklar (kurulum kimliği, sürüm) yalnızca latest.yml isteğine gider: dosya ucu başlık
        // istemez ve 302 ile CDN'e yönlenir (§0: bu başlıklar yalnızca API host'una). electron-updater
        // 'update-available'ı indirmeyi başlatmadan hemen önce, eşzamanlı yayar.
        const feedRequestHeaders = () => feedHeaders(store.get('installId'), app.getVersion());
        let pendingVersion = null;
        autoUpdater.on('checking-for-update', () => {
            if (feed) autoUpdater.requestHeaders = feedRequestHeaders();
            if (lastStatus.state !== 'downloading') send({ state: 'checking' });
        });
        autoUpdater.on('update-available', (info) => {
            if (feed) autoUpdater.requestHeaders = null;
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
            if (feed && isNoReleaseError(err) && lastStatus.state !== 'downloading') {
                log.info('[UPDATER] Akışta yayımlanmış sürüm yok');
                send({ state: 'uptodate' });
                return;
            }
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
    autoUpdater.checkForUpdates().catch((err) => {
        if (activeFeed && isNoReleaseError(err)) send({ state: 'uptodate' });
        else send({ state: 'error', message: err.message });
    });
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

module.exports = { initUpdater, setEnabled, checkNow, installNow, getStatus, plainReleaseNotes, feedFor, feedHeaders, isNoReleaseError, UPDATE_SOURCE };
