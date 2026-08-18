// Kalıcı dosya logu: %APPDATA%\.hlauncher\logs\hlauncher.log (5 MB rotasyon).
const path = require('path');
const log = require('electron-log');
const { getLogsDir } = require('./paths.cjs');

log.transports.file.resolvePathFn = () => path.join(getLogsDir(), 'hlauncher.log');
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';
log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}';

module.exports = log;
