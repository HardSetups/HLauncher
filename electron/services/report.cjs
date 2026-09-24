// "Sorun bildir" (sözleşme §10): günlükleri ekleyerek destek talebi.
// Kurallar:
// - Dosyaları renderer değil ANA SÜREÇ toplar ve temizler; gönderimde yeniden toplanır
//   (renderer'dan gelen metne güvenilmez, yalnızca hangi dosyaların seçildiği gelir)
// - Temizleme: token'lar (--accessToken dahil), licenseKey ve lisans.anahtar* → [gizli];
//   C:\Users\<ad> → C:\Users\<kullanıcı>
// - En çok 5 dosya, toplam 10 MB; her dosyanın yalnızca son 2 MB'ı
// - Kullanıcı gönderilecek içeriği önizler; onay kutusu varsayılan olarak işaretsiz
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { redact } = require('../lib/redact.cjs');

const MAX_FILES = 5;
const MAX_TOTAL = 10 * 1024 * 1024;
const MAX_PER_FILE = 2 * 1024 * 1024;
const PREVIEW_CHARS = 64 * 1024;

/** Kullanıcı yollarını anonimleştirir (saf, testli). */
function anonymizePaths(text) {
    return String(text)
        .replace(/([A-Za-z]:[\\/]{1,2}Users[\\/]{1,2})([^\\/\r\n"'<>|:*?]+)/gi, '$1<kullanıcı>')
        .replace(/(\/home\/|\/Users\/)([^/\s"']+)/g, '$1<kullanıcı>');
}

/** Rapora girecek metnin tamamı bu süzgeçten geçer (saf, testli). */
function sanitizeReportText(text) {
    return anonymizePaths(redact(String(text)));
}

/** Dosyanın son maxBytes baytı (çok büyük günlükler için). */
function readTail(file, maxBytes = MAX_PER_FILE) {
    const size = fs.statSync(file).size;
    if (size <= maxBytes) return fs.readFileSync(file, 'utf8');
    const fd = fs.openSync(file, 'r');
    try {
        const buf = Buffer.alloc(maxBytes);
        fs.readSync(fd, buf, 0, maxBytes, size - maxBytes);
        const text = buf.toString('utf8');
        return `[… dosyanın son ${Math.round(maxBytes / 1024)} KB'ı …]\n${text.slice(text.indexOf('\n') + 1)}`;
    } finally { fs.closeSync(fd); }
}

function newestFile(dir, pattern) {
    try {
        return fs.readdirSync(dir)
            .filter((n) => pattern.test(n))
            .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
            .sort((a, b) => b.t - a.t)[0]?.n || null;
    } catch { return null; }
}

/**
 * Eklenebilecek dosyalar (temizlenmiş). id'ler sabit: 'launcher', 'game', 'crash'.
 * @returns {{id: string, name: string, size: number, text: string}[]}
 */
function collectReportFiles({ logsDir, instanceDir }) {
    const out = [];
    const add = (id, name, file) => {
        try {
            if (!file || !fs.existsSync(file)) return;
            const text = sanitizeReportText(readTail(file));
            out.push({ id, name, size: Buffer.byteLength(text), text });
        } catch { /* okunamayan dosya eklenmez */ }
    };
    add('launcher', 'hlauncher.log', path.join(logsDir, 'hlauncher.log'));
    if (instanceDir) {
        add('game', 'latest.log', path.join(instanceDir, 'logs', 'latest.log'));
        const crash = newestFile(path.join(instanceDir, 'crash-reports'), /^crash-.*\.txt$/);
        if (crash) add('crash', crash, path.join(instanceDir, 'crash-reports', crash));
    }
    return out.slice(0, MAX_FILES);
}

/** Önizleme: renderer'a yalnızca temizlenmiş içeriğin başı gider. */
function previewOf(files) {
    return files.map((f) => ({ id: f.id, name: f.name, size: f.size, preview: f.text.length > PREVIEW_CHARS ? `${f.text.slice(0, PREVIEW_CHARS)}\n[…]` : f.text }));
}

/** multipart/form-data gövdesi (sözleşme §10: subject, message, product?, consent=true, logs[]). */
function buildMultipart(fields, files) {
    const boundary = `----hlauncher${crypto.randomBytes(12).toString('hex')}`;
    const parts = [];
    const esc = (s) => String(s).replace(/"/g, '%22').replace(/[\r\n]/g, ' ');
    for (const [k, v] of Object.entries(fields)) {
        if (v === undefined || v === null || v === '') continue;
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${esc(k)}"\r\n\r\n${v}\r\n`, 'utf8'));
    }
    let total = 0;
    for (const f of files) {
        const data = Buffer.from(f.text, 'utf8');
        total += data.length;
        if (total > MAX_TOTAL) throw Object.assign(new Error('Eklenen dosyalar 10 MB sınırını aşıyor'), { code: 'EREPORTSIZE' });
        const filename = /\.(log|txt|json)$/i.test(f.name) ? f.name : `${f.name}.txt`;
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="logs"; filename="${esc(filename)}"\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n`, 'utf8'), data, Buffer.from('\r\n'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

module.exports = { anonymizePaths, sanitizeReportText, collectReportFiles, previewOf, buildMultipart, MAX_FILES, MAX_TOTAL };
