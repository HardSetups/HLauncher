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

// ─── Sonuç ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} test geçti, ${failed} test kaldı`);
try { fs.rmSync(tmpAppData, { recursive: true, force: true }); } catch { /* windows kilidi */ }
process.exit(failed ? 1 : 0);
