// Uygulama veri klasörleri. HLauncher verisi %APPDATA%\.hlauncher altında yaşar;
// eski markaların (.hardsetups, .thehardcraft) klasörleri ilk erişimde taşınır.
const path = require('path');
const fs = require('fs');
const os = require('os');

const DATA_DIR_NAME = '.hlauncher';
const LEGACY_DIR_NAMES = ['.hardsetups', '.thehardcraft'];

let cachedRoot = null;

function getAppData() {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

function getRootPath() {
    if (cachedRoot) return cachedRoot;
    const appData = getAppData();
    const newRoot = path.join(appData, DATA_DIR_NAME);

    if (!fs.existsSync(newRoot)) {
        for (const legacy of LEGACY_DIR_NAMES) {
            const oldRoot = path.join(appData, legacy);
            if (!fs.existsSync(oldRoot)) continue;
            try {
                fs.renameSync(oldRoot, newRoot);
                console.log(`[PATHS] Veri klasörü taşındı: ${legacy} → ${DATA_DIR_NAME}`);
                break;
            } catch (err) {
                // Taşınamadı (kilitli dosya vb.) — eski konumla devam et, veri kaybetme.
                console.error(`[PATHS] ${legacy} taşınamadı, eski konum kullanılacak:`, err.message);
                cachedRoot = oldRoot;
                return cachedRoot;
            }
        }
    }

    fs.mkdirSync(newRoot, { recursive: true });
    cachedRoot = newRoot;
    return cachedRoot;
}

function getLogsDir() {
    const dir = path.join(getRootPath(), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getInstancesRoot() {
    const dir = path.join(getRootPath(), 'instances');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getInstanceDir(instanceId) {
    // 'default' profili geriye dönük uyumluluk için kök dizinde oynar
    // (mevcut kullanıcıların dünyaları/ayarları kaybolmasın).
    if (instanceId === 'default') return getRootPath();
    const dir = path.join(getInstancesRoot(), instanceId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getInstallersDir() {
    const dir = path.join(getRootPath(), 'installers');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

module.exports = { getRootPath, getLogsDir, getInstancesRoot, getInstanceDir, getInstallersDir };
