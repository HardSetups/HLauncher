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
