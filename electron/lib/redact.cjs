// Günlüğe ve hata raporuna giden metinden gizli değerleri ayıklar (saf, testli).
// Kural: token, lisans anahtarı ve cihaz kodu hiçbir koşulda dosyaya yazılmaz.
// MCLC başlatma argümanlarını ("--accessToken <jwt>") debug satırında olduğu
// gibi basar; logger.cjs bu fonksiyonu her log satırına uygular.
const fs = require('fs');
const path = require('path');

const MASK = '[gizli]';

const SECRET_FIELDS = [
    'accessToken', 'access_token', 'refreshToken', 'refresh_token', 'refresh',
    'deviceCode', 'device_code', 'idToken', 'id_token', 'mcToken', 'licenseKey',
    'lisans\\.anahtar(?:\\.[\\w-]+)?',
].join('|');

const RULES = [
    // Minecraft/MCLC argümanı: --accessToken <değer>
    [/(--accessToken\s+)("[^"]*"|\S+)/gi, `$1${MASK}`],
    // HTTP yetki başlığı
    [/(\bBearer\s+)[A-Za-z0-9._~+/=-]+/g, `$1${MASK}`],
    // JWT biçimli değerler (Minecraft/Xbox oturum token'ları)
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, MASK],
    // "alan": "değer" / alan=değer biçimli gizli alanlar (JSON dökümü, sorgu dizesi)
    [new RegExp(`((?:"|\\b)(?:${SECRET_FIELDS})"?\\s*[:=]\\s*)("[^"]*"|[^\\s,&}\\]]+)`, 'gi'), `$1"${MASK}"`],
];

/** Metindeki gizli değerleri [gizli] ile değiştirir. */
function redact(text) {
    if (typeof text !== 'string' || !text) return text;
    let out = text;
    for (const [re, replacement] of RULES) out = out.replace(re, replacement);
    return out;
}

/**
 * Klasördeki mevcut .log dosyalarını temizler (eski sürümlerin yazdığı token'lar).
 * Yalnızca değişen dosyalar geçici dosya + rename ile yeniden yazılır.
 * @returns {{cleaned: number, failed: number}}
 */
function scrubLogFiles(dir) {
    let cleaned = 0;
    let failed = 0;
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return { cleaned, failed }; }
    for (const name of entries) {
        if (!name.endsWith('.log')) continue;
        const file = path.join(dir, name);
        try {
            const original = fs.readFileSync(file, 'utf8');
            const clean = redact(original);
            if (clean === original) continue;
            const tmp = `${file}.tmp`;
            fs.writeFileSync(tmp, clean, 'utf8');
            fs.renameSync(tmp, file);
            cleaned++;
        } catch {
            failed++; // kilitli dosya: bir sonraki açılışta tekrar denenir
        }
    }
    return { cleaned, failed };
}

module.exports = { redact, scrubLogFiles, MASK };
