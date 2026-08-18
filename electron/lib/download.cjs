// Sağlam dosya indirme: geçici dosyaya yazma, isteğe bağlı SHA1/SHA256
// doğrulaması, başarısızlıkta bekleyerek yeniden deneme.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { httpGetStream } = require('./http.cjs');
const log = require('./logger.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} url
 * @param {string} dest Hedef dosya yolu (üst klasör otomatik oluşturulur)
 * @param {object} [opts]
 * @param {(percent:number)=>void} [opts.onProgress] 0-100
 * @param {string} [opts.sha1] Beklenen SHA-1 (hex)
 * @param {string} [opts.sha256] Beklenen SHA-256 (hex)
 * @param {number} [opts.retries=3]
 */
async function downloadFile(url, dest, opts = {}) {
    const { onProgress, sha1, sha256, retries = 3 } = opts;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;

    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await attemptDownload(url, tmp, { onProgress, sha1, sha256 });
            fs.renameSync(tmp, dest);
            return dest;
        } catch (err) {
            lastErr = err;
            try { fs.unlinkSync(tmp); } catch { /* yoksa sorun değil */ }
            if (attempt < retries) {
                log.warn(`[DOWNLOAD] Deneme ${attempt}/${retries} başarısız (${url}): ${err.message} — tekrar deneniyor`);
                await sleep(attempt * 1500);
            }
        }
    }
    throw lastErr;
}

function attemptDownload(url, tmpPath, { onProgress, sha1, sha256 }) {
    return httpGetStream(url, { timeout: 30000 }).then((res) => new Promise((resolve, reject) => {
        const total = parseInt(res.headers['content-length'], 10) || 0;
        let received = 0;
        const hashers = [];
        if (sha1) hashers.push({ hash: crypto.createHash('sha1'), expected: sha1.toLowerCase(), name: 'SHA-1' });
        if (sha256) hashers.push({ hash: crypto.createHash('sha256'), expected: sha256.toLowerCase(), name: 'SHA-256' });

        const file = fs.createWriteStream(tmpPath);
        const abort = (err) => { res.destroy(); file.destroy(); reject(err); };

        res.on('data', (chunk) => {
            received += chunk.length;
            for (const h of hashers) h.hash.update(chunk);
            if (onProgress && total > 0) onProgress(Math.floor((received / total) * 100));
        });
        res.on('error', abort);
        file.on('error', abort);
        res.pipe(file);
        file.on('finish', () => file.close(() => {
            if (total > 0 && received < total) {
                return reject(new Error(`Eksik indirme: ${received}/${total} bayt`));
            }
            for (const h of hashers) {
                const actual = h.hash.digest('hex');
                if (actual !== h.expected) {
                    return reject(Object.assign(
                        new Error(`${h.name} doğrulaması başarısız — dosya bozuk indi`),
                        { code: 'EHASHMISMATCH' }
                    ));
                }
            }
            resolve();
        }));
    }));
}

module.exports = { downloadFile };
