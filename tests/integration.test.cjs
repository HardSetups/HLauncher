// Entegrasyon testleri: GERÇEK ağ çağrılarıyla loader kurulumları, sunucu
// manifesti ve haber beslemesi. `npm run test:integration` ile elle çalıştırılır
// (CI'da koşmaz — dış servislerin anlık durumuna bağlıdır).
// APPDATA geçici klasöre yönlendirilir; gerçek kullanıcı verisine dokunmaz.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const tmpAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'hlauncher-int-'));
process.env.APPDATA = tmpAppData;

const MC = '1.21.4';
let passed = 0;
let failed = 0;

async function test(name, fn) {
    const started = Date.now();
    try {
        await fn();
        passed++;
        console.log(`  ✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (err) {
        failed++;
        console.error(`  ✗ ${name}\n    ${err.message}`);
    }
}

(async () => {
    const { getRootPath } = require('../electron/lib/paths.cjs');
    const rootPath = getRootPath();
    const noop = () => {};

    // ── Mojang sürüm listesi ────────────────────────────────────────────────
    const versions = require('../electron/lib/versions.cjs');
    await test('Mojang sürüm listesi çekiliyor', async () => {
        const list = await versions.getRecentReleaseVersions();
        assert.ok(list.length > 10, `çok az sürüm: ${list.length}`);
        assert.ok(/^\d+\./.test(list[0].id), `beklenmedik id: ${list[0].id}`);
    });

    // ── Fabric / Quilt ──────────────────────────────────────────────────────
    const fabriclike = require('../electron/lib/loaders/fabriclike.cjs');
    await test(`Fabric ${MC} kurulumu`, async () => {
        const id = await fabriclike.install('fabric', rootPath, MC, noop);
        assert.ok(id.startsWith('fabric-loader-') && id.endsWith(`-${MC}`), id);
        const json = JSON.parse(fs.readFileSync(path.join(rootPath, 'versions', id, `${id}.json`), 'utf8'));
        assert.strictEqual(json.id, id);
        assert.ok(json.libraries?.length, 'profil kütüphaneleri boş');
    });
    await test(`Quilt ${MC} kurulumu`, async () => {
        const id = await fabriclike.install('quilt', rootPath, MC, noop);
        assert.ok(id.startsWith('quilt-loader-') && id.endsWith(`-${MC}`), id);
        assert.ok(fs.existsSync(path.join(rootPath, 'versions', id, `${id}.json`)));
    });

    // ── OptiFine (BMCL) ─────────────────────────────────────────────────────
    const optifine = require('../electron/lib/loaders/optifine.cjs');
    await test(`OptiFine ${MC} kurulumu (BMCL indirme + launchwrapper çıkarma)`, async () => {
        const id = await optifine.install(rootPath, MC, noop);
        assert.ok(id.startsWith(`${MC}-OptiFine_`), id);
        const json = JSON.parse(fs.readFileSync(path.join(rootPath, 'versions', id, `${id}.json`), 'utf8'));
        assert.strictEqual(json.inheritsFrom, MC);
        for (const lib of json.libraries) {
            const jar = path.join(rootPath, 'libraries', lib.downloads.artifact.path);
            assert.ok(fs.existsSync(jar), `kütüphane jar'ı eksik: ${lib.name}`);
        }
    });

    // ── Forge / NeoForge ────────────────────────────────────────────────────
    const forge = require('../electron/lib/loaders/forge.cjs');
    await test(`Forge ${MC} sürüm çözümü`, async () => {
        const v = await forge.resolveForgeVersion(MC);
        assert.ok(/^\d+\./.test(v), v);
    });
    await test(`NeoForge ${MC} sürüm çözümü`, async () => {
        const v = await forge.resolveNeoForgeVersion(MC);
        assert.ok(v.startsWith('21.4'), v);
    });
    await test(`Forge ${MC} installer indirme`, async () => {
        const p = await forge.ensureInstaller('forge', MC, noop);
        assert.ok(fs.existsSync(p) && fs.statSync(p).size > 1024 * 1024, 'installer küçük/yok');
    });

    // ── Modrinth ────────────────────────────────────────────────────────────
    const modrinth = require('../electron/lib/modrinth.cjs');
    await test('Modrinth arama + sürüm seçimi', async () => {
        const res = await modrinth.search({ query: 'sodium', mcVersion: MC, loader: 'fabric', limit: 5 });
        assert.ok(res.hits.some((h) => h.slug === 'sodium'), 'sodium bulunamadı');
        const version = await modrinth.pickVersion('sodium', MC, 'fabric');
        assert.ok(version?.files?.length, 'sodium sürüm dosyası yok');
    });

    // ── Sunucu manifesti (depodaki örnek üzerinden uçtan uca) ───────────────
    const servermanifest = require('../electron/lib/servermanifest.cjs');
    await test('Sunucu manifesti: örnek hlauncher.json uygulanıyor (mod kurulumu dahil)', async () => {
        const url = 'https://raw.githubusercontent.com/HardSetups/HLauncher/main/docs/ornek-hlauncher.json';
        const summary = await servermanifest.applyManifest(url, noop);
        assert.strictEqual(summary.mcVersion, '1.21.4');
        assert.strictEqual(summary.loader, 'fabric');
        const instances = require('../electron/lib/instances.cjs');
        const modsDir = instances.getModsDir(summary.instanceId);
        const jars = fs.readdirSync(modsDir).filter((f) => f.endsWith('.jar'));
        assert.ok(jars.some((f) => f.includes('sodium')), `sodium kurulmadı: ${jars.join(', ')}`);
        assert.ok(jars.some((f) => f.includes('lithium')), `lithium kurulmadı: ${jars.join(', ')}`);
        assert.ok(summary.announcements.length >= 1, 'duyurular gelmedi');
    });

    // ── Haber beslemesi ─────────────────────────────────────────────────────
    const news = require('../electron/lib/news.cjs');
    await test('Haber beslemesi (news.json) çekiliyor', async () => {
        const items = await news.getNews();
        assert.ok(Array.isArray(items) && items.length >= 1, 'haber listesi boş');
        assert.ok(items[0].title, 'haber başlığı yok');
    });

    // ── Sonuç ───────────────────────────────────────────────────────────────
    console.log(`\n${passed} entegrasyon testi geçti, ${failed} kaldı`);
    try { fs.rmSync(tmpAppData, { recursive: true, force: true }); } catch { /* windows kilidi */ }
    process.exit(failed ? 1 : 0);
})();
