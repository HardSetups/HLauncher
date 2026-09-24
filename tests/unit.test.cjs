// Saf fonksiyonlar için birim testler: `npm test`
// Gerçek kullanıcı verisine dokunmamak için APPDATA geçici klasöre yönlendirilir.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmpAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'hlauncher-test-'));
process.env.APPDATA = tmpAppData;

let passed = 0;
let failed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failed++;
        console.error(`  ✗ ${name}\n    ${err.message}`);
    }
}

// ─── java.cjs ───────────────────────────────────────────────────────────────
const { getRequiredJava } = require('../electron/lib/java.cjs');

test('getRequiredJava: 1.8.9 → 8', () => assert.strictEqual(getRequiredJava('1.8.9'), 8));
test('getRequiredJava: 1.12.2 → 8', () => assert.strictEqual(getRequiredJava('1.12.2'), 8));
test('getRequiredJava: 1.16.5 → 8', () => assert.strictEqual(getRequiredJava('1.16.5'), 8));
test('getRequiredJava: 1.17 → 17', () => assert.strictEqual(getRequiredJava('1.17'), 17));
test('getRequiredJava: 1.20.4 → 17', () => assert.strictEqual(getRequiredJava('1.20.4'), 17));
test('getRequiredJava: 1.20.5 → 21', () => assert.strictEqual(getRequiredJava('1.20.5'), 21));
test('getRequiredJava: 1.21.4 → 21', () => assert.strictEqual(getRequiredJava('1.21.4'), 21));
test('getRequiredJava: 26.1 (yıl bazlı) → 21', () => assert.strictEqual(getRequiredJava('26.1'), 21));

// ─── launcher.cjs yardımcıları ──────────────────────────────────────────────
const { supportsQuickPlay, parseAddress, jvmArgsFor } = require('../electron/launcher.cjs');

test('supportsQuickPlay: 1.21.4 → true', () => assert.strictEqual(supportsQuickPlay('1.21.4'), true));
test('supportsQuickPlay: 1.20 → true', () => assert.strictEqual(supportsQuickPlay('1.20'), true));
test('supportsQuickPlay: 1.19.4 → false', () => assert.strictEqual(supportsQuickPlay('1.19.4'), false));
test('supportsQuickPlay: 1.8.9 → false', () => assert.strictEqual(supportsQuickPlay('1.8.9'), false));

test('parseAddress: portlu adres', () =>
    assert.deepStrictEqual(parseAddress('mc.ornek.com:25566'), { host: 'mc.ornek.com', port: '25566' }));
test('parseAddress: portsuz adres → 25565', () =>
    assert.deepStrictEqual(parseAddress('mc.ornek.com'), { host: 'mc.ornek.com', port: '25565' }));

test('jvmArgsFor: zgc + Java 8 → balanced\'a düşer', () => {
    assert.ok(jvmArgsFor('zgc', '', 8).includes('-XX:+UseG1GC'));
});
test('jvmArgsFor: zgc + Java 21 → ZGC', () => {
    assert.deepStrictEqual(jvmArgsFor('zgc', '', 21), ['-XX:+UseZGC']);
});
test('jvmArgsFor: custom argümanları böler', () => {
    assert.deepStrictEqual(jvmArgsFor('custom', '-Xss4M  -XX:+Foo', 21), ['-Xss4M', '-XX:+Foo']);
});

// ─── loaders/optifine.cjs ───────────────────────────────────────────────────
const { parseOptiFineFilename } = require('../electron/lib/loaders/optifine.cjs');

test('parseOptiFineFilename: standart ad', () =>
    assert.deepStrictEqual(parseOptiFineFilename('OptiFine_1.21.4_HD_U_J3.jar', '1.21.4'), { type: 'HD_U', patch: 'J3' }));
test('parseOptiFineFilename: preview öneki', () =>
    assert.deepStrictEqual(parseOptiFineFilename('preview_OptiFine_1.21.1_HD_U_J1_pre9.jar', '1.21.1'), { type: 'HD_U_J1', patch: 'pre9' }));
test('parseOptiFineFilename: yanlış sürüm → null', () =>
    assert.strictEqual(parseOptiFineFilename('OptiFine_1.20.4_HD_U_I7.jar', '1.21.4'), null));

// ─── loaders/forge.cjs ──────────────────────────────────────────────────────
const { neoForgePrefixFor, pickNeoForgeVersion } = require('../electron/lib/loaders/forge.cjs');

test('neoForgePrefixFor: 1.21.4 → 21.4', () => assert.strictEqual(neoForgePrefixFor('1.21.4'), '21.4'));
test('neoForgePrefixFor: 1.21 → 21.0', () => assert.strictEqual(neoForgePrefixFor('1.21'), '21.0'));
test('neoForgePrefixFor: 1.19.2 → null (desteklenmez)', () => assert.strictEqual(neoForgePrefixFor('1.19.2'), null));

const sampleXml = `<versions>
<version>21.4.1-beta</version>
<version>21.4.10</version>
<version>21.4.52</version>
<version>21.5.1</version>
</versions>`;
test('pickNeoForgeVersion: stable en yeniyi seçer', () =>
    assert.strictEqual(pickNeoForgeVersion(sampleXml, '21.4'), '21.4.52'));
test('pickNeoForgeVersion: eşleşme yoksa null', () =>
    assert.strictEqual(pickNeoForgeVersion(sampleXml, '20.2'), null));

// ─── loaders/fabriclike.cjs ─────────────────────────────────────────────────
const { pickLoader } = require('../electron/lib/loaders/fabriclike.cjs');

test('pickLoader: fabric stable tercih eder', () => {
    const loaders = [
        { loader: { version: '0.17.0-beta', stable: false } },
        { loader: { version: '0.16.9', stable: true } },
    ];
    assert.strictEqual(pickLoader('fabric', loaders), '0.16.9');
});
test('pickLoader: quilt beta olmayanı tercih eder', () => {
    const loaders = [
        { loader: { version: '0.29.0-beta.1' } },
        { loader: { version: '0.28.1' } },
    ];
    assert.strictEqual(pickLoader('quilt', loaders), '0.28.1');
});

// ─── servermanifest.cjs ─────────────────────────────────────────────────────
const { validateManifest } = require('../electron/lib/servermanifest.cjs');

test('validateManifest: geçerli manifest', () => {
    const { ok, errors } = validateManifest({
        manifestVersion: 1, name: 'Test', address: 'mc.test.com',
        mcVersion: '1.21.4', loader: 'fabric', recommendedRam: 4,
        mods: [
            { type: 'modrinth', id: 'sodium' },
            { type: 'url', url: 'https://x.com/a.jar', filename: 'a.jar', sha1: 'abc' },
        ],
    });
    assert.strictEqual(ok, true, errors.join(', '));
});
test('validateManifest: eksik alanları yakalar', () => {
    const { ok, errors } = validateManifest({ manifestVersion: 2, loader: 'bilinmez' });
    assert.strictEqual(ok, false);
    assert.ok(errors.length >= 3);
});
test('validateManifest: güvensiz url modunu reddeder', () => {
    const { ok } = validateManifest({
        manifestVersion: 1, name: 'X', address: 'a.com', mcVersion: '1.21.4', loader: 'fabric',
        mods: [{ type: 'url', url: 'http://x.com/a.jar', filename: '../evil.jar', sha1: '' }],
    });
    assert.strictEqual(ok, false);
});

// ─── store.cjs ──────────────────────────────────────────────────────────────
const { Store, DEFAULTS } = require('../electron/lib/store.cjs');

test('Store: varsayılanlar + kalıcılık + patch', () => {
    const file = path.join(tmpAppData, 'store-test.json');
    const s1 = new Store(file, DEFAULTS);
    assert.strictEqual(s1.get('settings').language, 'tr');
    s1.patchSettings({ ram: 8 });
    const s2 = new Store(file, DEFAULTS);
    assert.strictEqual(s2.get('settings').ram, 8);
    assert.strictEqual(s2.get('settings').accent, DEFAULTS.settings.accent); // birleşik varsayılan
});

// ─── instances.cjs ──────────────────────────────────────────────────────────
const instances = require('../electron/lib/instances.cjs');

test('instances: default profil otomatik oluşur', () => {
    const list = instances.list();
    assert.ok(list.some((i) => i.id === 'default'));
});
test('instances: create/update/remove', () => {
    const inst = instances.create({ name: 'Test Profili', mcVersion: '1.21.4', loader: 'fabric' });
    assert.strictEqual(inst.loader, 'fabric');
    const updated = instances.update(inst.id, { ram: 6 });
    assert.strictEqual(updated.ram, 6);
    assert.strictEqual(instances.remove(inst.id), true);
    assert.strictEqual(instances.get(inst.id), null);
});
test('instances: default silinemez', () => {
    assert.throws(() => instances.remove('default'));
});
test('instances: geçersiz loader reddedilir', () => {
    assert.throws(() => instances.create({ name: 'X', loader: 'rift' }));
});
test('slugify: türkçe/özel karakterler', () => {
    assert.strictEqual(instances.slugify('Mc Ornek: Sunucu!'), 'mc-ornek-sunucu');
});

// ─── modrinth.cjs (güncelleme denetimi) ─────────────────────────────────────
const { computeUpdates, hashFileSha1 } = require('../electron/lib/modrinth.cjs');

test('computeUpdates: yeni sürüm varsa güncelleme üretir', () => {
    const fileHashes = [{ file: 'sodium-1.jar', hash: 'aaa' }, { file: 'elle-eklenen.jar', hash: 'bbb' }];
    const current = { aaa: { id: 'v1', version_number: '1.0', project_id: 'p1' } };
    const latest = { aaa: { id: 'v2', version_number: '2.0', project_id: 'p1', files: [{ primary: true, url: 'https://x/s2.jar', filename: 'sodium-2.jar', hashes: { sha1: 'ccc' } }] } };
    const { updates, unknown } = computeUpdates(fileHashes, current, latest);
    assert.strictEqual(unknown, 1); // elle eklenen mod bilinmeyen sayılır
    assert.strictEqual(updates.length, 1);
    assert.deepStrictEqual(updates[0], {
        oldFile: 'sodium-1.jar', projectId: 'p1',
        currentVersion: '1.0', latestVersion: '2.0',
        url: 'https://x/s2.jar', filename: 'sodium-2.jar', sha1: 'ccc',
    });
});
test('computeUpdates: aynı sürümse güncelleme yok', () => {
    const fileHashes = [{ file: 'a.jar', hash: 'aaa' }];
    const v = { id: 'v1', version_number: '1.0', files: [] };
    const { updates } = computeUpdates(fileHashes, { aaa: v }, { aaa: v });
    assert.strictEqual(updates.length, 0);
});
test('hashFileSha1: bilinen içerik için doğru özet', () => {
    const f = path.join(tmpAppData, 'hash-test.txt');
    fs.writeFileSync(f, 'hlauncher');
    // echo -n hlauncher | sha1sum
    assert.strictEqual(hashFileSha1(f), require('crypto').createHash('sha1').update('hlauncher').digest('hex'));
});

// ─── store.cjs güvenlik süzgeçleri ──────────────────────────────────────────
const { sanitizeSettingsPatch, sanitizeServers } = require('../electron/lib/store.cjs');

test('sanitizeSettingsPatch: bilinmeyen anahtarları atar', () => {
    const clean = sanitizeSettingsPatch({ ram: 8, evil: 'x', __proto__: { a: 1 }, language: 'en' });
    assert.deepStrictEqual(Object.keys(clean).sort(), ['language', 'ram']);
});
test('sanitizeServers: şemayı zorlar, güvensizleri temizler', () => {
    const clean = sanitizeServers([
        { id: 'a', name: 'S', address: ' mc.x.com ', favorite: 'evet', manifestUrl: 'javascript:alert(1)' },
        { address: '' },
        'bozuk',
        { address: 'mc.y.com', manifestUrl: 'https://y.com/hlauncher.json', favorite: true },
    ]);
    assert.strictEqual(clean.length, 2);
    assert.strictEqual(clean[0].address, 'mc.x.com');
    assert.strictEqual(clean[0].favorite, false);       // 'evet' → false
    assert.strictEqual(clean[0].manifestUrl, '');        // javascript: reddedildi
    assert.strictEqual(clean[1].manifestUrl, 'https://y.com/hlauncher.json');
});

// ─── zip.cjs zip-slip koruması ──────────────────────────────────────────────
const AdmZip = require('adm-zip');
const { extractAll } = require('../electron/lib/zip.cjs');

test('extractAll: yol kaçışlı arşiv reddedilir (zip-slip)', () => {
    // addFile adı temizlediği için gerçek saldırıyı taklit etmek üzere
    // entryName yazıldıktan sonra elle bozulur (diskte ../ olarak kalır)
    const evil = new AdmZip();
    evil.addFile('zararsiz.txt', Buffer.from('zarar'));
    evil.getEntries()[0].entryName = '../kacak.txt';
    const zipPath = path.join(tmpAppData, 'evil.zip');
    evil.writeZip(zipPath);
    const dest = path.join(tmpAppData, 'extract-dest');
    assert.throws(() => extractAll(zipPath, dest), /Güvensiz arşiv girdisi/);
    assert.ok(!fs.existsSync(path.join(tmpAppData, 'kacak.txt')), 'dosya hedef dışına yazıldı!');
});
test('extractAll: normal arşiv sorunsuz çıkarılır', () => {
    const ok = new AdmZip();
    ok.addFile('klasor/dosya.txt', Buffer.from('merhaba'));
    const zipPath = path.join(tmpAppData, 'ok.zip');
    ok.writeZip(zipPath);
    const dest = path.join(tmpAppData, 'extract-ok');
    extractAll(zipPath, dest);
    assert.strictEqual(fs.readFileSync(path.join(dest, 'klasor', 'dosya.txt'), 'utf8'), 'merhaba');
});

// ─── errors.cjs ─────────────────────────────────────────────────────────────
const { friendlyError } = require('../electron/lib/errors.cjs');

test('friendlyError: ağ hatası', () => {
    const msg = friendlyError(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
    assert.ok(msg.includes('İnternet'));
});
test('friendlyError: hash hatası', () => {
    const msg = friendlyError(Object.assign(new Error('x'), { code: 'EHASHMISMATCH' }));
    assert.ok(msg.includes('bozuk'));
});
test('friendlyError: bağlam ekler', () => {
    assert.ok(friendlyError(new Error('detay'), 'Başlık').startsWith('Başlık'));
});

// ─── news.cjs ───────────────────────────────────────────────────────────────
const { sanitizeNews } = require('../electron/lib/news.cjs');

test('sanitizeNews: geçerli girdileri kırparak alır', () => {
    const items = sanitizeNews([
        { date: '2026-08-18', title: '  Merhaba  ', text: 'Detay', url: 'https://ornek.com/x' },
        { title: 'Sadece başlık' },
        { text: 'başlıksız — atlanır' },
        'düz metin — atlanır',
    ]);
    assert.strictEqual(items.length, 2);
    assert.strictEqual(items[0].title, 'Merhaba');
    assert.strictEqual(items[0].url, 'https://ornek.com/x');
    assert.strictEqual(items[1].text, undefined);
});
test('sanitizeNews: http URL reddedilir, dizi olmayan girdi null döner', () => {
    const items = sanitizeNews([{ title: 'X', url: 'http://guvensiz.com' }]);
    assert.strictEqual(items[0].url, undefined);
    assert.strictEqual(sanitizeNews({ hatali: true }), null);
});

// ─── content.cjs (mod / kaynak paketi / shader) ─────────────────────────────
const content = require('../electron/lib/content.cjs');

test('content.classifyEntry: jar modu açık, .disabled kapalı', () => {
    assert.deepStrictEqual(content.classifyEntry('mod', 'sodium.jar', false), { file: 'sodium.jar', name: 'sodium.jar', enabled: true, isDir: false });
    const off = content.classifyEntry('mod', 'sodium.jar.disabled', false);
    assert.strictEqual(off.enabled, false);
    assert.strictEqual(off.name, 'sodium.jar');
});

test('content.classifyEntry: yanlış uzantı ve mod klasörü içerik sayılmaz', () => {
    assert.strictEqual(content.classifyEntry('mod', 'readme.txt', false), null);
    assert.strictEqual(content.classifyEntry('mod', 'somefolder', true), null);
    assert.strictEqual(content.classifyEntry('mod', '.hidden.jar', false), null);
});

test('content.classifyEntry: kaynak paketi zip ve klasör kabul edilir', () => {
    assert.ok(content.classifyEntry('resourcepack', 'Faithful.zip', false));
    assert.ok(content.classifyEntry('resourcepack', 'MyPack', true));
    assert.strictEqual(content.classifyEntry('resourcepack', 'MyPack.disabled', true).enabled, false);
    assert.throws(() => content.classifyEntry('world', 'x.zip', false));
});

test('content.setEnabled: kapat → .disabled, aç → geri; listede durum doğru', () => {
    const dir = fs.mkdtempSync(path.join(tmpAppData, 'mods-'));
    fs.writeFileSync(path.join(dir, 'a.jar'), 'x');
    const off = content.setEnabled(dir, 'a.jar', false);
    assert.strictEqual(off, 'a.jar.disabled');
    assert.ok(fs.existsSync(path.join(dir, 'a.jar.disabled')));
    assert.strictEqual(content.listEntries(dir, 'mod')[0].enabled, false);
    assert.strictEqual(content.setEnabled(dir, off, true), 'a.jar');
    assert.strictEqual(content.setEnabled(dir, 'a.jar', true), 'a.jar'); // zaten açık: değişiklik yok
});

test('content.setEnabled: hedef adda dosya varsa üzerine yazmaz', () => {
    const dir = fs.mkdtempSync(path.join(tmpAppData, 'mods-'));
    fs.writeFileSync(path.join(dir, 'b.jar'), '1');
    fs.writeFileSync(path.join(dir, 'b.jar.disabled'), '2');
    assert.throws(() => content.setEnabled(dir, 'b.jar', false));
    assert.strictEqual(fs.readFileSync(path.join(dir, 'b.jar.disabled'), 'utf8'), '2');
});

test('content: yol kaçışı engellenir (toggle / remove)', () => {
    const dir = fs.mkdtempSync(path.join(tmpAppData, 'mods-'));
    assert.throws(() => content.setEnabled(dir, '../config.json', false));
    assert.throws(() => content.removeContent(dir, '..\\evil.jar'));
    assert.throws(() => content.removeContent(dir, 'C:\\Windows\\x.jar'));
});

test('content.loadersFor: quilt fabric modlarını da kapsar, kaynak paketi minecraft', () => {
    assert.deepStrictEqual(content.loadersFor('mod', 'quilt'), ['quilt', 'fabric']);
    assert.deepStrictEqual(content.loadersFor('resourcepack', 'fabric'), ['minecraft']);
});

test('instances.sanitizeInstancePatch: yalnızca kullanıcı alanları geçer', () => {
    const clean = instances.sanitizeInstancePatch({
        name: '  Skyblock  ', loader: 'fabric', ram: 99, mcVersion: '1.21.4',
        managedFiles: ['x'], origin: 'server', id: 'hack', announcements: [], serverAddress: ' mc.example.com ',
    });
    assert.deepStrictEqual(clean, { name: 'Skyblock', loader: 'fabric', ram: 64, mcVersion: '1.21.4', serverAddress: 'mc.example.com' });
    assert.deepStrictEqual(instances.sanitizeInstancePatch({ loader: 'rift', mcVersion: '../x', ram: 'a' }), {});
    assert.deepStrictEqual(instances.sanitizeInstancePatch({ mcVersion: null, ram: null, serverAddress: '' }), { mcVersion: null, ram: null, serverAddress: null });
});

// ─── skins.cjs ──────────────────────────────────────────────────────────────
const skins = require('../electron/lib/skins.cjs');
const pngHeader = (w, h) => {
    const buf = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
    buf.writeUInt32BE(13, 8);
    buf.write('IHDR', 12, 'ascii');
    buf.writeUInt32BE(w, 16);
    buf.writeUInt32BE(h, 20);
    return buf;
};

test('skins.validateSkinPng: 64×64 ve 64×32 kabul, diğer boyutlar ret', () => {
    assert.deepStrictEqual(skins.validateSkinPng(pngHeader(64, 64)), { width: 64, height: 64 });
    assert.deepStrictEqual(skins.validateSkinPng(pngHeader(64, 32)), { width: 64, height: 32 });
    assert.throws(() => skins.validateSkinPng(pngHeader(128, 128)), /64×64/);
});

test('skins.validateSkinPng: PNG olmayan ve aşırı büyük dosya reddedilir', () => {
    assert.throws(() => skins.validateSkinPng(Buffer.from('GIF89a-this-is-not-a-png-file')), /PNG/);
    assert.throws(() => skins.validateSkinPng(Buffer.alloc(300 * 1024)), /büyük/);
});

test('skins.addToLibrary: aynı görsel iki kez eklenmez, silinince listeden çıkar', () => {
    const png = pngHeader(64, 64);
    const a = skins.addToLibrary(png, { name: 'Deneme<>', variant: 'slim' });
    const b = skins.addToLibrary(png, { name: 'Kopya' });
    assert.strictEqual(a.id, b.id);
    assert.strictEqual(a.name, 'Deneme');
    assert.strictEqual(a.variant, 'slim');
    assert.ok(skins.listLibrary().some((s) => s.id === a.id && s.dataUrl.startsWith('data:image/png;base64,')));
    skins.removeEntry(a.id);
    assert.ok(!skins.listLibrary().some((s) => s.id === a.id));
});

// ─── updater.cjs ────────────────────────────────────────────────────────────
const { plainReleaseNotes } = require('../electron/lib/updater.cjs');

test('updater.plainReleaseNotes: GitHub HTML notunu düz metne çevirir', () => {
    const html = '<h2>Yeni</h2><ul><li>Skin <b>kütüphanesi</b></li><li>İndirme &amp; panel</li></ul>';
    assert.strictEqual(plainReleaseNotes(html), 'Yeni\n• Skin kütüphanesi\n• İndirme & panel');
});

test('updater.plainReleaseNotes: dizi biçimi, boş değer ve uzunluk sınırı', () => {
    assert.strictEqual(plainReleaseNotes([{ note: 'a' }, { note: 'b' }]), 'a\n\nb');
    assert.strictEqual(plainReleaseNotes(null), '');
    assert.ok(plainReleaseNotes('x'.repeat(5000), 100).length <= 101);
});

// ─── redact.cjs ─────────────────────────────────────────────────────────────
const { redact, scrubLogFiles } = require('../electron/lib/redact.cjs');
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

test('redact: MCLC başlatma satırındaki --accessToken maskelenir, diğer argümanlar kalır', () => {
    const line = `[MCLC]: Launching with arguments -Xmx4G --username Muffy --uuid abc --accessToken ${FAKE_JWT} --userType msa`;
    const out = redact(line);
    assert.ok(!out.includes(FAKE_JWT));
    assert.ok(out.includes('--accessToken [gizli]'));
    assert.ok(out.includes('--username Muffy') && out.includes('--userType msa'));
});

test('redact: Bearer, çıplak JWT, JSON ve sorgu dizesi alanları maskelenir', () => {
    assert.strictEqual(redact('Authorization: Bearer abc.def-ghi'), 'Authorization: Bearer [gizli]');
    assert.ok(!redact(`token ${FAKE_JWT} geldi`).includes(FAKE_JWT));
    const json = redact('{"refreshToken":"r-123","deviceCode":"d-456","user":"mert"}');
    assert.ok(!json.includes('r-123') && !json.includes('d-456') && json.includes('"user":"mert"'));
    assert.ok(!redact('?licenseKey=HSMN-OPQR&x=1').includes('HSMN-OPQR'));
    assert.ok(!redact('{"lisans.anahtar.kumfirtinasi": "HSMN-OPQR-STUV"}').includes('HSMN-OPQR-STUV'));
});

test('redact: gizli değer içermeyen metin olduğu gibi kalır', () => {
    const line = '[LAUNCH] Profil "Skyblock" — MC 1.21.4 (fabric), 4 GB; POST /v1/launcher/token/refresh';
    assert.strictEqual(redact(line), line);
    assert.strictEqual(redact(''), '');
    assert.strictEqual(redact(null), null);
});

test('redact.scrubLogFiles: eski log dosyalarındaki token temizlenir, başka dosyaya dokunulmaz', () => {
    const dir = fs.mkdtempSync(path.join(tmpAppData, 'logs-'));
    fs.writeFileSync(path.join(dir, 'hlauncher.log'), `a\n--accessToken ${FAKE_JWT} --x\nb`);
    fs.writeFileSync(path.join(dir, 'hlauncher.old.log'), 'temiz satır');
    fs.writeFileSync(path.join(dir, 'notlar.txt'), `--accessToken ${FAKE_JWT}`);
    assert.deepStrictEqual(scrubLogFiles(dir), { cleaned: 1, failed: 0 });
    assert.ok(!fs.readFileSync(path.join(dir, 'hlauncher.log'), 'utf8').includes(FAKE_JWT));
    assert.strictEqual(fs.readFileSync(path.join(dir, 'hlauncher.old.log'), 'utf8'), 'temiz satır');
    assert.ok(fs.readFileSync(path.join(dir, 'notlar.txt'), 'utf8').includes(FAKE_JWT));
});

// ─── safepath.cjs ───────────────────────────────────────────────────────────
const { normalizeRelative, safeJoin, isValidFolderName } = require('../electron/lib/safepath.cjs');

test('safepath: kötü yol listesinin tamamı reddedilir', () => {
    const bad = [
        '', '..', '../x.jar', 'mods/../../x', 'mods/..\\..\\x', '/etc/passwd', '\\\\server\\share\\x',
        '//server/share', 'C:\\Windows\\x.dll', 'c:x.jar', '\\\\?\\C:\\x', 'mods/x.jar:ads', 'mods/con',
        'mods/NUL.jar', 'CON', 'lpt1.txt', 'mods/x.jar.', 'mods/x.jar ', 'mods./x.jar', 'mods/a\u0000b.jar',
        'mods/<x>.jar', 'mods/x?.jar', 'a'.repeat(300),
    ];
    for (const p of bad) assert.throws(() => normalizeRelative(p, { allowDir: true }), { code: 'EUNSAFEPATH' }, `reddedilmeliydi: ${JSON.stringify(p)}`);
});

test('safepath: geçerli yollar normal biçime çevrilir', () => {
    assert.strictEqual(normalizeRelative('mods\\x.jar'), 'mods/x.jar');
    assert.strictEqual(normalizeRelative('./config//hardsetups/ayarlar.json'), 'config/hardsetups/ayarlar.json');
    assert.strictEqual(normalizeRelative('mods/', { allowDir: true }), 'mods/');
    assert.strictEqual(normalizeRelative('.hardsetups/lisans-damgasi.json'), '.hardsetups/lisans-damgasi.json');
    assert.throws(() => normalizeRelative('mods/'), { code: 'EUNSAFEPATH' });
});

test('safepath.safeJoin: sonuç her zaman kökün içinde', () => {
    const base = path.join(tmpAppData, 'instance');
    assert.strictEqual(safeJoin(base, 'mods/x.jar'), path.join(base, 'mods', 'x.jar'));
    assert.throws(() => safeJoin(base, '../instance-2/x.jar'), { code: 'EUNSAFEPATH' });
});

test('safepath.isValidFolderName: sözleşme §7.1 kuralı', () => {
    for (const ok of ['kum-firtinasi', 'tiktok-doldurdoldur', 'a1']) assert.ok(isValidFolderName(ok), ok);
    for (const no of ['a', '-x', 'Kum', 'kum_firtinasi', 'con', 'com1', 'x'.repeat(49), '../x', 'kum firtinasi']) {
        assert.ok(!isValidFolderName(no), no);
    }
});

// ─── links.cjs ──────────────────────────────────────────────────────────────
const links = require('../electron/lib/links.cjs');

test('links.isAllowedLink: yalnızca https + izinli host', () => {
    assert.ok(links.isAllowedLink('https://hardsetups.com/launcher'));
    assert.ok(links.isAllowedLink('https://magaza.hardsetups.com/urun/x'));
    assert.ok(links.isAllowedLink('https://www.youtube.com/watch?v=1'));
    assert.ok(!links.isAllowedLink('http://hardsetups.com'));
    assert.ok(!links.isAllowedLink('https://evilhardsetups.com'));
    assert.ok(!links.isAllowedLink('https://hardsetups.com.evil.site'));
    assert.ok(!links.isAllowedLink('https://hardsetups.com@evil.site/'));
    assert.ok(!links.isAllowedLink('file:///C:/Windows/system32/calc.exe'));
    assert.ok(!links.isAllowedLink('javascript:alert(1)'));
    assert.ok(!links.isAllowedLink('https://x.youtube.com', ['youtube.com']));
});

test('links.isAllowedDownload: https zorunlu, yerel http yalnızca izinle', () => {
    const hosts = ['cdn.hardsetups.com', 'cdn.modrinth.com'];
    assert.ok(links.isAllowedDownload('https://cdn.hardsetups.com/a.zip', hosts));
    assert.ok(!links.isAllowedDownload('http://cdn.hardsetups.com/a.zip', hosts));
    assert.ok(!links.isAllowedDownload('https://s3.amazonaws.com/a.zip', hosts));
    assert.ok(!links.isAllowedDownload('http://127.0.0.1:4000/a.zip', hosts));
    assert.ok(links.isAllowedDownload('http://127.0.0.1:4000/a.zip', hosts, { allowLocalHttp: true }));
});

// ─── compat.cjs ─────────────────────────────────────────────────────────────
const compat = require('../electron/lib/compat.cjs');

test('compat.isSandboxCrash: yalnızca açılıştaki STATUS_BREAKPOINT çökmesi', () => {
    assert.ok(compat.isSandboxCrash({ reason: 'crashed', exitCode: -2147483645 }, 5000));
    assert.ok(compat.isSandboxCrash({ reason: 'launch-failed', exitCode: 2147483651 }, 1000));
    assert.ok(!compat.isSandboxCrash({ reason: 'crashed', exitCode: -2147483645 }, 60000)); // geç çökme
    assert.ok(!compat.isSandboxCrash({ reason: 'crashed', exitCode: 1 }, 1000));
    assert.ok(!compat.isSandboxCrash({ reason: 'clean-exit', exitCode: -2147483645 }, 1000));
    assert.ok(!compat.isSandboxCrash(null, 1000));
});

test('compat.sandboxDisabled: varsayılan açık; ayar ya da HL_NO_SANDBOX ile kapanır', () => {
    const store = (v) => ({ get: () => v });
    assert.strictEqual(compat.sandboxDisabled(store({ noSandbox: false }), {}), false);
    assert.strictEqual(compat.sandboxDisabled(store(undefined), {}), false);
    assert.strictEqual(compat.sandboxDisabled(store({ noSandbox: true }), {}), true);
    assert.strictEqual(compat.sandboxDisabled(store({}), { HL_NO_SANDBOX: '1' }), true);
});

// ─── semver.cjs ─────────────────────────────────────────────────────────────
const { compareVersions } = require('../electron/lib/semver.cjs');

test('semver.compareVersions: ön sürümler sayısal, kararlı sürüm ön sürümden büyük', () => {
    const lt = (a, b) => assert.ok(compareVersions(a, b) < 0, `${a} < ${b}`);
    lt('1.0.0-alpha.6', '1.0.0-alpha.10');
    lt('1.0.0-alpha.9', '1.0.0-beta.1');
    lt('1.0.0-alpha.6', '1.0.0');
    lt('1.0.0', '1.0.1');
    lt('1.2.0', '1.10.0');
    assert.strictEqual(compareVersions('v1.4.0', '1.4.0'), 0);
    assert.ok(Number.isNaN(compareVersions('abc', '1.0.0')));
});

// ─── services/offline.cjs (çevrimdışı zarf, sözleşme §6) ────────────────────
const offline = require('../electron/services/offline.cjs');
const offlineVectors = require('./fixtures/launcher-offline-vectors.json');

test('offline.canonicalJson: lisans protokolü §3 örnekleri', () => {
    assert.strictEqual(offline.canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
    assert.strictEqual(offline.canonicalJson({ z: { d: 1, c: 2 }, a: 3 }), '{"a":3,"z":{"c":2,"d":1}}');
    assert.strictEqual(offline.canonicalJson({ items: [3, null, 2] }), '{"items":[3,null,2]}');
    assert.strictEqual(offline.canonicalJson({ a: null, b: true }), '{"b":true}');
    assert.strictEqual(offline.canonicalJson({ tr: 'ığüşöçİĞÜŞÖÇ' }), '{"tr":"ığüşöçİĞÜŞÖÇ"}');
    assert.strictEqual(offline.canonicalJson({ s: 'a"b\\c\n\u0001' }), '{"s":"a\\"b\\\\c\\n\\u0001"}');
    assert.throws(() => offline.canonicalJson({ x: 1.5 }));
});

test('offline.verifyEnvelope: sözleşme v1.2 test vektörlerinin (8) hepsi beklendiği gibi', () => {
    const keyring = offline.buildKeyring(Object.fromEntries(offlineVectors.keys.map((k) => [k.kid, k.publicKeyRawBase64url])));
    const now = Date.parse(offlineVectors.checkAt);
    assert.strictEqual(offlineVectors.vectors.length, 8);
    for (const v of offlineVectors.vectors) {
        if (v.expect.signatureValid) assert.strictEqual(offline.signingInput(v.envelope), v.signingInput, v.name);
        const r = offline.verifyEnvelope(v.envelope, { deviceId: offlineVectors.deviceId, now, keyring });
        assert.strictEqual(r.signatureValid, v.expect.signatureValid, `${v.name}: signatureValid`);
        assert.strictEqual(r.usable, v.expect.envelopeUsable, `${v.name}: usable`);
        if (v.expect.reason) assert.strictEqual(r.reason, v.expect.reason, `${v.name}: reason`);
        assert.deepStrictEqual(r.playable, v.expect.playable, `${v.name}: playable`);
    }
});

test('offline: gömülü üretim anahtarı sözleşmedeki parmak izine sahip, test anahtarı gömülü değil', () => {
    const spki = offline.keyFromRaw(offline.EMBEDDED_KEYS.ed1).export({ format: 'der', type: 'spki' });
    assert.strictEqual(require('crypto').createHash('sha256').update(spki).digest('hex'),
        'ff729e2188507bab4e37d20828367aae28a4df8381525868de883032a02ed8aa');
    assert.ok(!Object.keys(offline.EMBEDDED_KEYS).includes('test-ed1'));
    const valid = offlineVectors.vectors.find((v) => v.name === 'valid');
    // Test anahtarıyla imzalı zarf, gömülü anahtarlarla asla geçmez
    assert.strictEqual(offline.verifyEnvelope(valid.envelope, { deviceId: offlineVectors.deviceId, now: Date.parse(offlineVectors.checkAt) }).usable, false);
});

test('offline.clockTrusted: saat 5 dakikadan fazla geri alınmışsa güvenilmez', () => {
    const ref = '2026-09-24T12:00:00.000Z';
    assert.ok(offline.clockTrusted(Date.parse('2026-09-24T12:00:00Z'), ref));
    assert.ok(offline.clockTrusted(Date.parse('2026-09-24T11:56:00Z'), ref));
    assert.ok(!offline.clockTrusted(Date.parse('2026-09-24T11:54:00Z'), ref));
    assert.ok(offline.clockTrusted(Date.now(), null));
});

// ─── services/licenseconfig.cjs (sözleşme §7.5) ─────────────────────────────
const { mergeLicenseConfig } = require('../electron/services/licenseconfig.cjs');
const LC = (entries) => ({ path: 'config/hardsetups/ayarlar.json', schemaVersion: 2, format: 'flat-map', entries });
const lcFile = (dir) => path.join(dir, 'config', 'hardsetups', 'ayarlar.json');

test('licenseConfig: dosya yoksa yalnızca entries ile oluşturulur', () => {
    const dir = fs.mkdtempSync(path.join(tmpAppData, 'inst-'));
    assert.deepStrictEqual(mergeLicenseConfig(dir, LC({ 'lisans.anahtar.kumfirtinasi': 'HSMN-OPQR' })), { changed: true, corruptBackup: null });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(lcFile(dir), 'utf8')), { 'lisans.anahtar.kumfirtinasi': 'HSMN-OPQR' });
});

test('licenseConfig: birleştirir; modun diğer ayarları ve eski lisans.anahtar korunur, değer birebir', () => {
    const dir = fs.mkdtempSync(path.join(tmpAppData, 'inst-'));
    fs.mkdirSync(path.dirname(lcFile(dir)), { recursive: true });
    fs.writeFileSync(lcFile(dir), JSON.stringify({ 'hud.olcek': '1.5', 'lisans.anahtar': 'ESKI-ANAHTAR', 'arena.renk': 'kirmizi' }));
    mergeLicenseConfig(dir, LC({ 'lisans.anahtar.dolduroldur': ' hsmn-opqr stuv ' }));
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(lcFile(dir), 'utf8')), {
        'hud.olcek': '1.5', 'lisans.anahtar': 'ESKI-ANAHTAR', 'arena.renk': 'kirmizi', 'lisans.anahtar.dolduroldur': ' hsmn-opqr stuv ',
    });
    assert.ok(!fs.existsSync(`${lcFile(dir)}.yedek`) && !fs.existsSync(`${lcFile(dir)}.tmp`));
    assert.strictEqual(mergeLicenseConfig(dir, LC({ 'lisans.anahtar.dolduroldur': ' hsmn-opqr stuv ' })).changed, false);
});

test('licenseConfig: bozuk dosya .bozuk-<zaman> olarak saklanır, yeni dosya yazılır', () => {
    const dir = fs.mkdtempSync(path.join(tmpAppData, 'inst-'));
    fs.mkdirSync(path.dirname(lcFile(dir)), { recursive: true });
    fs.writeFileSync(lcFile(dir), '{ bozuk json');
    const r = mergeLicenseConfig(dir, LC({ 'lisans.anahtar.x': 'K' }), { now: Date.parse('2026-09-24T12:30:00Z') });
    assert.ok(r.corruptBackup.endsWith('ayarlar.json.bozuk-20260924-123000'));
    assert.strictEqual(fs.readFileSync(r.corruptBackup, 'utf8'), '{ bozuk json');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(lcFile(dir), 'utf8')), { 'lisans.anahtar.x': 'K' });
});

test('licenseConfig: güvensiz yol, yanlış biçim ve metin olmayan değer reddedilir; hata mesajı değeri içermez', () => {
    const dir = fs.mkdtempSync(path.join(tmpAppData, 'inst-'));
    assert.throws(() => mergeLicenseConfig(dir, { ...LC({ a: 'b' }), path: '../../x.json' }), { code: 'EUNSAFEPATH' });
    assert.throws(() => mergeLicenseConfig(dir, { ...LC({ a: 'b' }), format: 'json' }), { code: 'EBADLICENSECONFIG' });
    assert.throws(() => mergeLicenseConfig(dir, LC({ a: 5 })), { code: 'EBADLICENSECONFIG' });
    assert.throws(() => mergeLicenseConfig(dir, LC({ ['__proto__']: 'x' })), { code: 'EBADLICENSECONFIG' });
    try { mergeLicenseConfig(dir, LC({ 'lisans.anahtar.x': 5, gizli: 'GIZLI-DEGER' })); } catch (err) {
        assert.ok(!err.message.includes('GIZLI-DEGER'));
    }
});

// ─── services/imagecache.cjs ────────────────────────────────────────────────
const imagecache = require('../electron/services/imagecache.cjs');

test('imagecache: içerik imzasıyla resim türü; resim olmayan reddedilir', () => {
    assert.strictEqual(imagecache.sniffImageType(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')), 'image/png');
    assert.strictEqual(imagecache.sniffImageType(Buffer.from('ffd8ffe000104a4649460001', 'hex')), 'image/jpeg');
    assert.strictEqual(imagecache.sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary')), 'image/webp');
    assert.strictEqual(imagecache.sniffImageType(Buffer.from('<svg onload=alert(1)>....')), null);
    assert.strictEqual(imagecache.sniffImageType(Buffer.from('<html><body>')), null);
});

test('imagecache: hlimg adresi gidiş-dönüş; bozuk adres reddedilir', () => {
    const url = 'https://cdn.hardsetups.com/ürün/kum fırtınası.png?v=2';
    assert.strictEqual(imagecache.decodeImageUrl(imagecache.encodeImageUrl(url)), url);
    assert.strictEqual(imagecache.decodeImageUrl('hlimg://c/../../etc'), null);
    assert.strictEqual(imagecache.decodeImageUrl('https://evil/x'), null);
});

// ─── i18n: arayüzdeki her t('…') anahtarı iki sözlükte de var mı? ───────────
test('i18n: src/ içindeki tüm sabit t(\'…\') anahtarları TR ve EN sözlüklerinde mevcut', () => {
    const i18nSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n.jsx'), 'utf8');
    const start = i18nSrc.indexOf('export const DICTS = {');
    const objText = i18nSrc.slice(start + 'export const '.length, i18nSrc.indexOf('\n};') + 3);
    const dicts = new Function(`let ${objText}; return DICTS;`)();
    const used = new Map();
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir)) {
            const p = path.join(dir, entry);
            if (fs.statSync(p).isDirectory()) walk(p);
            else if (/\.(jsx|js)$/.test(p) && !p.endsWith('i18n.jsx')) {
                for (const m of fs.readFileSync(p, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.set(m[1], path.basename(p));
            }
        }
    };
    walk(path.join(__dirname, '..', 'src'));
    assert.ok(used.size > 50, `beklenenden az anahtar: ${used.size}`);
    const missing = [...used].filter(([k]) => !dicts.tr[k] || !dicts.en[k]).map(([k, f]) => `${k} (${f}: ${dicts.tr[k] ? '' : 'TR '}${dicts.en[k] ? '' : 'EN'})`);
    assert.deepStrictEqual(missing, []);
});

// ─── i18n: backend ilerleme anahtarları sözlükte var mı? ────────────────────
test('i18n: backend be.* anahtarları TR ve EN sözlüklerinde mevcut', () => {
    const i18nSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n.jsx'), 'utf8');
    const start = i18nSrc.indexOf('export const DICTS = {');
    const objText = i18nSrc.slice(start + 'export const '.length, i18nSrc.indexOf('\n};') + 3);
    const dicts = new Function(`let ${objText}; return DICTS;`)();

    const usedKeys = new Set();
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir)) {
            const p = path.join(dir, entry);
            if (fs.statSync(p).isDirectory()) walk(p);
            else if (p.endsWith('.cjs')) {
                for (const m of fs.readFileSync(p, 'utf8').matchAll(/key: '(be\.[a-zA-Z]+)'/g)) usedKeys.add(m[1]);
            }
        }
    };
    walk(path.join(__dirname, '..', 'electron'));

    assert.ok(usedKeys.size >= 10, `beklenenden az be.* anahtarı bulundu: ${usedKeys.size}`);
    for (const key of usedKeys) {
        assert.ok(dicts.tr[key], `TR sözlüğünde eksik: ${key}`);
        assert.ok(dicts.en[key], `EN sözlüğünde eksik: ${key}`);
    }
});

// ─── Sonuç ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} test geçti, ${failed} test kaldı`);
try { fs.rmSync(tmpAppData, { recursive: true, force: true }); } catch { /* windows kilidi */ }
process.exit(failed ? 1 : 0);
