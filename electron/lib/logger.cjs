// Kalıcı dosya logu: %APPDATA%\.hlauncher\logs\hlauncher.log (5 MB rotasyon).
// Her satır dosyaya/konsola gitmeden önce redact() süzgecinden geçer:
// token ve lisans anahtarı günlüğe asla yazılmaz.
const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const { getLogsDir } = require('./paths.cjs');
const { redact, scrubLogFiles } = require('./redact.cjs');

// alpha.5 ve öncesi MCLC'nin "--accessToken <jwt>" satırını olduğu gibi yazıyordu.
// Mevcut log dosyaları bir kez, ilk log yazılmadan önce temizlenir.
const SCRUB_MARKER = '.redacted-v1';
try {
    const marker = path.join(getLogsDir(), SCRUB_MARKER);
    if (!fs.existsSync(marker) && scrubLogFiles(getLogsDir()).failed === 0) {
        fs.writeFileSync(marker, new Date().toISOString());
    }
} catch { /* temizlenemezse bir sonraki açılışta tekrar denenir */ }

log.hooks.push((message) => {
    message.data = message.data.map((item) => {
        if (typeof item === 'string') return redact(item);
        if (item instanceof Error) return redact(item.stack || item.message);
        return item;
    });
    return message;
});

log.transports.file.resolvePathFn = () => path.join(getLogsDir(), 'hlauncher.log');
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}';

module.exports = log;
