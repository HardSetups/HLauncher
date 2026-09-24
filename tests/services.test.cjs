// Ağ ve eşzamanlılık gerektiren servis testleri: `npm test` (unit.test.cjs'ten sonra).
// Gerçek internete çıkmaz; her şey 127.0.0.1 üzerinde geçici bir HTTP sunucusuyla.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');

const tmpAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'hlauncher-svc-'));
process.env.APPDATA = tmpAppData;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ─── Yardımcı: yapılandırılabilir yerel dosya sunucusu ─────────────────────
function startServer(handler) {
    return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => {
            const base = `http://127.0.0.1:${server.address().port}`;
            resolve({ server, base, close: () => new Promise((r) => server.close(r)) });
        });
    });
}

/** Range destekli statik yanıt */
function serveBuffer(req, res, buf) {
    const range = /^bytes=(\d+)-$/.exec(req.headers.range || '');
    if (range) {
        const start = Number(range[1]);
        if (start >= buf.length) { res.writeHead(416); return res.end(); }
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${buf.length - 1}/${buf.length}`, 'Content-Length': buf.length - start });
        return res.end(buf.subarray(start));
    }
    res.writeHead(200, { 'Content-Length': buf.length });
    res.end(buf);
}

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const sha512 = (b) => crypto.createHash('sha512').update(b).digest('hex');
const tmpDir = () => fs.mkdtempSync(path.join(tmpAppData, 'dl-'));

// ─── services/downloader.cjs ────────────────────────────────────────────────
const { downloadVerified, runQueue } = require('../electron/services/downloader.cjs');
const DATA = crypto.randomBytes(300 * 1024);
const HOSTS = ['cdn.hardsetups.com'];

test('downloader: indirir, sha256 + boyut doğrular, .part bırakmaz', async () => {
    const srv = await startServer((req, res) => serveBuffer(req, res, DATA));
    try {
        const dest = path.join(tmpDir(), 'mods', 'a.jar');
        let progress = 0;
        const r = await downloadVerified(
            { url: `${srv.base}/a.jar`, dest, sha256: sha256(DATA), sizeBytes: String(DATA.length) },
            { allowedHosts: HOSTS, allowLocalHttp: true, onBytes: (d) => { progress += d; } },
        );
        assert.strictEqual(r.sha256, sha256(DATA));
        assert.ok(fs.readFileSync(dest).equals(DATA));
        assert.ok(!fs.existsSync(`${dest}.part`));
        assert.strictEqual(progress, DATA.length);
    } finally { await srv.close(); }
});

test('downloader: sha512 (Modrinth) doğrulanır', async () => {
    const srv = await startServer((req, res) => serveBuffer(req, res, DATA));
    try {
        const dest = path.join(tmpDir(), 'b.jar');
        const r = await downloadVerified({ url: `${srv.base}/b.jar`, dest, sha512: sha512(DATA), sizeBytes: DATA.length },
            { allowedHosts: HOSTS, allowLocalHttp: true });
        assert.strictEqual(r.sha512, sha512(DATA));
    } finally { await srv.close(); }
});

test('downloader: hash uyuşmazlığında bir kez yeniden dener, sonra EHASHMISMATCH; dosya yerine konmaz', async () => {
    let hits = 0;
    const srv = await startServer((req, res) => { hits++; serveBuffer(req, res, DATA); });
    try {
        const dest = path.join(tmpDir(), 'c.jar');
        await assert.rejects(
            downloadVerified({ url: `${srv.base}/c.jar`, dest, sha256: '0'.repeat(64), sizeBytes: DATA.length },
                { allowedHosts: HOSTS, allowLocalHttp: true }),
            { code: 'EHASHMISMATCH' },
        );
        assert.strictEqual(hits, 2);
        assert.ok(!fs.existsSync(dest) && !fs.existsSync(`${dest}.part`));
    } finally { await srv.close(); }
});

test('downloader: boyut uyuşmazlığı ESIZEMISMATCH', async () => {
    const srv = await startServer((req, res) => serveBuffer(req, res, DATA));
    try {
        await assert.rejects(
            downloadVerified({ url: `${srv.base}/d.jar`, dest: path.join(tmpDir(), 'd.jar'), sha256: sha256(DATA), sizeBytes: DATA.length - 1 },
                { allowedHosts: HOSTS, allowLocalHttp: true }),
            { code: 'ESIZEMISMATCH' },
        );
    } finally { await srv.close(); }
});

test('downloader: yarım .part Range ile kaldığı yerden sürer', async () => {
    const ranges = [];
    const srv = await startServer((req, res) => { ranges.push(req.headers.range || null); serveBuffer(req, res, DATA); });
    try {
        const dest = path.join(tmpDir(), 'e.jar');
        fs.writeFileSync(`${dest}.part`, DATA.subarray(0, 100000));
        const r = await downloadVerified({ url: `${srv.base}/e.jar`, dest, sha256: sha256(DATA), sizeBytes: DATA.length },
            { allowedHosts: HOSTS, allowLocalHttp: true });
        assert.deepStrictEqual(ranges, ['bytes=100000-']);
        assert.strictEqual(r.sha256, sha256(DATA));
    } finally { await srv.close(); }
});

test('downloader: izin listesi dışına yönlendirme engellenir (EHOSTNOTALLOWED)', async () => {
    const srv = await startServer((req, res) => { res.writeHead(302, { Location: 'https://evil.example/x.jar' }); res.end(); });
    try {
        await assert.rejects(
            downloadVerified({ url: `${srv.base}/f.jar`, dest: path.join(tmpDir(), 'f.jar'), sha256: sha256(DATA) },
                { allowedHosts: HOSTS, allowLocalHttp: true }),
            { code: 'EHOSTNOTALLOWED' },
        );
        await assert.rejects(
            downloadVerified({ url: 'http://cdn.hardsetups.com/x.jar', dest: path.join(tmpDir(), 'g.jar'), sha256: sha256(DATA) },
                { allowedHosts: HOSTS }),
            { code: 'EHOSTNOTALLOWED' },
        );
    } finally { await srv.close(); }
});

test('downloader: hash bilgisi olmayan dosya reddedilir', async () => {
    await assert.rejects(downloadVerified({ url: 'https://cdn.hardsetups.com/x', dest: path.join(tmpDir(), 'x') }, { allowedHosts: HOSTS }),
        { code: 'ENOHASH' });
});

test('downloader: süresi dolan adres (403) için refreshUrl ile taze adres alınır', async () => {
    const srv = await startServer((req, res) => {
        if (req.url.startsWith('/eski')) { res.writeHead(403); return res.end(); }
        serveBuffer(req, res, DATA);
    });
    try {
        let refreshed = 0;
        const r = await downloadVerified({ url: `${srv.base}/eski.jar`, dest: path.join(tmpDir(), 'h.jar'), sha256: sha256(DATA), sizeBytes: DATA.length },
            { allowedHosts: HOSTS, allowLocalHttp: true, refreshUrl: async () => { refreshed++; return `${srv.base}/yeni.jar`; } });
        assert.strictEqual(refreshed, 1);
        assert.strictEqual(r.bytes, DATA.length);
    } finally { await srv.close(); }
});

test('downloader: iptal ECANCELED verir, .part sonraki deneme için kalır', async () => {
    const srv = await startServer((req, res) => {
        res.writeHead(200, { 'Content-Length': DATA.length });
        res.write(DATA.subarray(0, 64 * 1024)); // gerisini hiç göndermiyor
    });
    try {
        const dest = path.join(tmpDir(), 'i.jar');
        const ac = new AbortController();
        const p = downloadVerified({ url: `${srv.base}/i.jar`, dest, sha256: sha256(DATA), sizeBytes: DATA.length },
            { allowedHosts: HOSTS, allowLocalHttp: true, signal: ac.signal });
        setTimeout(() => ac.abort(), 200);
        await assert.rejects(p, { code: 'ECANCELED' });
        assert.ok(fs.existsSync(`${dest}.part`));
        assert.ok(!fs.existsSync(dest));
        srv.server.closeAllConnections();
    } finally { await srv.close(); }
});

test('downloader.runQueue: en çok 4 paralel; bir hata kalanları durdurur', async () => {
    let active = 0;
    let peak = 0;
    const results = await runQueue([...Array(10).keys()], async (n) => {
        active++; peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return n * 2;
    }, { concurrency: 4 });
    assert.strictEqual(peak, 4);
    assert.deepStrictEqual(results, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);

    let started = 0;
    await assert.rejects(runQueue([...Array(20).keys()], async (n, signal) => {
        started++;
        if (n === 2) throw new Error('bozuk');
        await new Promise((r) => setTimeout(r, 30));
        if (signal.aborted) throw new Error('iptal');
    }, { concurrency: 4 }), /bozuk/);
    assert.ok(started < 20, `hata sonrası yeni iş başlamamalıydı (${started})`);
});

// ─── services/api.cjs + hsession.cjs (mock API'ye karşı) ────────────────────
const mock = require('../dev/mock-api/server.cjs');
const { createApiClient, resolveBaseUrl, ApiError } = require('../electron/services/api.cjs');
const { createSession, createMemoryStorage } = require('../electron/services/hsession.cjs');

const fastSleep = () => new Promise((r) => setTimeout(r, 5));

async function withMock(fn) {
    Object.assign(mock.state, { scenario: 'normal', wallet: 25000n, owned: new Set(['kum-firtinasi']), purchases: new Map(), readNotifications: new Set(), reportSubjects: new Map(), telemetry: [] });
    mock.cfg.accessTtl = 900;
    mock.cfg.minVersion = null;
    const server = await mock.start(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    try { await fn(base); } finally { await new Promise((r) => server.close(r)); }
}

/** Mock'a bağlı istemci + oturum; login() cihaz kodu akışını otomatik onaylar. */
function makeClient(base, { now, storage = createMemoryStorage(), events = [], appVersion = '1.0.0-alpha.7' } = {}) {
    const session = createSession({ storage, onChange: (e) => events.push(e), sleep: fastSleep, ...(now ? { now } : {}) });
    const api = createApiClient({
        baseUrl: base, appVersion, getInstallId: () => 'install-uuid-test', session,
        onEvent: (type, payload) => events.push({ type, ...payload }), sleep: fastSleep,
    });
    session.setTransport((path, body, auth) => api.post(path, body, { auth }));
    const login = async () => {
        const flow = await session.startDeviceLogin({ deviceName: 'TEST-PC', os: 'windows', osVersion: '10', arch: 'x64', appVersion });
        await fetch(`${base}/__mock/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userCode: flow.userCode }) });
        return flow.done;
    };
    return { api, session, storage, events, login };
}

test('api.resolveBaseUrl: https zorunlu, yerel http yalnızca izinle', () => {
    assert.strictEqual(resolveBaseUrl('https://api.hardsetups.com/'), 'https://api.hardsetups.com');
    assert.strictEqual(resolveBaseUrl('http://api.hardsetups.com'), 'https://api.hardsetups.com');
    assert.strictEqual(resolveBaseUrl('http://127.0.0.1:4000'), 'https://api.hardsetups.com');
    assert.strictEqual(resolveBaseUrl('http://127.0.0.1:4000', { allowLocalHttp: true }), 'http://127.0.0.1:4000');
    assert.strictEqual(resolveBaseUrl('çöp'), 'https://api.hardsetups.com');
});

test('api: sözleşme başlıkları gider; hata gövdesi ApiError olur (kod + destek kodu)', async () => {
    let seen = null;
    const srv = await startServer((req, res) => {
        seen = req.headers;
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'LICENSE_REQUIRED', message: 'Lisansın yok', details: {}, requestId: 'req_42' } }));
    });
    try {
        const api = createApiClient({ baseUrl: srv.base, appVersion: '1.2.3', getInstallId: () => 'kurulum-1', getLanguage: () => 'en', sleep: fastSleep });
        await assert.rejects(api.get('/v1/launcher/x', { auth: 'none' }), (err) => {
            assert.ok(err instanceof ApiError);
            assert.deepStrictEqual([err.status, err.code, err.requestId], [403, 'LICENSE_REQUIRED', 'req_42']);
            return true;
        });
        assert.strictEqual(seen['x-hl-version'], '1.2.3');
        assert.strictEqual(seen['x-hl-device'], 'kurulum-1');
        assert.strictEqual(seen['accept-language'], 'en');
        assert.match(seen['user-agent'], /^HLauncher\/1\.2\.3 \(\S+ [^;]+; \w+\)$/);
        assert.strictEqual(seen.authorization, undefined);
    } finally { await srv.close(); }
});

test('api: GET 5xx ve ağ hatasında 3 kez dener; POST tekrar denenmez', async () => {
    let hits = 0;
    const srv = await startServer((req, res) => {
        hits++;
        if (req.method === 'GET' && hits < 3) { res.writeHead(502); return res.end(); }
        res.writeHead(req.method === 'GET' ? 200 : 500, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
    });
    try {
        const api = createApiClient({ baseUrl: srv.base, appVersion: '1.0.0', getInstallId: () => 'x', sleep: fastSleep });
        assert.deepStrictEqual((await api.get('/v1/a', { auth: 'none' })).data, { ok: true });
        assert.strictEqual(hits, 3);
        hits = 10;
        await assert.rejects(api.post('/v1/b', {}, { auth: 'none' }), { status: 500 });
        assert.strictEqual(hits, 11);
    } finally { await srv.close(); }
});

test('hsession: cihaz kodu girişi → token bellekte, yenileme token\'ı depoda; /me çalışır', async () => {
    await withMock(async (base) => {
        const c = makeClient(base);
        const result = await c.login();
        assert.strictEqual(result.state, 'success');
        assert.strictEqual(result.user.username, 'mert');
        assert.ok(c.storage.peek().refreshToken && c.storage.peek().deviceId);
        assert.ok(!('accessToken' in c.storage.peek()), 'erişim token\'ı diske yazılmamalı');
        const me = await c.api.get('/v1/launcher/me');
        assert.strictEqual(me.data.wallet.balanceMinor, '25000');
        assert.deepStrictEqual(c.session.snapshot(), { signedIn: true, user: result.user });
    });
});

test('hsession: reddedilen ve süresi dolan kod doğru durumu verir; SLOW_DOWN sonrası giriş sürer', async () => {
    await withMock(async (base) => {
        mock.state.scenario = 'deny';
        assert.strictEqual((await makeClient(base).login()).state, 'denied');
        mock.state.scenario = 'expire';
        assert.strictEqual((await makeClient(base).login()).state, 'expired');
        mock.state.scenario = 'slowDown';
        const waits = [];
        const c = makeClient(base);
        const slowSession = createSession({ storage: createMemoryStorage(), sleep: (ms) => { waits.push(ms); return fastSleep(); } });
        slowSession.setTransport((path, body, auth) => c.api.post(path, body, { auth }));
        const flow = await slowSession.startDeviceLogin({ deviceName: 'TEST-PC' });
        await fetch(`${base}/__mock/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userCode: flow.userCode }) });
        assert.strictEqual((await flow.done).state, 'success');
        assert.deepStrictEqual(waits, [5000, 10000]); // SLOW_DOWN → aralık +5 sn
    });
});

test('hsession: süresi dolan erişim token\'ıyla 5 eşzamanlı istek → tek yenileme', async () => {
    await withMock(async (base) => {
        mock.cfg.accessTtl = 1;
        const frozen = Date.now();
        const c = makeClient(base, { now: () => frozen }); // oturum token'ı hâlâ geçerli sanıyor
        await c.login();
        await new Promise((r) => setTimeout(r, 1200)); // sunucuda süresi doldu
        mock.cfg.accessTtl = 900;
        const before = mock.state.stats.refreshCalls;
        const results = await Promise.all(Array.from({ length: 5 }, () => c.api.get('/v1/launcher/me')));
        assert.ok(results.every((r) => r.data.user.username === 'mert'));
        assert.strictEqual(mock.state.stats.refreshCalls - before, 1);
    });
});

test('hsession: yenileme yanıtı yolda kaybolursa 60 sn toleransıyla oturum sürer', async () => {
    await withMock(async (base) => {
        const c = makeClient(base);
        await c.login();
        const refreshBefore = c.storage.peek().refreshToken;
        // İlk yenileme sunucuda işlenir ama yanıt "kaybolur"
        let drop = true;
        c.session.setTransport(async (path, body, auth) => {
            const res = await c.api.post(path, body, { auth });
            if (drop && path.endsWith('/token/refresh')) { drop = false; throw new ApiError({ code: 'NETWORK', message: 'kayıp' }); }
            return res;
        });
        await assert.rejects(c.session.refresh(), { code: 'NETWORK' });
        assert.strictEqual(c.storage.peek().refreshToken, refreshBefore); // eskisi hâlâ elde
        assert.ok(await c.session.refresh()); // eski token'la tekrar → tolerans
        assert.notStrictEqual(c.storage.peek().refreshToken, refreshBefore);
        assert.strictEqual((await c.api.get('/v1/launcher/me')).status, 200);
        assert.ok(mock.state.stats && [...mock.state.devices.values()].every((d) => !d.revoked));
    });
});

test('hsession: panelden iptal edilen cihaz bir sonraki istekte oturumu kapatır', async () => {
    await withMock(async (base) => {
        const c = makeClient(base);
        await c.login();
        await fetch(`${base}/__mock/revoke`, { method: 'POST' });
        await assert.rejects(c.api.get('/v1/launcher/me'), { code: 'DEVICE_REVOKED' });
        assert.strictEqual(c.session.isSignedIn(), false);
        assert.strictEqual(c.storage.peek(), null);
        assert.ok(c.events.some((e) => e.signedIn === false && e.reason === 'DEVICE_REVOKED'));
        await assert.rejects(c.api.get('/v1/launcher/me'), { code: 'NOT_SIGNED_IN' });
    });
});

test('hsession: çıkış sunucuda cihazı kapatır ve yerel oturumu siler', async () => {
    await withMock(async (base) => {
        const c = makeClient(base);
        await c.login();
        await c.session.logout();
        assert.strictEqual(c.session.isSignedIn(), false);
        assert.strictEqual(c.storage.peek(), null);
        assert.ok([...mock.state.devices.values()].every((d) => d.revoked));
    });
});

test('api: 426 → outdated, 503 → maintenance olayı; config bakımda da cevap verir; 429 beklenip tekrarlanır', async () => {
    await withMock(async (base) => {
        const c = makeClient(base, { appVersion: '1.0.0-alpha.6' });
        mock.cfg.minVersion = '1.0.0';
        await assert.rejects(c.api.get('/v1/launcher/home', { auth: 'optional' }), { status: 426, code: 'LAUNCHER_OUTDATED' });
        assert.ok(c.events.some((e) => e.type === 'outdated' && e.minVersion === '1.0.0'));
        mock.cfg.minVersion = null;

        mock.state.scenario = 'maintenance';
        const cfg = await c.api.get('/v1/launcher/config', { auth: 'none' });
        assert.strictEqual(cfg.data.maintenance.active, true);
        await assert.rejects(c.api.get('/v1/launcher/home', { auth: 'optional' }), { status: 503, code: 'MAINTENANCE_MODE' });
        assert.ok(c.events.some((e) => e.type === 'maintenance' && e.message));

        mock.state.scenario = 'rateLimited';
        setTimeout(() => { mock.state.scenario = 'normal'; }, 20);
        const home = await c.api.get('/v1/launcher/home', { auth: 'optional' });
        assert.strictEqual(home.status, 200);
        const again = await c.api.get('/v1/launcher/home', { auth: 'optional', etag: home.etag });
        assert.strictEqual(again.notModified, true);
    });
});

// ─── services/installer.cjs (sözleşme §7, mock API'ye karşı) ────────────────
const installer = require('../electron/services/installer.cjs');

async function installerContext(base) {
    const c = makeClient(base);
    await c.login();
    const { resolveDependencies } = require('../electron/services/bylicense.cjs');
    // Portal'ın yaptığı gibi: v1.5 dependencies → Modrinth (mock) dosyaları
    const getManifest = async (action = 'INSTALL', product = 'kum-firtinasi') => {
        const m = (await c.api.post('/v1/launcher/install', { product, action, channel: 'STABLE', installedVersionId: null })).data;
        m.files.push(...await resolveDependencies(m.dependencies, { mcVersion: m.minecraft.version, loader: m.loader.type }, { modrinthApi: `${base}/modrinth` }));
        return m;
    };
    const refreshUrlsFor = (installId) => async () => {
        const r = await c.api.post(`/v1/launcher/install/${installId}/urls`, {});
        return Object.fromEntries(r.data.files.map((f) => [f.id, f.url]));
    };
    const sync = (manifest, instanceDir, extra = {}) => installer.syncProduct({
        manifest, instanceDir, allowedHosts: ['cdn.hardsetups.com'], allowLocalHttp: true,
        refreshUrls: refreshUrlsFor(manifest.installId), ...extra,
    });
    return { c, getManifest, sync };
}
const exists = (dir, rel) => fs.existsSync(path.join(dir, ...rel.split('/')));

test('installer: kurulum yalnızca extract öneklerini açar, lisans ayarını birleştirir, hl-manifest yazar', async () => {
    await withMock(async (base) => {
        const { getManifest, sync } = await installerContext(base);
        const dir = path.join(tmpDir(), 'hs-kum-firtinasi');
        const r = await sync(await getManifest(), dir);
        assert.strictEqual(r.downloaded, 2);
        for (const rel of ['mods/hardsetups-core-0.2.0.jar', 'mods/hardsetups-kumfirtinasi-1.4.0.jar', 'mods/fabric-api-0.116.17+1.21.1.jar', '.hardsetups/lisans-damgasi.json']) {
            assert.ok(exists(dir, rel), `eksik: ${rel}`);
        }
        assert.ok(!exists(dir, 'README.txt') && !exists(dir, 'HardSetups-KumFirtinasi'), 'extract dışı üye açılmamalı');
        assert.ok(!exists(dir, '.hl-staging'));
        assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'config/hardsetups/ayarlar.json'), 'utf8')), { 'lisans.anahtar.kumfirtinasi': 'HSMN-OPQR-STUV-WXYZ' });
        const m = installer.readInstalled(dir);
        assert.strictEqual(m.files.length, 4);
        assert.ok(m.files.every((f) => /^[a-f0-9]{64}$/.test(f.sha256)));
        assert.strictEqual(m.version.version, '1.4.0');
    });
});

test('installer: aynı sürüm tekrar senkronize edilince hiçbir şey inmez', async () => {
    await withMock(async (base) => {
        const { getManifest, sync } = await installerContext(base);
        const dir = path.join(tmpDir(), 'hs-kum-firtinasi');
        await sync(await getManifest(), dir);
        const again = await sync(await getManifest('UPDATE'), dir);
        assert.strictEqual(again.downloaded, 0);
        assert.strictEqual(again.reused, 2);
    });
});

test('installer: güncellemede eski yönetilen dosya silinir, kullanıcı jar\'ı .yedek\'e taşınır; dünyalar ve ayarlar korunur', async () => {
    await withMock(async (base) => {
        const { getManifest, sync } = await installerContext(base);
        const dir = path.join(tmpDir(), 'hs-kum-firtinasi');
        await sync(await getManifest(), dir);
        fs.writeFileSync(path.join(dir, 'mods', 'kullanicinin-modu.jar'), 'x');
        fs.mkdirSync(path.join(dir, 'saves', 'Dunya'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'saves', 'Dunya', 'level.dat'), 'dunya');
        fs.writeFileSync(path.join(dir, 'options.txt'), 'fov:90');
        fs.writeFileSync(path.join(dir, 'config', 'hardsetups', 'ayarlar.json'), JSON.stringify({ 'hud.olcek': '2', 'lisans.anahtar.kumfirtinasi': 'HSMN-OPQR-STUV-WXYZ' }));

        const next = await getManifest('UPDATE');
        next.files = next.files.filter((f) => f.id !== 'dep-fabric-api'); // yeni sürüm fabric-api'yi bırakıyor
        const r = await sync(next, dir);
        assert.deepStrictEqual(r.removed, ['mods/fabric-api-0.116.17+1.21.1.jar']);
        assert.deepStrictEqual(r.movedAside, ['mods/kullanicinin-modu.jar']);
        assert.ok(exists(dir, 'mods/.yedek/kullanicinin-modu.jar'));
        assert.strictEqual(fs.readFileSync(path.join(dir, 'saves', 'Dunya', 'level.dat'), 'utf8'), 'dunya');
        assert.strictEqual(fs.readFileSync(path.join(dir, 'options.txt'), 'utf8'), 'fov:90');
        assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'config/hardsetups/ayarlar.json'), 'utf8'))['hud.olcek'], '2');
    });
});

test('installer: onarma yalnızca bozuk dosyanın kaynağını yeniden indirir', async () => {
    await withMock(async (base) => {
        const { getManifest, sync } = await installerContext(base);
        const dir = path.join(tmpDir(), 'hs-kum-firtinasi');
        await sync(await getManifest(), dir);
        fs.writeFileSync(path.join(dir, 'mods', 'hardsetups-core-0.2.0.jar'), 'bozuldu');
        assert.deepStrictEqual(installer.verifyInstalled(dir).bad, ['mods/hardsetups-core-0.2.0.jar']);
        const r = await sync(await getManifest('REPAIR'), dir);
        assert.strictEqual(r.downloaded, 1); // yalnızca arşiv; fabric-api sağlam
        assert.deepStrictEqual(installer.verifyInstalled(dir).bad, []);
    });
});

test('installer: süresi dolan imzalı adres install/:id/urls ile tazelenir', async () => {
    await withMock(async (base) => {
        const { getManifest, sync } = await installerContext(base);
        mock.state.scenario = 'expiredUrls';
        const manifest = await getManifest();
        const before = mock.state.stats.urlsCalls;
        await sync(manifest, path.join(tmpDir(), 'hs-kum-firtinasi'));
        assert.strictEqual(mock.state.stats.urlsCalls - before, 1); // tek tazeleme tüm dosyalara yeter
    });
});

test('installer: sunucudaki dosya bozuksa kurulum durur, önceki kurulum olduğu gibi kalır', async () => {
    await withMock(async (base) => {
        const { getManifest, sync } = await installerContext(base);
        const dir = path.join(tmpDir(), 'hs-kum-firtinasi');
        await sync(await getManifest(), dir);
        const before = fs.readFileSync(path.join(dir, 'hl-manifest.json'), 'utf8');
        fs.writeFileSync(path.join(dir, 'mods', 'hardsetups-core-0.2.0.jar'), 'bozuldu');
        mock.state.scenario = 'corruptFile';
        await assert.rejects(sync(await getManifest('REPAIR'), dir), { code: 'EHASHMISMATCH' });
        assert.strictEqual(fs.readFileSync(path.join(dir, 'hl-manifest.json'), 'utf8'), before);
        assert.ok(exists(dir, 'mods/fabric-api-0.116.17+1.21.1.jar'));
    });
});

test('installer: güvensiz yol içeren bildirim hiçbir şey indirmeden reddedilir', async () => {
    await withMock(async (base) => {
        const { getManifest, sync } = await installerContext(base);
        for (const mutate of [
            (m) => { m.files[1].path = '../../evil.jar'; },
            (m) => { m.files[0].extract[0].to = 'C:/Windows/'; },
            (m) => { m.licenseConfig.path = '..\\..\\x.json'; },
            (m) => { m.instance.folderName = '../x'; },
            (m) => { delete m.files[1].sha512; }, // çözülmüş bağımlılık da hash'siz kabul edilmez
        ]) {
            const m = await getManifest();
            mutate(m);
            const dir = path.join(tmpDir(), 'hs-x');
            await assert.rejects(sync(m, dir), (err) => ['EUNSAFEPATH', 'EBADMANIFEST'].includes(err.code));
            assert.ok(!exists(dir, 'mods'));
        }
    });
});

test('installer: kaldırma önce dünyaları yedekler, sonra örnek klasörünü siler', async () => {
    const dir = path.join(tmpDir(), 'hs-kum-firtinasi');
    fs.mkdirSync(path.join(dir, 'saves', 'Dunya'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'saves', 'Dunya', 'level.dat'), 'dunya');
    const backupDir = tmpDir();
    const { backupPath } = installer.uninstallProduct(dir, { backupDir, label: 'kum-firtinasi', now: () => Date.parse('2026-09-24T12:00:00Z') });
    assert.ok(backupPath.endsWith('kum-firtinasi-dunyalar-20260924-120000.zip'));
    assert.ok(fs.statSync(backupPath).size > 0);
    assert.ok(!fs.existsSync(dir));
});

// ─── services/bylicense.cjs (§11.1 yardımcıları) ────────────────────────────
const bylicense = require('../electron/services/bylicense.cjs');

test('bylicense.satisfies: fabric.mod.json sürüm koşulları', async () => {
    assert.ok(bylicense.satisfies('0.16.14', '>=0.16.0'));
    assert.ok(!bylicense.satisfies('0.15.11', '>=0.16.0'));
    assert.ok(bylicense.satisfies('0.16.14', '*'));
    assert.ok(bylicense.satisfies('0.16.14', ['>=0.17.0', '0.16.14'])); // dizi: VEYA
    assert.ok(!bylicense.satisfies('0.16.14', '>=0.16.0 <0.16.10')); // boşluk: VE
    assert.ok(bylicense.satisfies('0.16.14', '~0.16.2'));
    assert.ok(!bylicense.satisfies('0.17.0', '~0.16.2'));
    assert.ok(bylicense.satisfies('0.16.14', '0.16.x'));
});

test('bylicense.pickLoaderVersion: tüm koşulları sağlayan en yeni KARARLI loader', async () => {
    const loaders = [
        { loader: { version: '0.17.0-beta.1', stable: false } },
        { loader: { version: '0.16.14', stable: true } },
        { loader: { version: '0.16.10', stable: true } },
        { loader: { version: '0.15.11', stable: true } },
    ];
    assert.strictEqual(bylicense.pickLoaderVersion(loaders, ['>=0.16.0']), '0.16.14');
    assert.strictEqual(bylicense.pickLoaderVersion(loaders, ['>=0.16.0', '<0.16.12']), '0.16.10');
    assert.strictEqual(bylicense.pickLoaderVersion(loaders, ['>=0.18.0']), null);
});

test('bylicense.inspectArchive: <klasör>/mods/*.jar kimlikleri ve .hs-license', async () => {
    const zip = new (require('adm-zip'))();
    const jar = (id) => { const j = new (require('adm-zip'))(); j.addFile('fabric.mod.json', Buffer.from(JSON.stringify({ id, depends: { fabricloader: '>=0.16.0' } }))); return j.toBuffer(); };
    zip.addFile('HardSetups-DoldurDoldur/mods/hardsetups-core-0.2.0.jar', jar('hardsetups'));
    zip.addFile('HardSetups-DoldurDoldur/mods/fabric-api-0.116.17+1.21.1.jar', jar('fabric-api'));
    zip.addFile('HardSetups-DoldurDoldur/README.txt', Buffer.from('x'));
    zip.addFile('.hs-license', Buffer.from('{}'));
    const file = path.join(tmpDir(), 'a.zip');
    zip.writeZip(file);
    const info = bylicense.inspectArchive(file);
    assert.deepStrictEqual(info.mods.map((m) => m.id).sort(), ['fabric-api', 'hardsetups']);
    assert.ok(info.mods.every((m) => m.loaderConstraint === '>=0.16.0'));
    assert.strictEqual(info.hasLicenseStamp, true);
});

test('bylicense.buildManifest: sözleşme §7 biçiminde, doğrulayıcıdan geçer', async () => {
    const m = bylicense.buildManifest({
        product: 'tiktok-doldurdoldur', table: bylicense.PRODUCTS['tiktok-doldurdoldur'],
        file: { url: 'https://cdn.hardsetups.com/x.zip', sha256: 'a'.repeat(64), sizeBytes: '100', version: '0.2.0', versionId: 'v1' },
        licenseKey: 'HSMN-OPQR-STUV-WXYZ', loaderVersion: '0.16.14',
        fabricApi: { id: 'dep-fabric-api', kind: 'file', source: 'modrinth', path: 'mods/fabric-api-0.116.17+1.21.1.jar', url: 'https://cdn.modrinth.com/f.jar', sha512: 'b'.repeat(128), sizeBytes: '10' },
    });
    const v = installer.validateInstallManifest(m);
    assert.strictEqual(v.instance.folderName, 'tiktok-doldurdoldur');
    assert.deepStrictEqual(v.licenseConfig.entries, { 'lisans.anahtar.dolduroldur': 'HSMN-OPQR-STUV-WXYZ' });
    assert.strictEqual(v.files[1].path, 'mods/fabric-api-0.116.17+1.21.1.jar');
    assert.strictEqual(v.loader.version, '0.16.14');
});

test('bylicense.resolveDependencies: birebir sürüm + loader + MC sürümü; eşleşme yoksa tahmin etmeden durur', async () => {
    await withMock(async (base) => {
        const ep = { modrinthApi: `${base}/modrinth` };
        const [dep] = await bylicense.resolveDependencies([{ source: 'modrinth', project: 'fabric-api', version: '0.116.17+1.21.1' }], { mcVersion: '1.21.1', loader: 'fabric' }, ep);
        assert.strictEqual(dep.path, 'mods/fabric-api-0.116.17+1.21.1.jar'); // 1.21 için olan yanlış dosya seçilmedi
        assert.match(dep.sha512, /^[a-f0-9]{128}$/);
        await assert.rejects(bylicense.resolveDependencies([{ source: 'modrinth', project: 'fabric-api', version: '0.116.18+1.21.1' }], { mcVersion: '1.21.1', loader: 'fabric' }, ep), { code: 'EDEPENDENCY' });
        await assert.rejects(bylicense.resolveDependencies([{ source: 'modrinth', project: 'fabric-api', version: '0.116.17+1.21.1' }], { mcVersion: '1.21.1', loader: 'quilt' }, ep), { code: 'EDEPENDENCY' });
        await assert.rejects(bylicense.resolveDependencies([{ source: 'curseforge', project: 'x', version: '1' }], { mcVersion: '1.21.1', loader: 'fabric' }, ep), { code: 'EDEPENDENCY' });
        assert.deepStrictEqual(await bylicense.resolveDependencies([], { mcVersion: '1.21.1', loader: 'fabric' }, ep), []);
    });
});

// ─── services/library.cjs (§6.3 açma kuralları, mock API'ye karşı) ───────────
const { createLibrary } = require('../electron/services/library.cjs');
const offlineSvc = require('../electron/services/offline.cjs');
const testKeyring = offlineSvc.buildKeyring(Object.fromEntries(require('./fixtures/launcher-offline-vectors.json').keys.map((k) => [k.kid, k.publicKeyRawBase64url])));

test('library.launchCheck: çevrimiçi aktif lisans açılır, askıdaki açılmaz', async () => {
    await withMock(async (base) => {
        const c = makeClient(base);
        await c.login();
        const lib = createLibrary({ api: c.api, dataRoot: tmpDir(), getDeviceId: () => c.session.getDeviceId(), keyring: testKeyring });
        assert.deepStrictEqual(await lib.launchCheck('kum-firtinasi'), { allowed: true });
        assert.strictEqual((await lib.launchCheck('tiktok-doldurdoldur')).reason, 'LICENSE_REQUIRED');
        mock.state.scenario = 'suspended';
        await lib.refresh();
        assert.strictEqual((await lib.launchCheck('kum-firtinasi')).reason, 'LICENSE_SUSPENDED');
    });
});

test('library.launchCheck: internet yokken imzalı zarfla açılır; saat geri alınmışsa ya da süre dolmuşsa açılmaz', async () => {
    let clock = Date.now();
    let lib;
    const dataRoot = tmpDir();
    let deviceId;
    await withMock(async (base) => {
        const c = makeClient(base);
        await c.login();
        deviceId = c.session.getDeviceId();
        lib = createLibrary({ api: c.api, dataRoot, getDeviceId: () => deviceId, keyring: testKeyring, now: () => clock });
        await lib.refresh(); // zarf diske yazılır
    });
    // Oturum açık ama internet yok (yenileme isteği bağlanamaz → NETWORK)
    const offlineApi = () => makeClient('http://127.0.0.1:9', { storage: createMemoryStorage({ refreshToken: 'eski', deviceId, user: { username: 'mert' } }) }).api;
    clock += 11 * 60 * 1000;
    assert.deepStrictEqual(await lib.launchCheck('kum-firtinasi'), { allowed: true, offline: true });
    assert.strictEqual((await lib.launchCheck('tiktok-doldurdoldur')).reason, 'LICENSE_INACTIVE');
    // Yeniden başlatma: diskten yüklenen zarf da çalışır
    const reloaded = createLibrary({ api: offlineApi(), dataRoot, getDeviceId: () => deviceId, keyring: testKeyring, now: () => clock });
    assert.deepStrictEqual(await reloaded.launchCheck('kum-firtinasi'), { allowed: true, offline: true });
    // Saat geri alındı
    const back = createLibrary({ api: offlineApi(), dataRoot, getDeviceId: () => deviceId, keyring: testKeyring, now: () => clock - 60 * 60 * 1000 });
    assert.strictEqual((await back.launchCheck('kum-firtinasi')).reason, 'OFFLINE_CLOCK');
    // Başka cihazın zarfı işe yaramaz
    const other = createLibrary({ api: offlineApi(), dataRoot, getDeviceId: () => 'baska-cihaz', keyring: testKeyring, now: () => clock });
    assert.strictEqual((await other.launchCheck('kum-firtinasi')).reason, 'OFFLINE_INVALID');
    // 72 saatlik çevrimdışı süre doldu
    clock += 73 * 60 * 60 * 1000;
    assert.strictEqual((await lib.launchCheck('kum-firtinasi')).reason, 'OFFLINE_EXPIRED');
});

// ─── services/portal.cjs (bütünleşik, mock API'ye karşı) ─────────────────────
async function withPortal(fn) {
    await withMock(async (base) => {
        mock.cfg.interval = 1;
        process.env.HL_API_BASE = base;
        process.env.HL_EXTERNAL_BASE = base; // Modrinth / Fabric meta → mock
        const events = [];
        const kv = new Map();
        const { createPortal } = require('../electron/services/portal.cjs');
        const portal = createPortal({
            app: { isPackaged: false, getVersion: () => '1.0.0-alpha.7' },
            store: { get: (k) => kv.get(k), set: (k, v) => kv.set(k, v) },
            dataRoot: tmpDir(),
            log: { info() {}, warn() {}, error() {} },
            // main.cjs openExternalSafe ile aynı kural: https + izinli host (ya da geliştirmede güvenilir yerel adres)
            openExternal: (url, hosts, opts) => !!opts?.trusted || links.isAllowedLink(url, [...links.DEFAULT_LINK_HOSTS, ...(hosts || [])]),
            send: (channel, payload) => events.push({ channel, ...payload }),
        });
        await portal.loadConfig();
        const login = async () => {
            const flow = await portal.startLogin();
            await fetch(`${base}/__mock/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userCode: flow.userCode }) });
            for (let i = 0; i < 100 && !events.some((e) => e.channel === 'portal:login'); i++) await new Promise((r) => setTimeout(r, 50));
            assert.strictEqual(events.find((e) => e.channel === 'portal:login')?.state, 'success');
        };
        try { await fn({ portal, base, login, events, kv }); } finally {
            mock.cfg.interval = 5;
            delete process.env.HL_API_BASE;
            delete process.env.HL_EXTERNAL_BASE;
        }
    });
}
const instancesLib = require('../electron/lib/instances.cjs');
const links = require('../electron/lib/links.cjs');
const { getInstanceDir } = require('../electron/lib/paths.cjs');

test('portal: sunucu loader sürümünü sabitlemezse modların koşuluna göre seçer ve manifeste yazar', async () => {
    await withPortal(async ({ portal, login }) => {
        await login();
        mock.state.scenario = 'noLoaderPin';
        const r = await portal.installProduct('kum-firtinasi', 'INSTALL');
        const inst = instancesLib.get(r.instanceId);
        assert.strictEqual(inst.origin, 'hardsetups');
        assert.strictEqual(inst.loaderVersion, '0.16.14'); // en yeni KARARLI, beta değil
        assert.strictEqual(installer.readInstalled(getInstanceDir(r.instanceId)).loader.version, '0.16.14');
        const view = await portal.libraryView();
        assert.strictEqual(view.items.find((i) => i.product.slug === 'kum-firtinasi').installedVersion, '1.4.0');
        portal.uninstallProduct('kum-firtinasi', { backupWorlds: false });
        assert.strictEqual(instancesLib.get(r.instanceId), null);
    });
});

test('portal: anahtarla kurulum (v1.4 §11.0) — Fabric API eklenir, anahtar lisans ayarına yazılır, hesap gerekmez', async () => {
    await withPortal(async ({ portal }) => {
        const r = await portal.installByLicense('hsmn opqr stuv wxyz');
        const dir = getInstanceDir(r.instanceId);
        for (const rel of ['mods/hardsetups-kumfirtinasi-1.4.0.jar', 'mods/fabric-api-0.116.17+1.21.1.jar', '.hardsetups/lisans-damgasi.json']) {
            assert.ok(fs.existsSync(path.join(dir, ...rel.split('/'))), `eksik: ${rel}`);
        }
        const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config', 'hardsetups', 'ayarlar.json'), 'utf8'));
        assert.deepStrictEqual(cfg, { 'lisans.anahtar.kumfirtinasi': 'hsmn opqr stuv wxyz' }); // birebir
        const inst = instancesLib.get(r.instanceId);
        assert.strictEqual(inst.installedVia, 'licenseKey');
        assert.strictEqual(inst.loaderVersion, '0.16.14');
        assert.deepStrictEqual(await portal.launchCheck(inst), { allowed: true }); // §6.6: kapı yok
        portal.uninstallProduct('kum-firtinasi', { backupWorlds: false });
    });
});

test('portal: anahtarla kurulum, sunucu kurulum bilgisi vermezse §11.1 tablosuyla', async () => {
    await withPortal(async ({ portal }) => {
        mock.state.scenario = 'byLicenseLegacy';
        const r = await portal.installByLicense('HSMN-OPQR-STUV-WXYZ');
        const m = installer.readInstalled(getInstanceDir(r.instanceId));
        assert.deepStrictEqual(m.files.map((f) => f.path).sort(), [
            '.hardsetups/lisans-damgasi.json', 'mods/fabric-api-0.116.17+1.21.1.jar',
            'mods/hardsetups-core-0.2.0.jar', 'mods/hardsetups-kumfirtinasi-1.4.0.jar',
        ]);
        assert.strictEqual(m.loader.version, '0.16.14');
        await assert.rejects(portal.installByLicense('YANLIS-ANAHTAR'), { code: 'LICENSE_NOT_FOUND' });
        portal.uninstallProduct('kum-firtinasi', { backupWorlds: false });
    });
});

test('portal: launcher uçları sunucuda yokken (404) hesap "henüz açılmadı" olur, anahtarla kurulum yine çalışır', async () => {
    await withPortal(async ({ portal }) => {
        mock.state.scenario = 'notDeployed';
        await portal.loadConfig();
        assert.strictEqual(portal.publicState().accountAvailable, false);
        await assert.rejects(portal.startLogin(), { code: 'PORTAL_UNAVAILABLE' });
        await assert.rejects(portal.home({ reason: 'refresh' }), { code: 'PORTAL_UNAVAILABLE' });
        const r = await portal.installByLicense('HSMN-OPQR-STUV-WXYZ'); // canlıdaki gibi eski yanıt (§11.1)
        assert.ok(fs.existsSync(path.join(getInstanceDir(r.instanceId), 'mods', 'hardsetups-kumfirtinasi-1.4.0.jar')));
        portal.uninstallProduct('kum-firtinasi', { backupWorlds: false });
        mock.state.scenario = 'normal'; // sunucu açılınca bir sonraki config denetimi durumu düzeltir
        await portal.loadConfig();
        assert.strictEqual(portal.publicState().accountAvailable, true);
    });
});

test('portal: config gelmemişken üretim tabanında cdn.hardsetups.com varsayılır, yerel tabanda varsayılmaz', () => {
    const saved = process.env.HL_API_BASE;
    const { createPortal } = require('../electron/services/portal.cjs');
    const make = () => {
        const kv = new Map();
        return createPortal({
            app: { isPackaged: false, getVersion: () => '1.0.0-alpha.7' },
            store: { get: (k) => kv.get(k), set: (k, v) => kv.set(k, v) },
            dataRoot: tmpDir(), log: { info() {}, warn() {}, error() {} }, openExternal: () => false, send() {},
        });
    };
    try {
        delete process.env.HL_API_BASE;
        const prod = make();
        assert.ok(prod.downloadHosts().includes('cdn.hardsetups.com'));
        assert.deepStrictEqual(prod.publicState().imageHosts, ['cdn.hardsetups.com']);
        process.env.HL_API_BASE = 'http://127.0.0.1:9';
        const local = make();
        assert.ok(!local.downloadHosts().includes('cdn.hardsetups.com'));
        assert.deepStrictEqual(local.publicState().imageHosts, []);
    } finally {
        if (saved === undefined) delete process.env.HL_API_BASE; else process.env.HL_API_BASE = saved;
    }
});

test('portal: lisansa özel dosya hazırlanıyorsa 409 CONFLICT buildNotReady; kurulum sonucu FAILED bildirilir', async () => {
    await withPortal(async ({ portal, login }) => {
        await login();
        mock.state.scenario = 'buildPending';
        const view = await portal.libraryView();
        const item = view.items.find((i) => i.product.slug === 'kum-firtinasi');
        assert.deepStrictEqual([item.status, item.installable, item.reason], ['PENDING_BUILD', false, 'buildPending']);
        await assert.rejects(portal.installProduct('kum-firtinasi', 'INSTALL'), (err) => err.code === 'CONFLICT' && err.details.reason === 'buildNotReady');
    });
});

test('portal.home: bilinmeyen action türü gizlenir, ETag ile 304, kapatılan duyuru bir daha gelmez', async () => {
    await withPortal(async ({ portal }) => {
        const first = await portal.home();
        assert.deepStrictEqual(first.home.hero.map((h) => h.id), ['h1', 'h2']); // 'gizemli' tür gizlendi
        assert.strictEqual(first.home.campaigns[0].couponCode, 'LAUNCHER10');
        assert.strictEqual((await portal.home()).cached, true); // 5 dk dolmadan sunucuya gidilmez
        assert.strictEqual((await portal.home({ reason: 'refresh' })).cached, true); // gidildi, 304 geldi
        portal.dismissAnnouncement('a1');
        assert.deepStrictEqual((await portal.home()).home.announcements, []);
    });
});

test('portal.home (v1.7): hesaba özel kuponlar yalnızca girişliyken; bilinmeyen türdeki kupon elenir', async () => {
    await withPortal(async ({ portal, login }) => {
        assert.deepStrictEqual((await portal.home()).home.coupons, []);
        await login();
        const { coupons } = (await portal.home({ reason: 'refresh' })).home;
        assert.deepStrictEqual(coupons.map((c) => [c.code, c.type, c.value]), [['HLW-7K2MQ9PX', 'PERCENT', '15'], ['SABIT-50', 'FIXED', '5000']]);
        assert.strictEqual(coupons[1].description, null);
    });
});

test('telemetry: onaysız ya da sunucu kapalıyken hiçbir şey tutulmaz; toplu, 100\'lük ve 1000\'lik parçalar', async () => {
    const { createTelemetry } = require('../electron/services/telemetry.cjs');
    let enabled = false;
    const sent = [];
    let failNext = false;
    const tel = createTelemetry({
        post: async (body) => { if (failNext) { failNext = false; throw Object.assign(new Error('ağ'), { code: 'NETWORK' }); } sent.push(body); },
        isEnabled: () => enabled, launcherVersion: '1.0.0-alpha.7', platform: 'win32',
    });
    assert.strictEqual(tel.record('launch'), false);
    assert.strictEqual(tel.pending(), 0);
    enabled = true;
    assert.strictEqual(tel.record('keystroke'), false, 'sözleşme dışı tür');
    for (let i = 0; i < 2500; i++) tel.record('launch', 'kum-firtinasi');
    tel.record('crash', null);
    tel.record('install', 'C:\\Users\\x'); // ürün kodu değilse null
    for (let i = 0; i < 150; i++) tel.record('launch_failed', `urun-${i}`);
    failNext = true;
    assert.strictEqual(await tel.flush(), 0);
    assert.ok(tel.pending() > 0, 'gönderilemeyen sayılar kaybolmaz');
    await tel.flush();
    const events = sent.flatMap((b) => b.events);
    assert.ok(sent.every((b) => b.events.length <= 100));
    assert.deepStrictEqual(events.filter((e) => e.type === 'launch').map((e) => e.count), [1000, 1000, 500]);
    assert.deepStrictEqual(events.find((e) => e.type === 'install'), { type: 'install', product: null, launcherVersion: '1.0.0-alpha.7', os: 'windows', count: 1 });
    assert.strictEqual(events.filter((e) => e.type === 'launch_failed').length, 150);
    assert.strictEqual(tel.pending(), 0);
    tel.record('crash');
    enabled = false; // onay geri alınınca birikenler atılır
    assert.strictEqual(await tel.flush(), 0);
    assert.strictEqual(tel.pending(), 0);
});

test('portal: sayaçlar yalnızca sunucu açık VE oyuncu onaylıyken; istek anonim (token ve kurulum kimliği yok)', async () => {
    await withPortal(async ({ portal, login, kv }) => {
        await login();
        mock.state.scenario = 'telemetryOn';
        await portal.loadConfig();
        portal.recordEvent('launch', 'kum-firtinasi');
        await portal.flushTelemetry();
        assert.deepStrictEqual(mock.state.telemetry, [], 'onay yokken gönderilmez');
        kv.set('settings', { ...(kv.get('settings') || {}), telemetryConsent: true });
        portal.recordEvent('launch', 'kum-firtinasi');
        portal.recordEvent('crash', null);
        await portal.installByLicense('HSMN-OPQR-STUV-WXYZ');
        await assert.rejects(portal.installByLicense('YANLIS'), { code: 'LICENSE_NOT_FOUND' }); // kullanıcı hatası sayılmaz
        await portal.flushTelemetry();
        assert.strictEqual(mock.state.telemetry.length, 1);
        const [batch] = mock.state.telemetry;
        assert.strictEqual(batch.authorized, false);
        assert.strictEqual(batch.device, false);
        assert.deepStrictEqual(batch.keys, ['count', 'launcherVersion', 'os', 'product', 'type']);
        assert.deepStrictEqual(batch.events.map((e) => [e.type, e.product, e.count]).sort(), [['crash', null, 1], ['install', 'kum-firtinasi', 1], ['launch', 'kum-firtinasi', 1]]);
        portal.uninstallProduct('kum-firtinasi', { backupWorlds: false });
        mock.state.scenario = 'normal';
        await portal.loadConfig();
        kv.set('settings', { ...(kv.get('settings') || {}), telemetryConsent: true });
        portal.recordEvent('launch', null);
        assert.strictEqual(portal.telemetryPending(), false, 'sunucu kapalıyken tutulmaz');
    });
});

test('portal: bakiye ile satın alma — teklif, onay, aynı teklif iki kez gönderilse de tek sipariş', async () => {
    await withPortal(async ({ portal, login }) => {
        await login();
        const { quote } = await portal.quote('tiktok-doldurdoldur', 'aylik', 'LAUNCHER10');
        assert.deepStrictEqual([quote.totalMinor, quote.sufficient], ['19900', true]);
        assert.deepStrictEqual(quote.consents.map((c) => c.key), ['mesafeli-satis']);
        await assert.rejects(portal.quote('tiktok-doldurdoldur', 'aylik', 'SAHTEKUPON'), { code: 'COUPON_INVALID' });
        await assert.rejects(portal.purchase(quote.quoteId, []), { code: 'CONSENT_REQUIRED' }); // onaysız sipariş yok
        const [a, b] = await Promise.all([portal.purchase(quote.quoteId, ['mesafeli-satis']), portal.purchase(quote.quoteId, ['mesafeli-satis'])]);
        assert.strictEqual(a.orderNo, b.orderNo);
        assert.ok([a.reused, b.reused].includes(true), 'ikinci gönderim aynı sipariş (reused)');
        assert.strictEqual(mock.state.stats.purchases, 1);
        assert.strictEqual(portal.publicState().wallet.balanceMinor, String(25000n - 19900n));
        const view = await portal.libraryView({ refresh: false });
        assert.ok(view.items.some((i) => i.product.slug === 'tiktok-doldurdoldur'), 'satın alınan ürün kütüphanede');
    });
});

test('portal: yetersiz bakiye 409 (eksik tutar + yükleme adresi); satın alma kapalıysa istek gönderilmez', async () => {
    await withPortal(async ({ portal, login }) => {
        await login();
        mock.state.scenario = 'insufficientBalance';
        const { quote } = await portal.quote('kum-firtinasi', 'aylik');
        assert.strictEqual(quote.sufficient, false);
        await assert.rejects(portal.purchase(quote.quoteId, ['mesafeli-satis']), (err) => err.code === 'INSUFFICIENT_BALANCE' && err.status === 409 && !!err.details.topupUrl);
        mock.state.scenario = 'purchaseDisabled';
        await portal.loadConfig();
        await assert.rejects(portal.quote('kum-firtinasi', 'aylik'), { code: 'PURCHASE_DISABLED' });
    });
});

test('portal: bildirimler listelenir, tümü okundu yapılınca okunmamış sayısı sıfırlanır', async () => {
    await withPortal(async ({ portal, login }) => {
        await login();
        await portal.refreshMe({ force: true });
        assert.strictEqual(portal.publicState().unreadNotifications, 2);
        const list = await portal.notifications();
        assert.strictEqual(list.items.length, 2);
        await portal.markNotificationsRead({ all: true });
        assert.strictEqual(portal.publicState().unreadNotifications, 0);
    });
});

test('portal.sendReport: onaysız gönderilmez; gönderimde dosyalar ana süreçte yeniden toplanıp temizlenir', async () => {
    await withPortal(async ({ portal, login }) => {
        await login();
        const { getLogsDir } = require('../electron/lib/paths.cjs');
        fs.appendFileSync(path.join(getLogsDir(), 'hlauncher.log'), '\n--accessToken eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U\n');
        const pre = portal.reportPreview(null);
        assert.ok(pre.files.some((f) => f.id === 'launcher'));
        await assert.rejects(portal.sendReport({ subject: 'Çöktü', message: 'Açılmıyor', fileIds: ['launcher'], consent: false }), { code: 'CONSENT_REQUIRED' });
        await assert.rejects(portal.sendReport({ subject: 'Çöktü', message: 'kısa', fileIds: [], consent: true }), { code: 'VALIDATION' }); // §10: açıklama ≥ 10
        const r = await portal.sendReport({ subject: 'Çöktü', message: 'C:\\Users\\Mert\\x açılmıyor', fileIds: ['launcher'], consent: true });
        assert.strictEqual(typeof r.ticketNo, 'number');
        assert.strictEqual(r.url, `https://support.hardsetups.com/talepler/${r.ticketNo}`);
        assert.strictEqual(mock.state.lastReport.fileCount, 1);
        assert.ok(!mock.state.lastReport.raw.includes('eyJhbGciOiJIUzI1NiJ9.eyJzdWIi'), 'token sunucuya gitmemeli');
        assert.ok(!mock.state.lastReport.raw.includes('Users\\Mert'), 'kullanıcı adı sunucuya gitmemeli');
        // Aynı konu tekrar → 409 TICKET_DUPLICATE, açılmış talebin numarasıyla
        await assert.rejects(portal.sendReport({ subject: 'Çöktü', message: 'yine açılmıyor, tekrar deniyorum', fileIds: [], consent: true }),
            (e) => e.code === 'TICKET_DUPLICATE' && e.status === 409 && e.details.ticketNo === r.ticketNo);
        // Panelde kapalıysa istek sunucuya gitmez
        mock.state.scenario = 'reportDisabled';
        await portal.loadConfig();
        const before = mock.state.stats.reports;
        await assert.rejects(portal.sendReport({ subject: 'Başka konu', message: 'bir şey daha oldu burada', fileIds: [], consent: true }), { code: 'REPORT_DISABLED' });
        assert.strictEqual(mock.state.stats.reports, before);
        mock.state.scenario = 'normal';
        await portal.loadConfig();
    });
});

test('portal: renderer\'dan gelen geçersiz argümanlar ağa çıkmadan reddedilir', async () => {
    await withPortal(async ({ portal, login }) => {
        await login();
        const before = { ...mock.state.stats };
        await assert.rejects(portal.installProduct('../../etc', 'INSTALL'), { code: 'VALIDATION' });
        await assert.rejects(portal.installProduct('kum-firtinasi', 'DELETE_ALL'), { code: 'VALIDATION' });
        await assert.rejects(portal.product('<script>'), { code: 'VALIDATION' });
        await assert.rejects(portal.quote('kum-firtinasi', 'aylik; drop'), { code: 'VALIDATION' });
        await assert.rejects(portal.purchase(''), { code: 'VALIDATION' });
        await assert.rejects(portal.installByLicense(''), { code: 'VALIDATION' });
        await assert.rejects(portal.sendReport({ subject: '', message: 'x', consent: true }), { code: 'VALIDATION' });
        assert.strictEqual(portal.openLink('file:///C:/Windows'), false);
        assert.strictEqual(portal.openUrl('javascript:alert(1)'), false);
        assert.strictEqual(portal.dismissAnnouncement({ id: 1 }), false);
        assert.deepStrictEqual(mock.state.stats, before, 'geçersiz istek sunucuya gitmemeli');
    });
});

// ─── services/imagecache.cjs ────────────────────────────────────────────────
const { createImageCache } = require('../electron/services/imagecache.cjs');
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(40)]);

test('imagecache: izinli host → önbelleğe alınır, ağ düşse de bayat kopya verilir; izinsiz host ve resim olmayan içerik 404', async () => {
    let hits = 0;
    const srv = await startServer((req, res) => {
        hits++;
        if (req.url === '/html') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end('<html>kötü</html>'); }
        if (req.url === '/redirect') { res.writeHead(302, { Location: 'https://evil.example/x.png' }); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(PNG);
    });
    try {
        const cacheDir = tmpDir();
        const cache = createImageCache({ cacheDir, isAllowed: (host, proto) => host === '127.0.0.1' && proto === 'http:' });
        const first = await cache.get(`${srv.base}/a.png`);
        assert.deepStrictEqual([first.status, first.type], [200, 'image/png']);
        await cache.get(`${srv.base}/a.png`);
        assert.strictEqual(hits, 1, 'ikinci istek önbellekten gelmeli');
        assert.strictEqual((await cache.get('https://evil.example/a.png')).status, 404);
        assert.strictEqual((await cache.get(`${srv.base}/html`)).status, 404);
        assert.strictEqual((await cache.get(`${srv.base}/redirect`)).status, 404);
        // Önbellek bayatladı + sunucu kapalı → eldeki kopya
        for (const f of fs.readdirSync(cacheDir)) fs.utimesSync(path.join(cacheDir, f), new Date(0), new Date(0));
        await srv.close();
        assert.strictEqual((await cache.get(`${srv.base}/a.png`)).status, 200);
    } finally { try { await srv.close(); } catch { /* kapalı */ } }
});

// ─── Çalıştırıcı ────────────────────────────────────────────────────────────
(async () => {
    let passed = 0;
    let failed = 0;
    for (const t of tests) {
        try {
            await t.fn();
            passed++;
            console.log(`  ✓ ${t.name}`);
        } catch (err) {
            failed++;
            console.error(`  ✗ ${t.name}\n    ${err.stack || err.message}`);
        }
    }
    console.log(`\n${passed} servis testi geçti, ${failed} test kaldı`);
    try { fs.rmSync(tmpAppData, { recursive: true, force: true }); } catch { /* windows kilidi */ }
    process.exit(failed ? 1 : 0);
})();
