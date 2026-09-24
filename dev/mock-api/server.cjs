// HardSetups launcher API'sinin sahte sunucusu (sözleşme v1.3.1:
// HardSetupsWeb/docs/api/launcher-api.md). L1 uçlarının gerçek davranışı
// (2026-09-24, HardSetupsWeb 602dbf0) birebir taklit edilir; L2+ uçlar
// sözleşmeye göredir. Launcher'ı uçtan uca geliştirmek ve test etmek içindir.
// Bağımlılık yok.
//
//   node dev/mock-api/server.cjs            → http://127.0.0.1:4000
//   HL_API_BASE=http://127.0.0.1:4000 npm run dev
//
// Senaryolar (tarayıcı/launcher dışından tetiklemek için):
//   POST /__mock/scenario {"name": "maintenance"}   (liste: SCENARIOS)
//   POST /__mock/approve  {"userCode": "ABCD-EFGH"} (tarayıcıda onay yerine)
//   GET  /baglan?kod=…                              (elle onay/ret sayfası)
//   GET  /__mock/state                              (testler için iç durum)
//
// Çevrimdışı zarf, sözleşme test vektörlerinin TEST anahtarıyla imzalanır
// (seed: 'hardsetups-launcher-offline-vectors-v1', kid: 'test-ed1'). Paketli
// launcher bu anahtara asla güvenmez; yalnızca geliştirme modunda eklenir.
const http = require('http');
const crypto = require('crypto');
const zlib = require('zlib');
const { URL } = require('url');

const SCENARIOS = new Set([
    'normal', 'maintenance', 'outdated', 'rateLimited', 'slowDown', 'deny', 'expire',
    'noLicense', 'activationLimit', 'suspended', 'insufficientBalance', 'purchaseDisabled',
    'expiredUrls', 'corruptFile',
    'noLoaderPin',      // v1.4: install'da loader.version null → launcher seçer
    'buildPending',     // v1.4: PENDING_BUILD / 409 CONFLICT buildNotReady
    'byLicenseLegacy',  // by-license yanıtında install alanı yok (§11.1 tablosu)
    'notDeployed',      // canlı v0.8.10 gibi: /v1/launcher/* 404, yalnızca by-license çalışır
    'reportDisabled',   // v1.7: features.report=false; rapor 403 REPORT_DISABLED
    'telemetryOn',      // v1.7: features.telemetry=true
    'sparse',           // canlıdaki gibi: vitrin boş, katalogda tek ürün
    'emptyStore',       // vitrin de katalog da boş (boş durum tasarımı için)
]);

const TEST_SEED = crypto.createHash('sha256').update('hardsetups-launcher-offline-vectors-v1').digest();
const TEST_PRIVATE_KEY = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), TEST_SEED]),
    format: 'der', type: 'pkcs8',
});
const TEST_KID = 'test-ed1';

// ─── Kanonik JSON (lisans protokolü §3; launcher'daki ile aynı kural) ──────
function canonicalJson(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `[${value.map((v) => (v === null || v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
    if (typeof value === 'object') {
        const keys = Object.keys(value).filter((k) => value[k] !== null && value[k] !== undefined).sort();
        return `{${keys.map((k) => `${canonicalString(k)}:${canonicalJson(value[k])}`).join(',')}}`;
    }
    if (typeof value === 'string') return canonicalString(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Number.isInteger(value)) return String(value);
    throw new Error(`canonicalJson: ${typeof value}`);
}
function canonicalString(s) {
    const short = { 8: '\\b', 9: '\\t', 10: '\\n', 12: '\\f', 13: '\\r' };
    let out = '"';
    for (const ch of s) {
        const c = ch.codePointAt(0);
        if (ch === '"') out += '\\"';
        else if (ch === '\\') out += '\\\\';
        else if (short[c]) out += short[c];
        else if (c < 0x20) out += `\\u${c.toString(16).padStart(4, '0')}`;
        else out += ch;
    }
    return `${out}"`;
}
function signEnvelope(body) {
    const unsigned = { ...body, kid: TEST_KID };
    const signature = crypto.sign(null, Buffer.from(canonicalJson(unsigned), 'utf8'), TEST_PRIVATE_KEY).toString('base64url');
    return { ...unsigned, signature };
}

// ─── Minimal ZIP (STORE/DEFLATE) üreticisi: arşivli ürün dosyası için ──────
function crc32(buf) {
    let c;
    const table = crc32.table || (crc32.table = Array.from({ length: 256 }, (_, n) => {
        c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    }));
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
function makeZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const nameBuf = Buffer.from(name, 'utf8');
        const deflated = zlib.deflateRawSync(data);
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(deflated.length, 18); local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        locals.push(local, nameBuf, deflated);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(deflated.length, 20); central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBuf);
        offset += local.length + nameBuf.length + deflated.length;
    }
    const centralBuf = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralBuf, end]);
}
// Düz renkli küçük PNG (ürün ikonu); gerçek geliştirme API'si gibi resimler yerel host'tan gelir
function makePng(size, [r, g, b]) {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
    const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
    const raw = Buffer.concat(Array.from({ length: size }, (_, y) => {
        // köşegen şerit: ikon düz renk görünmesin
        const line = Buffer.from(row);
        for (let x = 0; x < size; x++) if (Math.abs(x - y) < size / 6) line.set([255, 255, 255], 1 + x * 3);
        return line;
    }));
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const ICON_COLORS = { 'kum-firtinasi': [214, 150, 60], 'tiktok-doldurdoldur': [70, 140, 220], 'kale-savunmasi': [96, 150, 80] };

// Kapak görseli (16:9, piksel sanatı manzara): vitrin/kütüphane tasarımını gerçekçi görmek için.
// Blok blok üretilir; tek renkli geniş alanlar sayesinde PNG küçük kalır.
const COVER_SCENES = {
    'kum-firtinasi': { sky: [[38, 22, 30], [86, 40, 36], [158, 78, 48], [214, 134, 72]], sun: [246, 204, 138], far: [140, 84, 48], near: [196, 136, 74], top: [226, 176, 104], sunAt: [0.7, 0.34], streaks: true },
    'tiktok-doldurdoldur': { sky: [[14, 16, 36], [26, 28, 66], [48, 44, 108], [84, 62, 142]], sun: [226, 218, 255], far: [36, 40, 84], near: [56, 68, 132], top: [112, 140, 222], sunAt: [0.24, 0.3], stars: true },
    'kale-savunmasi': { sky: [[14, 22, 32], [26, 42, 58], [48, 76, 92], [90, 124, 134]], sun: [234, 230, 206], far: [36, 58, 54], near: [52, 90, 58], top: [98, 144, 76], sunAt: [0.8, 0.26], castle: [24, 28, 34] },
};
function makeCover(slug) {
    const s = COVER_SCENES[slug];
    const B = 12; const W = 80; const H = 45; // 80×45 blok × 12 px = 960×540
    const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
    const horizon = H * 0.6;
    const farH = (x) => H * 0.58 + 2.6 * Math.sin(x * 0.13 + 1) + 1.8 * Math.sin(x * 0.31);
    const nearH = (x) => H * 0.74 + 2.8 * Math.sin(x * 0.085 + 2) + 1.4 * Math.sin(x * 0.27 + 0.5);
    const block = (x, y) => {
        const n = 0.94 + hash(x, y) * 0.1; // ince doku
        if (y >= Math.round(nearH(x))) return shade(y === Math.round(nearH(x)) ? s.top : s.near, n * (1 - (y - nearH(x)) * 0.025));
        if (s.castle && x >= 48 && x <= 64) {
            const base = Math.round(farH(56));
            const tower = (x >= 48 && x <= 51) || (x >= 61 && x <= 64);
            const top = tower ? base - 13 : base - 9;
            const crenel = y === top && x % 2 === 0;
            if (y >= top && !crenel && !(x >= 55 && x <= 57 && y >= base - 4)) return shade(s.castle, n);
        }
        if (y >= Math.round(farH(x))) return shade(s.far, n);
        const [sx, sy] = [s.sunAt[0] * W, s.sunAt[1] * H];
        if ((x - sx) ** 2 + ((y - sy) * 1.1) ** 2 < 22) return shade(s.sun, n);
        if (s.stars && hash(x * 7, y * 3) > 0.985) return [230, 230, 250];
        if (s.streaks && y > 8 && y < horizon - 4 && hash(Math.floor(x / 6), y) > 0.93) return shade(s.sky[3], 1.08);
        const band = Math.min(3, Math.floor((y / horizon) * 4 + (hash(x, y) - 0.5) * 0.35)); // bant sınırında titreşim
        return shade(s.sky[Math.max(0, band)], n);
    };
    const w = W * B; const h = H * B;
    const rows = [];
    for (let by = 0; by < H; by++) {
        const line = Buffer.alloc(1 + w * 3);
        for (let bx = 0; bx < W; bx++) {
            const [r, g, b] = block(bx, by);
            for (let i = 0; i < B; i++) line.set([r, g, b], 1 + (bx * B + i) * 3);
        }
        for (let i = 0; i < B; i++) rows.push(line);
    }
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const coverCache = new Map();

const fakeJar = (id, version) => makeZip([{ name: 'fabric.mod.json', data: Buffer.from(JSON.stringify({ schemaVersion: 1, id, version, depends: { fabricloader: '>=0.16.0' } })) }]);

// ─── Katalog ────────────────────────────────────────────────────────────────
// beta: ?channel=BETA / channel: BETA isteyene verilen daha yeni sürüm (Ayarlar › Beta sürümlerini de kur)
// featured: false → vitrinin "öne çıkanlar"ında yok, yalnızca katalogda (/products)
const PRODUCTS = {
    'kum-firtinasi': {
        name: 'Kum Fırtınası', gameId: 'kumfirtinasi', folder: 'HardSetups-KumFirtinasi', version: '1.4.0', beta: '1.5.0-beta.1', priceMinor: '29900', compareAtMinor: '39900', badges: ['NEW', 'SALE'],
        short: 'Kum fırtınalarının ortasında hayatta kalma macerası. Su bul, sığınak kur, çölü geç.',
        features: ['Tek oyunculu ve çok oyunculu', 'Dinamik kum fırtınaları', 'Türkçe arayüz ve görevler'],
    },
    'tiktok-doldurdoldur': {
        name: 'DoldurDoldur', gameId: 'dolduroldur', folder: 'HardSetups-DoldurDoldur', version: '0.2.0', priceMinor: '19900', compareAtMinor: null, badges: [],
        short: 'TikTok canlı yayınında izleyicilerin hediyeleriyle sandığı doldur; yayını oyuna çevir.',
        features: ['TikTok Live bağlantısı', 'Hediyeye göre oyun içi olaylar', 'Yayıncı paneli'],
    },
    'kale-savunmasi': {
        name: 'Kale Savunması', gameId: 'kalesavunmasi', folder: 'HardSetups-KaleSavunmasi', version: '2.1.0', priceMinor: '24900', compareAtMinor: null, badges: ['BESTSELLER'], featured: false,
        short: 'Dalga dalga gelen saldırılara karşı kaleni kur, tuzaklarını yerleştir, arkadaşlarınla savun.',
        features: ['4 kişiye kadar ortak oyun', '30 dalga, 3 zorluk', 'Kule ve tuzak geliştirmeleri'],
    },
};
const productVersion = (slug, channel) => {
    const p = PRODUCTS[slug];
    return channel === 'BETA' && p.beta ? { id: `v-${p.beta}`, version: p.beta, channel: 'BETA' } : { id: `v-${p.version}`, version: p.version, channel: 'STABLE' };
};

function buildFiles(slug) {
    const p = PRODUCTS[slug];
    const archive = makeZip([
        { name: `${p.folder}/mods/hardsetups-core-0.2.0.jar`, data: fakeJar('hardsetups', '0.2.0') },
        { name: `${p.folder}/mods/hardsetups-${p.gameId}-${p.version}.jar`, data: fakeJar(`hardsetups-${p.gameId}`, p.version) },
        { name: `${p.folder}/README.txt`, data: Buffer.from('yok sayılmalı') },
        { name: '.hs-license', data: Buffer.from(JSON.stringify({ license: 'mock', product: slug })) },
    ]);
    const dep = fakeJar('fabric-api', '0.116.17+1.21.1');
    return { archive, dep };
}

// ─── Durum ──────────────────────────────────────────────────────────────────
const cfg = {
    port: Number(process.env.HL_MOCK_PORT || 4000),
    accessTtl: Number(process.env.HL_MOCK_ACCESS_TTL || 900),
    minVersion: process.env.HL_MOCK_MIN_VERSION || null, // null: sürüm zorlanmıyor
    interval: Number(process.env.HL_MOCK_INTERVAL || 5),
};
const state = {
    scenario: 'normal',
    user: { id: 'u-0001', username: 'mert', avatarUrl: null, emailVerified: true },
    wallet: 25000n,
    deviceCodes: new Map(),   // deviceCode → { userCode, status, expiresAt, lastPoll, interval, deviceId }
    devices: new Map(),       // deviceId → { refresh, prevRefresh, prevRotatedAt, newUsed, abandoned:Set, revoked, installId }
    access: new Map(),        // accessToken → { deviceId, expiresAt }
    installs: new Map(),      // installId → { product, expiresAt, results: [] }
    owned: new Set(['kum-firtinasi']),
    purchases: new Map(),     // Idempotency-Key → sipariş
    readNotifications: new Set(),
    stats: { refreshCalls: 0, installCalls: 0, urlsCalls: 0, results: [], reports: 0, byLicense: 0 },
    homeEtag: `"home-${Date.now()}"`,
};

const rid = () => crypto.randomBytes(8).toString('hex');
const token = (n = 32) => crypto.randomBytes(n).toString('base64url');
const userCode = () => {
    const A = 'BCDFGHJKLMNPQRSTVWXZ';
    const pick = () => A[crypto.randomInt(A.length)];
    return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
};

function cmpSemver(a, b) {
    const parse = (v) => {
        const [core, pre] = String(v).split('-');
        return { nums: core.split('.').map(Number), pre: pre || null };
    };
    const x = parse(a); const y = parse(b);
    for (let i = 0; i < 3; i++) if ((x.nums[i] || 0) !== (y.nums[i] || 0)) return (x.nums[i] || 0) - (y.nums[i] || 0);
    if (x.pre === y.pre) return 0;
    if (!x.pre) return 1;
    if (!y.pre) return -1;
    return x.pre.localeCompare(y.pre, 'en', { numeric: true });
}

// ─── HTTP yardımcıları ──────────────────────────────────────────────────────
function send(res, status, body, headers = {}) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(payload);
}
function fail(res, req, status, code, message, details = {}, headers = {}) {
    const en = (req.headers['accept-language'] || '').startsWith('en');
    send(res, status, { error: { code, message: en ? `${code}` : message, details, requestId: `req_${rid()}` } }, headers);
}
function readBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks);
            if ((req.headers['content-type'] || '').startsWith('application/json')) {
                try { return resolve({ json: JSON.parse(raw.toString('utf8') || '{}'), raw }); } catch { return resolve({ json: null, raw }); }
            }
            resolve({ json: null, raw });
        });
    });
}
function authed(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return { error: 'none' };
    const a = state.access.get(m[1]);
    if (!a) return { error: 'ACCESS_TOKEN_EXPIRED' };
    const dev = state.devices.get(a.deviceId);
    if (!dev || dev.revoked) return { error: 'DEVICE_REVOKED' };
    if (Date.now() >= a.expiresAt) return { error: 'ACCESS_TOKEN_EXPIRED' };
    dev.newUsed = true;
    return { deviceId: a.deviceId, device: dev };
}
function issuePair(deviceId) {
    const accessToken = `hla_${token()}`;
    state.access.set(accessToken, { deviceId, expiresAt: Date.now() + cfg.accessTtl * 1000 });
    const refreshToken = token(48);
    return { accessToken, accessTokenExpiresIn: cfg.accessTtl, refreshToken };
}

function productCard(slug, withOwned, base) {
    const p = PRODUCTS[slug];
    return {
        slug, name: p.name, shortDescription: p.short,
        iconUrl: `${base}/img/${slug}.png`, coverUrl: `${base}/img/${slug}-kapak.png`,
        priceFromMinor: p.priceMinor, compareAtMinor: p.compareAtMinor, currency: 'TRY', badges: p.badges,
        owned: withOwned ? state.owned.has(slug) : false,
    };
}

// ─── Yönlendirici ───────────────────────────────────────────────────────────
async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;
    const base = `http://${req.headers.host}`;
    const { json, raw: rawBody } = await readBody(req);
    const body = json || {};

    // Mock kontrol uçları
    if (p === '/__mock/scenario' && req.method === 'POST') {
        if (!SCENARIOS.has(body.name)) return fail(res, req, 422, 'VALIDATION_FAILED', `Bilinmeyen senaryo: ${body.name}`);
        state.scenario = body.name;
        return send(res, 200, { scenario: state.scenario });
    }
    if (p === '/__mock/approve' && req.method === 'POST') {
        for (const d of state.deviceCodes.values()) if (d.userCode === body.userCode) d.status = body.deny ? 'DENIED' : 'APPROVED';
        return send(res, 200, { ok: true });
    }
    if (p === '/__mock/revoke' && req.method === 'POST') {
        for (const d of state.devices.values()) d.revoked = true;
        return send(res, 200, { ok: true });
    }
    if (p === '/__mock/state') {
        return send(res, 200, { scenario: state.scenario, stats: state.stats, devices: [...state.devices.entries()].map(([id, d]) => ({ id, revoked: d.revoked })) });
    }
    if (p === '/baglan') {
        const kod = url.searchParams.get('kod') || '';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(`<!doctype html><meta charset="utf-8"><title>Mock bağlan</title>
<h1>Launcher bağlantısı (mock)</h1><p>Kod: <b>${kod.replace(/[^A-Z-]/g, '')}</b></p>
<button onclick="fetch('/__mock/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userCode:'${kod.replace(/[^A-Z-]/g, '')}'})}).then(()=>document.body.append(' Onaylandı'))">Onayla</button>
<button onclick="fetch('/__mock/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userCode:'${kod.replace(/[^A-Z-]/g, '')}',deny:true})}).then(()=>document.body.append(' Reddedildi'))">Reddet</button>`);
    }

    // Dış servislerin yerel taklidi (launcher HL_EXTERNAL_BASE ile buraya yönlenir; testler internete çıkmaz)
    if (p === '/modrinth/v2/project/fabric-api/version') {
        const dep = buildFilesCached('kum-firtinasi').dep;
        return send(res, 200, [
            // Birebir eşleşme şartını sınamak için: aynı sürüm numarası ama başka MC sürümü
            { version_number: '0.116.17+1.21.1', loaders: ['fabric'], game_versions: ['1.21'], files: [{ primary: true, filename: 'yanlis.jar', url: `${base}/cdn/kum-firtinasi/dep.jar`, size: 1, hashes: { sha512: '0'.repeat(128) } }] },
            {
                version_number: '0.116.17+1.21.1', loaders: ['fabric'], game_versions: ['1.21.1'],
                files: [{ primary: true, filename: 'fabric-api-0.116.17+1.21.1.jar', url: `${base}/cdn/kum-firtinasi/dep.jar`, size: dep.length, hashes: { sha512: sha512(dep) } }],
            },
        ]);
    }
    if (p.startsWith('/fabric-meta/v2/versions/loader/')) {
        return send(res, 200, [
            { loader: { version: '0.17.0-beta.1', stable: false } },
            { loader: { version: '0.16.14', stable: true } },
            { loader: { version: '0.15.11', stable: true } },
        ]);
    }

    // Ürün resimleri (imageHosts: 127.0.0.1)
    const img = /^\/img\/([a-z0-9-]+?)(-kapak)?\.png$/.exec(p);
    if (img && PRODUCTS[img[1]]) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' });
        if (img[2]) {
            if (!coverCache.has(img[1])) coverCache.set(img[1], makeCover(img[1]));
            return res.end(coverCache.get(img[1]));
        }
        return res.end(makePng(64, ICON_COLORS[img[1]] || [120, 120, 120]));
    }

    // Sahte CDN: Range destekli, süreli adres
    if (p.startsWith('/cdn/')) {
        const exp = Number(url.searchParams.get('exp') || 0);
        if (exp && Date.now() > exp) { res.writeHead(403); return res.end('expired'); }
        const [, , slug, kind] = p.split('/');
        if (!PRODUCTS[slug]) { res.writeHead(404); return res.end(); }
        const files = buildFilesCached(slug);
        let buf = kind === 'dep.jar' ? files.dep : files.archive;
        if (state.scenario === 'corruptFile') buf = Buffer.concat([buf.subarray(0, buf.length - 1), Buffer.from([buf[buf.length - 1] ^ 0xff])]);
        const range = /^bytes=(\d+)-$/.exec(req.headers.range || '');
        if (range) {
            const start = Number(range[1]);
            if (start >= buf.length) { res.writeHead(416); return res.end(); }
            res.writeHead(206, { 'Content-Range': `bytes ${start}-${buf.length - 1}/${buf.length}`, 'Content-Length': buf.length - start });
            return res.end(buf.subarray(start));
        }
        res.writeHead(200, { 'Content-Length': buf.length, 'Accept-Ranges': 'bytes' });
        return res.end(buf);
    }

    if (!p.startsWith('/v1/')) return fail(res, req, 404, 'NOT_FOUND', 'Bulunamadı');

    // Genel durumlar (§0)
    if (state.scenario === 'rateLimited') {
        return fail(res, req, 429, 'RATE_LIMITED', 'Çok fazla istek', { retryAfterSeconds: 2 }, { 'Retry-After': '2' });
    }
    // minVersion doluyken config dışındaki launcher uçları, X-HL-Version eksik ya da düşükse 426
    const version = req.headers['x-hl-version'];
    const minVersion = state.scenario === 'outdated' ? '99.0.0' : cfg.minVersion;
    if (minVersion && p.startsWith('/v1/launcher/') && p !== '/v1/launcher/config' && (!version || cmpSemver(version, minVersion) < 0)) {
        return fail(res, req, 426, 'LAUNCHER_OUTDATED', 'Launcher sürümün çok eski, güncellemen gerekiyor', { minVersion, version: version || null });
    }
    if (state.scenario === 'notDeployed' && p.startsWith('/v1/launcher/')) {
        return fail(res, req, 404, 'NOT_FOUND', 'Kayıt bulunamadı.');
    }
    if (state.scenario === 'maintenance' && p !== '/v1/launcher/config') {
        return fail(res, req, 503, 'MAINTENANCE_MODE', 'Bakım çalışması var', { message: 'Kısa bir bakım yapıyoruz', scheduledEnd: new Date(Date.now() + 3600e3).toISOString() });
    }

    // ── Herkese açık uçlar ──
    if (p === '/v1/launcher/config' && req.method === 'GET') {
        return send(res, 200, {
            minVersion: minVersion || null, latestVersion: null, // latestVersion L3'e kadar null
            maintenance: { active: state.scenario === 'maintenance', message: state.scenario === 'maintenance' ? 'Kısa bir bakım yapıyoruz' : null },
            features: { purchase: state.scenario !== 'purchaseDisabled', telemetry: state.scenario === 'telemetryOn', report: state.scenario !== 'reportDisabled' },
            offlineGraceHours: 72,
            downloadHosts: ['cdn.hardsetups.com', 'cdn.modrinth.com', 'meta.fabricmc.net'],
            imageHosts: ['cdn.hardsetups.com', '127.0.0.1', 'localhost'], // geliştirmedeki gerçek API gibi yerel resimler
            linkHosts: ['hardsetups.com', '*.hardsetups.com', 'youtube.com', 'www.youtube.com', 'youtu.be', 'discord.gg', 'discord.com', 'modrinth.com'],
            links: { site: 'https://hardsetups.com', store: 'https://magaza.hardsetups.com', support: 'https://support.hardsetups.com', launcher: 'https://hardsetups.com/launcher' },
        });
    }
    if (p === '/v1/launcher/device/code' && req.method === 'POST') {
        const deviceCode = token(32);
        const code = userCode();
        state.deviceCodes.set(deviceCode, { userCode: code, status: 'PENDING', expiresAt: Date.now() + 600e3, lastPoll: 0, interval: cfg.interval, deviceName: String(body.deviceName || '').slice(0, 64) });
        return send(res, 200, {
            deviceCode, userCode: code, verificationUri: `${base}/baglan`, verificationUriComplete: `${base}/baglan?kod=${code}`,
            interval: cfg.interval, expiresIn: 600,
        });
    }
    if (p === '/v1/launcher/device/token' && req.method === 'POST') {
        const d = state.deviceCodes.get(body.deviceCode);
        if (!d || d.status === 'CONSUMED') return fail(res, req, 400, 'EXPIRED_TOKEN', 'Kod geçersiz ya da süresi doldu');
        const now = Date.now();
        if (state.scenario === 'slowDown' && !d.slowed) { // ilk sorgu her zaman SLOW_DOWN alır
            d.slowed = true; d.lastPoll = now; d.interval += 5;
            return fail(res, req, 400, 'SLOW_DOWN', 'Çok sık soruldu', { interval: d.interval });
        }
        d.lastPoll = now;
        if (state.scenario === 'expire' || now > d.expiresAt) { d.status = 'CONSUMED'; return fail(res, req, 400, 'EXPIRED_TOKEN', 'Kodun süresi doldu'); }
        // Reddedilen kod: önce ACCESS_DENIED, sonraki sorguda EXPIRED_TOKEN
        if (state.scenario === 'deny' || d.status === 'DENIED') { d.status = 'CONSUMED'; return fail(res, req, 400, 'ACCESS_DENIED', 'Bağlantı reddedildi'); }
        if (d.status !== 'APPROVED') return fail(res, req, 400, 'AUTHORIZATION_PENDING', 'Onay bekleniyor', { interval: d.interval });
        d.status = 'CONSUMED'; // onaylanan kod bir kez toplanır
        const deviceId = crypto.randomUUID();
        const pair = issuePair(deviceId);
        state.devices.set(deviceId, { refresh: pair.refreshToken, prevRefresh: null, prevRotatedAt: 0, newUsed: false, abandoned: new Set(), revoked: false, installId: req.headers['x-hl-device'] || null });
        return send(res, 200, { ...pair, deviceId, user: state.user });
    }
    if (p === '/v1/launcher/token/refresh' && req.method === 'POST') {
        state.stats.refreshCalls++;
        const rt = String(body.refreshToken || '');
        for (const [deviceId, dev] of state.devices) {
            if (dev.revoked) continue;
            if (dev.refresh === rt) {
                const pair = issuePair(deviceId);
                Object.assign(dev, { prevRefresh: rt, prevRotatedAt: Date.now(), refresh: pair.refreshToken, newUsed: false });
                return send(res, 200, pair);
            }
            if (dev.prevRefresh === rt) {
                // §1.4 kayıp yanıt toleransı: 60 sn içinde ve yeni çift hiç kullanılmadıysa yeniden üret;
                // yolda kaybolan (terk edilen) çift geçersiz olur
                if (Date.now() - dev.prevRotatedAt <= 60e3 && !dev.newUsed) {
                    const pair = issuePair(deviceId);
                    dev.abandoned.add(dev.refresh);
                    Object.assign(dev, { refresh: pair.refreshToken, prevRotatedAt: Date.now(), newUsed: false });
                    return send(res, 200, pair);
                }
                dev.revoked = true;
                return fail(res, req, 401, 'DEVICE_REVOKED', 'Bu cihazın bağlantısı güvenlik nedeniyle kaldırıldı');
            }
            if (dev.abandoned.has(rt)) { // terk edilen çiftin token'ı sonradan gelirse: çalınma
                dev.revoked = true;
                return fail(res, req, 401, 'DEVICE_REVOKED', 'Bu cihazın bağlantısı güvenlik nedeniyle kaldırıldı');
            }
        }
        return fail(res, req, 401, 'REFRESH_TOKEN_INVALID', 'Oturum geçersiz, yeniden bağlan');
    }
    if (p === '/v1/downloads/by-license' && req.method === 'POST') {
        state.stats.byLicense++;
        const key = String(body.licenseKey || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (key !== 'HSMNOPQRSTUVWXYZ') return fail(res, req, 404, 'LICENSE_NOT_FOUND', 'Lisans anahtarı bulunamadı');
        const slug = 'kum-firtinasi';
        if (body.product && body.product !== slug) return fail(res, req, 422, 'VALIDATION_FAILED', 'Bu anahtar başka bir ürün için', { reason: 'PRODUCT_MISMATCH' });
        const f = buildFilesCached(slug);
        const file = { versionId: 'v-140', name: `${PRODUCTS[slug].folder}.zip`, version: PRODUCTS[slug].version, channel: 'STABLE', sha256: sha256(f.archive), sizeBytes: String(f.archive.length), url: `${base}/cdn/${slug}/archive.zip?exp=${Date.now() + 300e3}`, expiresInSeconds: 300 };
        if (state.scenario === 'byLicenseLegacy' || state.scenario === 'notDeployed') {
            return send(res, 200, { license: { product: slug, owner: 'mert', expiresAt: null, features: [] }, files: [file] });
        }
        // v1.4 §11.0: launcher'a açık üründe kurulum bilgisi (loader sabitlenmemiş olabilir)
        const m = installManifest('unused', slug, base, true);
        return send(res, 200, {
            license: { product: slug, owner: 'mert', expiresAt: null, features: [] },
            files: [{ ...file, kind: 'archive', extract: m.files[0].extract }],
            install: {
                instance: m.instance, minecraft: m.minecraft, loader: { type: 'fabric', version: null, profileUrl: null },
                java: m.java, memory: m.memory, dependencies: m.dependencies,
                licenseConfig: { ...m.licenseConfig, entries: { [`lisans.anahtar.${PRODUCTS[slug].gameId}`]: String(body.licenseKey) } },
                managedPaths: m.managedPaths, quickPlay: m.quickPlay,
            },
        });
    }
    if (p === '/v1/launcher/home' && req.method === 'GET') {
        const a = authed(req);
        const personal = !a.error;
        const etag = `${state.homeEtag}-${personal ? 'p' : 'a'}`;
        if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
        if (['sparse', 'emptyStore'].includes(state.scenario)) {
            return send(res, 200, { hero: [], announcements: [], featured: [], campaigns: [], coupons: [], news: [], updates: [], expiring: [] }, { ETag: etag });
        }
        return send(res, 200, {
            hero: [
                { id: 'h1', title: 'Kum Fırtınası çıktı', subtitle: 'Çölün ortasında hayatta kal', imageUrl: `${base}/img/kum-firtinasi-kapak.png`, action: { type: 'product', slug: 'kum-firtinasi' } },
                { id: 'h2', title: 'DoldurDoldur', subtitle: 'TikTok canlı yayınları için', imageUrl: `${base}/img/tiktok-doldurdoldur-kapak.png`, action: { type: 'product', slug: 'tiktok-doldurdoldur' } },
                { id: 'h3', title: 'Bilinmeyen tür gizlenmeli', subtitle: '', imageUrl: null, action: { type: 'gizemli', slug: 'x' } },
            ],
            announcements: [{ id: 'a1', text: 'Launcher portalı test ediliyor', variant: 'INFO', link: { label: 'İncele', url: 'https://hardsetups.com/launcher' }, dismissible: true }],
            featured: Object.keys(PRODUCTS).filter((s) => PRODUCTS[s].featured !== false).map((s) => productCard(s, personal, base)),
            campaigns: [{ id: 'c1', title: 'Launcher\'a özel %10', description: 'Launcher\'dan alışverişte geçerli', couponCode: 'LAUNCHER10', endsAt: new Date(Date.now() + 3 * 86400e3).toISOString(), products: ['kum-firtinasi'] }],
            // v1.7 (L5): hesaba özel kuponlar yalnızca girişliyken; bozuk tür/değer launcher'da elenir
            coupons: personal ? [
                { code: 'HLW-7K2MQ9PX', type: 'PERCENT', value: 15, endsAt: new Date(Date.now() + 30 * 86400e3).toISOString(), description: 'HLauncher hoş geldin kuponu' },
                { code: 'SABIT-50', type: 'FIXED', value: 5000, endsAt: null, description: null },
                { code: 'BOZUK', type: 'BOGO', value: 1 },
            ] : [],
            news: [
                { id: 'n1', title: 'Kum Fırtınası 1.4 yayında', excerpt: 'Yeni harita, yeni yaratıklar.', imageUrl: `${base}/img/kum-firtinasi-kapak.png`, url: 'https://hardsetups.com/haber/kum-firtinasi-1-4', publishedAt: new Date().toISOString() },
                { id: 'n2', title: 'Kale Savunması 2.1: ortak oyun', excerpt: 'Artık dört kişiye kadar arkadaşlarınla aynı kaleyi savunabilirsin.', imageUrl: `${base}/img/kale-savunmasi-kapak.png`, url: 'https://hardsetups.com/haber/kale-savunmasi-2-1', publishedAt: new Date(Date.now() - 4 * 86400e3).toISOString() },
            ],
            updates: personal ? [{ product: 'kum-firtinasi', version: '1.4.0', publishedAt: new Date().toISOString(), changelog: '- Yeni harita' }] : [],
            expiring: [],
        }, { ETag: etag });
    }
    if (p === '/v1/launcher/products' && req.method === 'GET') {
        const slugs = state.scenario === 'emptyStore' ? [] : state.scenario === 'sparse' ? ['kum-firtinasi'] : Object.keys(PRODUCTS);
        return send(res, 200, { products: slugs.map((s) => productCard(s, !authed(req).error, base)) }); // §5
    }
    const productMatch = /^\/v1\/launcher\/products\/([a-z0-9-]+)$/.exec(p);
    if (productMatch && req.method === 'GET') {
        const slug = productMatch[1];
        if (!PRODUCTS[slug]) return fail(res, req, 404, 'NOT_FOUND', 'Ürün bulunamadı');
        return send(res, 200, {
            ...productCard(slug, !authed(req).error, base),
            description: `## ${PRODUCTS[slug].name}\n\n${PRODUCTS[slug].short}\n\nMock ürün açıklaması. <script>alert(1)</script> ham HTML işlenmemeli.\n\n- Kendi klasörüne kurulur, diğer profillerine dokunmaz\n- Güncellemeler kütüphaneden tek tıkla\n\n[Mağaza](https://magaza.hardsetups.com)`,
            gallery: [{ type: 'image', url: `${base}/img/${slug}-kapak.png`, thumbUrl: `${base}/img/${slug}-kapak.png` }, { type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thumbUrl: `${base}/img/${slug}-kapak.png` }],
            features: PRODUCTS[slug].features,
            requirements: { minecraft: '1.21.1', loader: 'fabric', ramMinMb: 2048, ramRecommendedMb: 4096 },
            rating: { average: 4.8, count: 37 }, reviews: [{ author: 'oyuncu1', rating: 5, text: 'Çok iyi', createdAt: new Date().toISOString() }],
            plans: [{ slug: 'aylik', name: 'Aylık', durationDays: 30, priceMinor: PRODUCTS[slug].priceMinor, compareAtMinor: PRODUCTS[slug].compareAtMinor, maxActivations: 2 }],
            storeUrl: `https://magaza.hardsetups.com/urun/${slug}`,
        });
    }

    // v1.7 (L5) §15: sayaçlar; token isteğe bağlı, her zaman 204. Mock yalnızca geçerli olayları saklar.
    if (p === '/v1/launcher/telemetry' && req.method === 'POST') {
        const TYPES = new Set(['launch', 'launch_failed', 'crash', 'install', 'install_failed']);
        const events = Array.isArray(json?.events) ? json.events.slice(0, 100) : [];
        state.telemetry = state.telemetry || [];
        state.telemetry.push({
            authorized: !!req.headers.authorization,
            device: !!req.headers['x-hl-device'],
            events: events.filter((e) => TYPES.has(e?.type) && ['windows', 'macos', 'linux'].includes(e?.os)),
            keys: [...new Set(events.flatMap((e) => Object.keys(e || {})))].sort(),
        });
        res.writeHead(204);
        return res.end();
    }

    // ── Kimlik gerektiren uçlar ──
    if (!p.startsWith('/v1/launcher/')) return fail(res, req, 404, 'NOT_FOUND', 'Bulunamadı');
    const a = authed(req);
    if (a.error === 'none') return fail(res, req, 401, 'UNAUTHENTICATED', 'Giriş gerekli');
    if (a.error) return fail(res, req, 401, a.error, a.error === 'DEVICE_REVOKED' ? 'Bu cihazın bağlantısı kaldırıldı' : 'Oturum süresi doldu');

    if (p === '/v1/launcher/logout' && req.method === 'POST') {
        a.device.revoked = true;
        res.writeHead(204); return res.end();
    }
    if (p === '/v1/launcher/me' && req.method === 'GET') {
        return send(res, 200, {
            user: state.user, wallet: { balanceMinor: String(state.wallet), currency: 'TRY' },
            unreadNotifications: 2 - state.readNotifications.size,
            links: { account: 'https://hardsetups.com/hesap', wallet: 'https://hardsetups.com/cuzdan', topup: 'https://hardsetups.com/cuzdan/yukle', devices: 'https://hardsetups.com/hesap/cihazlar', licenses: 'https://hardsetups.com/hesap/lisanslar' },
        });
    }
    if (p === '/v1/launcher/library' && req.method === 'GET') {
        const now = new Date();
        const channel = url.searchParams.get('channel') === 'BETA' ? 'BETA' : 'STABLE';
        const items = Object.keys(PRODUCTS).filter((s) => state.owned.has(s)).map((slug, i) => ({
            licenseId: `lic-${i + 1}`, keyLast4: '7F2A',
            product: { slug, name: PRODUCTS[slug].name, iconUrl: `${base}/img/${slug}.png`, coverUrl: `${base}/img/${slug}-kapak.png` },
            status: { suspended: 'SUSPENDED', buildPending: 'PENDING_BUILD' }[state.scenario] || 'ACTIVE', expiresAt: null,
            latestVersion: { ...productVersion(slug, channel), publishedAt: now.toISOString() },
            installable: !['suspended', 'buildPending'].includes(state.scenario),
            reason: { suspended: 'suspended', buildPending: 'buildPending' }[state.scenario] || null,
        }));
        const offline = signEnvelope({
            userId: state.user.id, deviceId: a.deviceId, issuedAt: now.toISOString(),
            validUntil: new Date(now.getTime() + 72 * 3600e3).toISOString(),
            licenses: items.map((it) => ({ licenseId: it.licenseId, product: it.product.slug, status: it.status, expiresAt: null })),
        });
        return send(res, 200, { items, offline });
    }
    if (p === '/v1/launcher/install' && req.method === 'POST') {
        state.stats.installCalls++;
        const slug = body.product;
        if (!PRODUCTS[slug]) return fail(res, req, 404, 'NOT_FOUND', 'Ürün bulunamadı');
        if (state.scenario === 'noLicense' || !state.owned.has(slug)) return fail(res, req, 403, 'LICENSE_REQUIRED', 'Bu ürün için lisansın yok', { storeUrl: `https://magaza.hardsetups.com/urun/${slug}` });
        if (state.scenario === 'buildPending') return fail(res, req, 409, 'CONFLICT', 'Lisansına özel dosya hazırlanıyor', { reason: 'buildNotReady' });
        if (state.scenario === 'suspended') return fail(res, req, 403, 'LICENSE_SUSPENDED', 'Lisansın askıya alınmış');
        if (state.scenario === 'activationLimit') return fail(res, req, 409, 'LICENSE_ACTIVATION_LIMIT', 'Cihaz sınırına ulaştın', { used: 2, limit: 2, manageUrl: 'https://hardsetups.com/hesap/cihazlar' });
        const installId = `inst_${rid()}`;
        state.installs.set(installId, { product: slug, expiresAt: Date.now() + 3600e3 });
        return send(res, 200, installManifest(installId, slug, base, false, body.channel === 'BETA' ? 'BETA' : 'STABLE'));
    }
    const urlsMatch = /^\/v1\/launcher\/install\/([\w-]+)\/urls$/.exec(p);
    if (urlsMatch && req.method === 'POST') {
        state.stats.urlsCalls++;
        const inst = state.installs.get(urlsMatch[1]);
        if (!inst || Date.now() > inst.expiresAt) return fail(res, req, 410, 'INSTALL_EXPIRED', 'Kurulum oturumunun süresi doldu');
        const m = installManifest(urlsMatch[1], inst.product, base, true);
        return send(res, 200, { files: m.files.map((f) => ({ id: f.id, url: f.url, expiresInSeconds: 300 })) });
    }
    const resultMatch = /^\/v1\/launcher\/install\/([\w-]+)\/result$/.exec(p);
    if (resultMatch && req.method === 'POST') {
        state.stats.results.push({ installId: resultMatch[1], ...body });
        res.writeHead(204); return res.end();
    }
    if (p === '/v1/launcher/purchase/quote' && req.method === 'POST') {
        if (state.scenario === 'purchaseDisabled') return fail(res, req, 403, 'PURCHASE_DISABLED', 'Launcher\'dan satın alma kapalı');
        const prod = PRODUCTS[body.product];
        if (!prod) return fail(res, req, 404, 'NOT_FOUND', 'Ürün bulunamadı');
        const total = BigInt(prod.priceMinor);
        const balance = state.scenario === 'insufficientBalance' ? 1000n : state.wallet;
        if (body.couponCode && body.couponCode !== 'LAUNCHER10') return fail(res, req, 422, 'COUPON_INVALID', 'Kupon geçersiz');
        return send(res, 200, {
            quoteId: `q_${rid()}_${body.product}`, subtotalMinor: String(total), discountMinor: '0', totalMinor: String(total),
            balanceMinor: String(balance), sufficient: balance >= total, shortfallMinor: String(balance >= total ? 0n : total - balance), expiresIn: 120,
            // v1.6
            currency: 'TRY',
            consents: [{ key: 'mesafeli-satis', title: 'Mesafeli satış sözleşmesi', url: 'https://hardsetups.com/sozlesmeler/mesafeli-satis' }],
            billingProfile: { ready: true, manageUrl: 'https://hardsetups.com/hesap/fatura' },
            topupUrl: 'https://hardsetups.com/cuzdan/yukle',
        });
    }
    if (p === '/v1/launcher/purchase' && req.method === 'POST') {
        if (!req.headers['idempotency-key']) return fail(res, req, 422, 'VALIDATION_FAILED', 'Idempotency-Key gerekli', { reason: 'idempotencyKeyRequired' });
        // Aynı Idempotency-Key → her zaman ilk siparişin yanıtı (reused: true), para ikinci kez çekilmez
        const idem = req.headers['idempotency-key'];
        if (state.purchases.has(idem)) return send(res, 200, { ...state.purchases.get(idem), reused: true });
        if (state.scenario === 'insufficientBalance') {
            return fail(res, req, 409, 'INSUFFICIENT_BALANCE', 'Bakiyen yetersiz', { shortfallMinor: '28900', topupUrl: 'https://hardsetups.com/cuzdan/yukle' });
        }
        if (!(Array.isArray(body.consents) && body.consents.includes('mesafeli-satis'))) {
            return fail(res, req, 422, 'CONSENT_REQUIRED', 'Sözleşmeleri onaylaman gerekiyor', { missing: ['mesafeli-satis'] });
        }
        const slug = String(body.quoteId || '').split('_').slice(2).join('_');
        if (!PRODUCTS[slug]) return fail(res, req, 409, 'QUOTE_EXPIRED', 'Teklifin süresi doldu');
        state.wallet -= BigInt(PRODUCTS[slug].priceMinor);
        state.owned.add(slug);
        const order = { orderNo: `HS-${Date.now()}`, status: 'COMPLETED', licenseId: `lic-${slug}`, reused: false };
        state.purchases.set(idem, order);
        state.stats.purchases = (state.stats.purchases || 0) + 1;
        return send(res, 200, order);
    }
    if (p === '/v1/launcher/notifications' && req.method === 'GET') {
        const items = [
            { id: 'n1', title: 'Hoş geldin', body: 'Launcher hesabın bağlandı', url: 'https://hardsetups.com', createdAt: new Date().toISOString() },
            { id: 'n2', title: 'Kum Fırtınası 1.4.0', body: 'Yeni sürüm yayında', url: null, createdAt: new Date().toISOString() },
        ].map((n) => ({ ...n, readAt: state.readNotifications.has(n.id) ? new Date().toISOString() : null }));
        return send(res, 200, { items, nextCursor: null });
    }
    if (p === '/v1/launcher/notifications/read' && req.method === 'POST') {
        for (const id of body.all ? ['n1', 'n2'] : body.ids || []) state.readNotifications.add(id);
        res.writeHead(204); return res.end();
    }
    if (p === '/v1/launcher/report' && req.method === 'POST') {
        const raw = rawBody.toString('utf8');
        if (!/^multipart\/form-data; boundary=/.test(req.headers['content-type'] || '')) return fail(res, req, 422, 'VALIDATION_FAILED', 'multipart bekleniyordu');
        // v1.7 (L5) §10
        if (state.scenario === 'reportDisabled') return fail(res, req, 403, 'REPORT_DISABLED', 'Sorun bildirme kapalı');
        if (!/name="consent"\r\n\r\ntrue\r\n/.test(raw)) return fail(res, req, 422, 'VALIDATION_FAILED', 'Onay gerekli', { field: 'consent' });
        const field = (name) => (raw.match(new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`)) || [])[1] || '';
        const subject = field('subject');
        const message = field('message');
        if (subject.length < 5 || subject.length > 200 || message.length < 10 || message.length > 20000) return fail(res, req, 422, 'VALIDATION_FAILED', 'Konu ya da açıklama uzunluğu geçersiz');
        const names = [...raw.matchAll(/name="logs"; filename="([^"]*)"/g)].map((m) => m[1]);
        if (names.length > 5) return fail(res, req, 422, 'ATTACHMENT_LIMIT', 'En fazla 5 dosya eklenebilir.', { reason: 'tooManyFiles', max: 5 }); // v1.7.1
        const badExt = names.filter((n) => !/\.(log|txt|json|gz)$/i.test(n));
        if (badExt.length) return fail(res, req, 422, 'ATTACHMENT_REJECTED', 'İzinsiz dosya türü', { files: badExt });
        if (rawBody.length > 10 * 1024 * 1024) return fail(res, req, 413, 'PAYLOAD_TOO_LARGE', 'Dosyalar 10 MB\'ı geçiyor');
        state.reportSubjects = state.reportSubjects || new Map();
        if (state.reportSubjects.has(subject)) return fail(res, req, 409, 'TICKET_DUPLICATE', 'Bu konuyla az önce talep açıldı', { ticketNo: state.reportSubjects.get(subject) });
        state.stats.reports++;
        const ticketNo = 1000 + state.stats.reports;
        state.reportSubjects.set(subject, ticketNo);
        state.lastReport = { raw, fileCount: names.length };
        return send(res, 201, { ticketNo, url: `https://support.hardsetups.com/talepler/${ticketNo}` });
    }
    return fail(res, req, 404, 'NOT_FOUND', 'Bulunamadı');
}

const fileCache = new Map();
function buildFilesCached(slug) {
    if (!fileCache.has(slug)) fileCache.set(slug, buildFiles(slug));
    return fileCache.get(slug);
}
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sha512 = (b) => crypto.createHash('sha512').update(b).digest('hex');

function installManifest(installId, slug, base, fresh = false, channel = 'STABLE') {
    const p = PRODUCTS[slug];
    const f = buildFilesCached(slug);
    const exp = state.scenario === 'expiredUrls' && !fresh ? Date.now() - 1000 : Date.now() + 300e3;
    return {
        installId,
        instance: { id: slug, folderName: slug, displayName: p.name },
        version: productVersion(slug, channel),
        minecraft: { version: '1.21.1' },
        loader: state.scenario === 'noLoaderPin'
            ? { type: 'fabric', version: null, profileUrl: null }
            : { type: 'fabric', version: '0.16.14', profileUrl: 'https://meta.fabricmc.net/v2/versions/loader/1.21.1/0.16.14/profile/json' },
        java: { major: 21 },
        memory: { minMb: 2048, recommendedMb: 4096 },
        files: [
            {
                id: 'f1', kind: 'archive', source: 'hardsetups', url: `${base}/cdn/${slug}/archive.zip?exp=${exp}`,
                sha256: sha256(f.archive), sizeBytes: String(f.archive.length), expiresInSeconds: 300,
                extract: [{ from: `${p.folder}/mods/`, to: 'mods/' }, { from: '.hs-license', to: '.hardsetups/lisans-damgasi.json' }],
            },
        ],
        // v1.5 §7.8.1: Modrinth bağımlılıkları files'a değil buraya; launcher birebir sürümle çözer
        dependencies: [{ source: 'modrinth', project: 'fabric-api', version: '0.116.17+1.21.1' }],
        licenseConfig: { path: 'config/hardsetups/ayarlar.json', schemaVersion: 2, format: 'flat-map', entries: { [`lisans.anahtar.${p.gameId}`]: 'HSMN-OPQR-STUV-WXYZ' } },
        managedPaths: ['mods/'],
        quickPlay: { singleplayer: null },
    };
}

function start(port = cfg.port) {
    const server = http.createServer((req, res) => {
        handle(req, res).catch((err) => { console.error(err); fail(res, req, 500, 'INTERNAL', 'Sunucu hatası'); });
    });
    return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { start, state, cfg, canonicalJson, TEST_KID };

if (require.main === module) {
    start().then((s) => console.log(`HardSetups mock API: http://127.0.0.1:${s.address().port}  (senaryo: ${state.scenario})`));
}
