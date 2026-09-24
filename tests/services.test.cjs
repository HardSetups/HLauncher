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
