// HardSetups oturumunun diskteki hâli: <veri kökü>\hardsetups-session.json.
// Yenileme token'ı Electron safeStorage (Windows'ta DPAPI) ile şifrelidir.
// Şifreleme kullanılamıyorsa dosya HİÇ yazılmaz (sözleşme §1.3): oturum yalnızca
// bellekte yaşar, launcher kapanınca yeniden bağlanmak gerekir.
const fs = require('fs');

function encryptionAvailable() {
    try { return require('electron').safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function createEncryptedFileStorage(filePath, { log } = {}) {
    function clear() {
        try { fs.rmSync(filePath, { force: true }); } catch { /* yoksa geç */ }
    }

    function load() {
        let raw;
        try { raw = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
        if (typeof raw?.refresh !== 'string' || !raw.refresh.startsWith('enc:') || !encryptionAvailable()) return null;
        try {
            const { safeStorage } = require('electron');
            const refreshToken = safeStorage.decryptString(Buffer.from(raw.refresh.slice(4), 'base64'));
            return { refreshToken, deviceId: raw.deviceId || null, user: raw.user || null };
        } catch {
            log?.warn('[PORTAL] Oturum dosyası çözülemedi (başka kullanıcı/makine?), yok sayılıyor');
            clear();
            return null;
        }
    }

    function save({ refreshToken, deviceId, user }) {
        if (!refreshToken) { clear(); return false; }
        if (!encryptionAvailable()) {
            log?.warn('[PORTAL] Şifreli depolama yok: HardSetups oturumu yalnızca bellekte tutulacak');
            clear();
            return false;
        }
        const { safeStorage } = require('electron');
        const payload = {
            v: 1,
            refresh: `enc:${safeStorage.encryptString(refreshToken).toString('base64')}`,
            deviceId: deviceId || null,
            user: user ? { id: user.id, username: user.username, avatarUrl: user.avatarUrl || null, emailVerified: !!user.emailVerified } : null,
        };
        const tmp = `${filePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
        fs.renameSync(tmp, filePath);
        return true;
    }

    return { load, save, clear };
}

module.exports = { createEncryptedFileStorage };
