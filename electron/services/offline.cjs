// Çevrimdışı oynama zarfı (sözleşme §6): GET /v1/launcher/library yanıtındaki
// "offline" nesnesi Ed25519 ile imzalıdır. İnternet yokken kurulu bir HardSetups
// ürünü yalnızca bu zarf doğrulanırsa açılır. Saf, testli; saklama library servisinde.
const crypto = require('crypto');

// Derleme sırasında gömülü üretim anahtarları. /v1/license/keys ucundan gelen
// anahtara GÜVENİLMEZ (sahte sunucu kendi anahtarını da yayımlar).
// Rotasyon: yeni kid önce buraya eklenir, o sürüm yayılınca sunucu geçer (§6.2).
const EMBEDDED_KEYS = {
    ed1: 'TqvvqfBKxeeLSFD5KLCJQ3dZ3IG5kxVxNPc5yYrIjH8', // SPKI sha256: ff729e21…a02ed8aa
};

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

/** Ham 32 baytlık (base64url) Ed25519 açık anahtarından KeyObject. */
function keyFromRaw(rawBase64url) {
    const raw = Buffer.from(rawBase64url, 'base64url');
    if (raw.length !== 32) throw new Error('Ed25519 açık anahtarı 32 bayt olmalı');
    return crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
}

/** kid → anahtar listesi. Değer tek anahtar ya da dizi olabilir (geliştirmede aynı kid'e iki anahtar). */
function buildKeyring(rawKeys) {
    const ring = new Map();
    for (const [kid, raw] of Object.entries(rawKeys)) {
        for (const r of Array.isArray(raw) ? raw : [raw]) ring.set(kid, [...(ring.get(kid) || []), keyFromRaw(r)]);
    }
    return ring;
}

/**
 * Geliştirme anahtarları: "kid:ham32base64url,kid:…" (HL_DEV_OFFLINE_KEYS). Yalnızca
 * paketlenmemiş sürümde çağrılır; üretim anahtarlarının YANINA eklenir.
 */
function parseDevKeys(text) {
    const out = {};
    for (const part of String(text || '').split(',').map((s) => s.trim()).filter(Boolean)) {
        const m = /^([\w:.-]{1,32}):([A-Za-z0-9_-]{43})$/.exec(part);
        if (!m) continue;
        out[m[1]] = [...(out[m[1]] || []), m[2]];
    }
    return out;
}

const DEFAULT_KEYRING = buildKeyring(EMBEDDED_KEYS);

/**
 * Lisans protokolü §3 kanonik JSON'u — sunucudaki
 * packages/contracts/src/license-protocol.ts ile bayt bayt aynı olmak zorunda:
 * anahtarlar UTF-16 kod birimine göre sıralı, null/undefined nesne üyeleri
 * atılır (dizideki null kalır), yalnızca tam sayı, boşluk yok, yalnızca " \ ve
 * kontrol karakterleri kaçırılır (Unicode ham kalır).
 */
function canonicalJson(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) {
        return `[${value.map((item) => (item === null || item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
    }
    const type = typeof value;
    if (type === 'object') {
        const keys = Object.keys(value).filter((k) => value[k] !== null && value[k] !== undefined).sort();
        return `{${keys.map((k) => `${canonicalString(k)}:${canonicalJson(value[k])}`).join(',')}}`;
    }
    if (type === 'string') return canonicalString(value);
    if (type === 'boolean') return value ? 'true' : 'false';
    if (type === 'number') {
        if (!Number.isInteger(value)) throw new Error(`canonicalJson: tam sayı olmayan değer (${value})`);
        return String(value);
    }
    throw new Error(`canonicalJson: desteklenmeyen tür ${type}`);
}

const SHORT_ESCAPES = { 0x08: '\\b', 0x09: '\\t', 0x0a: '\\n', 0x0c: '\\f', 0x0d: '\\r' };

function canonicalString(input) {
    let out = '"';
    for (const char of input) {
        const code = char.codePointAt(0);
        if (char === '"') out += '\\"';
        else if (char === '\\') out += '\\\\';
        else if (SHORT_ESCAPES[code]) out += SHORT_ESCAPES[code];
        else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, '0')}`;
        else out += char;
    }
    return `${out}"`;
}

/**
 * İmza girdisi: yalnızca `signature` çıkarılmış gövdenin kanonik JSON'u; `kid`
 * (ve varsa `alg`) girdide KALIR. Lisans protokolü yanıtlarıyla aynı tek kural
 * (sözleşme v1.2 §6.1, license-protocol.md §3).
 */
function signingInput(signed) {
    const body = { ...(signed || {}) };
    delete body.signature;
    return canonicalJson(body);
}

function parseTime(iso) {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : NaN;
}

/**
 * Zarfı doğrular (§6.3). Kullanılamazsa playable boştur.
 * @returns {{signatureValid: boolean, usable: boolean, reason: string|null, playable: Object<string, boolean>}}
 */
function verifyEnvelope(envelope, { deviceId, now = Date.now(), keyring = DEFAULT_KEYRING } = {}) {
    const result = (signatureValid, reason, playable = {}) => ({ signatureValid, usable: !reason, reason, playable });
    if (!envelope || typeof envelope !== 'object') return result(false, 'missing');

    const keys = keyring.get(envelope.kid);
    if (!keys?.length) return result(false, 'unknownKid');

    let valid = false;
    try {
        const signature = Buffer.from(String(envelope.signature || ''), 'base64url');
        const input = Buffer.from(signingInput(envelope), 'utf8');
        valid = signature.length === 64 && keys.some((key) => crypto.verify(null, input, key, signature));
    } catch { valid = false; }
    if (!valid) return result(false, 'badSignature');

    if (!deviceId || envelope.deviceId !== deviceId) return result(true, 'deviceMismatch');
    const validUntil = parseTime(envelope.validUntil);
    if (!(now < validUntil)) return result(true, 'expired');

    const playable = {};
    for (const lic of Array.isArray(envelope.licenses) ? envelope.licenses : []) {
        if (!lic?.licenseId) continue;
        const expires = lic.expiresAt ? parseTime(lic.expiresAt) : null;
        playable[lic.licenseId] = lic.status === 'ACTIVE' && (expires === null || now < expires);
    }
    return result(true, null, playable);
}

/**
 * Saat geri alma koruması (§6.4): referans, doğrulanmış zarfların en büyük
 * issuedAt değeridir. Sistem saati bundan 5 dk'dan fazla gerideyse false.
 */
function clockTrusted(now, referenceIssuedAt) {
    const ref = parseTime(referenceIssuedAt);
    if (!Number.isFinite(ref)) return true; // henüz referans yok
    return now >= ref - CLOCK_TOLERANCE_MS;
}

module.exports = {
    EMBEDDED_KEYS, keyFromRaw, buildKeyring, parseDevKeys,
    canonicalJson, signingInput, verifyEnvelope, clockTrusted,
};
