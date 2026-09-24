// Uçtan uca: gerçek Electron uygulaması + mock API (sözleşme §7 "uçtan uca").
//   npm run test:e2e   (önce vite build yapar)
// Kullanıcı verisine dokunmaz: APPDATA geçici klasöre yönlendirilir. Tarayıcı
// açılmasın diye ana süreçteki shell.openExternal test sırasında susturulur.
// Ekran görüntüleri: E2E_OUT (varsayılan: işletim sisteminin temp klasörü).
/* global window -- win.evaluate() gövdeleri renderer'da çalışır */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { _electron: electron } = require('playwright-core');
const mock = require('../../dev/mock-api/server.cjs');

const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.E2E_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'hlauncher-e2e-out-'));

async function main() {
    const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'hlauncher-e2e-'));
    fs.mkdirSync(path.join(appData, '.hlauncher'), { recursive: true });
    fs.writeFileSync(path.join(appData, '.hlauncher', 'config.json'), JSON.stringify({ settings: { onboarded: true, checkUpdates: false } }));

    const server = await mock.start(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    // HL_EXTERNAL_BASE: Modrinth / Fabric meta da mock'tan (test internete çıkmaz)
    const env = { ...process.env, APPDATA: appData, HL_API_BASE: base, HL_EXTERNAL_BASE: base };
    delete env.ELECTRON_RUN_AS_NODE; // açıksa main.cjs kendini yeniden başlatır, Playwright süreci kaybeder
    delete env.NODE_ENV;              // dist/ yüklensin (Vite gerekmez)

    const app = await electron.launch({ args: [ROOT], env });
    const step = (name) => console.log(`  • ${name}`);
    try {
        await app.evaluate(({ shell }) => { shell.openExternal = async () => {}; });
        const win = await app.firstWindow();
        await win.waitForSelector('.rail', { timeout: 20000 });
        step('uygulama açıldı');

        await win.click('.rail-account');
        await win.waitForSelector('.hs-card');
        await win.screenshot({ path: path.join(OUT, '01-hesap-bagli-degil.png') });
        step('HardSetups kartı: bağlı değil');

        await win.click('.hs-card .btn-primary');
        const codeEl = await win.waitForSelector('.hs-code-value', { timeout: 10000 });
        const userCode = (await codeEl.textContent()).trim();
        assert.match(userCode, /^[A-Z]{4}-[A-Z]{4}$/);
        await win.waitForTimeout(400); // açılış animasyonu bitsin
        await win.screenshot({ path: path.join(OUT, '02-baglanti-kodu.png') });
        step(`bağlantı kodu gösterildi (${userCode})`);

        await fetch(`${base}/__mock/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userCode }) });
        await win.waitForSelector('.hs-card.is-connected', { timeout: 20000 });
        await win.waitForSelector('.hs-balance', { timeout: 10000 });
        const username = (await win.textContent('.hs-username')).trim();
        const balance = (await win.textContent('.hs-balance b')).trim();
        assert.strictEqual(username, 'mert');
        assert.match(balance, /250,00/);
        await win.screenshot({ path: path.join(OUT, '03-bagli.png') });
        step(`bağlandı: ${username}, bakiye ${balance}`);

        // Vitrin → ürün sayfası → bakiye ile satın al → "Şimdi kur" → kütüphanede kurulur
        await win.click('.rail-library');
        await win.waitForSelector('.hero-card', { timeout: 15000 });
        assert.strictEqual(await win.$$eval('.hero-dot', (d) => d.length), 2, 'bilinmeyen action türü gizlenmeli');
        await win.waitForSelector('.camp .coupon');
        await win.waitForSelector('.bell-count');
        await win.waitForTimeout(300);
        await win.screenshot({ path: path.join(OUT, '03a-vitrin.png') });
        step('vitrin: hero, kampanya kuponu, öne çıkanlar, bildirim sayısı');

        await win.click('.pcard:has-text("DoldurDoldur")');
        await win.waitForSelector('.pview-head h1:has-text("DoldurDoldur")');
        const md = await win.textContent('.pview-desc');
        assert.ok(md.includes('<script>'), 'ham HTML metin olarak görünmeli, işlenmemeli');
        assert.strictEqual(await win.$('.pview-desc script'), null);
        await win.screenshot({ path: path.join(OUT, '03a2-urun.png') });
        await win.click('.pview-cta .btn-primary');
        await win.fill('.modal input', 'LAUNCHER10');
        await win.click('.modal .btn-primary'); // Devam → teklif
        await win.waitForSelector('.buy-sum tr.is-total');
        await win.waitForTimeout(300);
        await win.screenshot({ path: path.join(OUT, '03a3-onay.png') });
        await win.click('.modal .btn-primary'); // öde
        await win.waitForSelector('.modal-icon.tone-success', { timeout: 10000 });
        assert.strictEqual(mock.state.stats.purchases, 1);
        step('satın alındı: teklif → onay (toplam + sonraki bakiye) → sipariş');
        await win.click('.modal .btn-primary'); // Şimdi kur → kütüphane
        await win.waitForSelector('.hs-item.is-installed:has-text("DoldurDoldur") .btn-play', { timeout: 30000 });
        assert.ok(fs.existsSync(path.join(appData, '.hlauncher', 'instances', 'hs-tiktok-doldurdoldur', 'hl-manifest.json')));
        step('"Şimdi kur": ürün kütüphanede kendiliğinden kuruldu');

        // Kütüphane: lisanslı ürünü kur → ayrı klasör → dünyaları yedekleyerek kaldır
        await win.waitForSelector('.hs-item:has-text("Kum Fırtınası") .btn-primary', { timeout: 15000 });
        await win.screenshot({ path: path.join(OUT, '03b-kutuphane.png') });
        await win.click('.hs-item:has-text("Kum Fırtınası") .btn-primary');
        await win.waitForSelector('.hs-item.is-installed:has-text("Kum Fırtınası") .btn-play', { timeout: 30000 });
        const instDir = path.join(appData, '.hlauncher', 'instances', 'hs-kum-firtinasi');
        for (const rel of ['mods/hardsetups-kumfirtinasi-1.4.0.jar', 'mods/fabric-api-0.116.17+1.21.1.jar', 'hl-manifest.json', 'config/hardsetups/ayarlar.json']) {
            assert.ok(fs.existsSync(path.join(instDir, ...rel.split('/'))), `kurulumda eksik: ${rel}`);
        }
        assert.ok(!fs.existsSync(path.join(appData, '.hlauncher', 'mods')), 'ürün dosyaları kök klasöre karışmamalı');
        await win.waitForSelector('.rail-inst[aria-label="Kum Fırtınası"]', { timeout: 5000 });
        await win.screenshot({ path: path.join(OUT, '03c-kuruldu.png') });
        step('ürün kuruldu: kendi klasöründe, rayda profil olarak görünüyor');

        fs.mkdirSync(path.join(instDir, 'saves', 'Dunya'), { recursive: true });
        fs.writeFileSync(path.join(instDir, 'saves', 'Dunya', 'level.dat'), 'dunya');
        await win.click('.hs-item.is-installed:has-text("Kum Fırtınası") .icon-btn-framed');
        await win.click('.menu-panel .is-danger, .menu-panel button:has-text("Kaldır")');
        await win.waitForSelector('.check-row input:checked');
        await win.click('.modal .btn-danger');
        await win.waitForSelector('.hs-item:not(.is-installed):has-text("Kum Fırtınası")', { timeout: 10000 });
        assert.ok(!fs.existsSync(instDir), 'örnek klasörü silinmeli');
        const backups = fs.readdirSync(path.join(appData, '.hlauncher', 'yedekler'));
        assert.ok(backups.some((f) => /^kum-firtinasi-dunyalar-.*\.zip$/.test(f)), `dünya yedeği yok: ${backups}`);
        await win.click('.modal .btn-primary'); // "kaldırıldı" bildirimi
        await win.click('.rail-account');
        await win.waitForSelector('.hs-card.is-connected');
        step('dünyalar yedeklenip ürün kaldırıldı');

        // Oturum diskte şifreli, renderer'da token yok
        const sessionFile = JSON.parse(fs.readFileSync(path.join(appData, '.hlauncher', 'hardsetups-session.json'), 'utf8'));
        assert.ok(sessionFile.refresh.startsWith('enc:'), 'yenileme token\'ı şifreli olmalı');
        const leaked = await win.evaluate(async () => JSON.stringify(await window.electronAPI.portalState()));
        assert.ok(!/hla_|refresh|deviceCode|accessToken/i.test(leaked), `renderer'a gizli değer sızdı: ${leaked}`);
        step('oturum dosyası şifreli; renderer\'da token yok');

        // Panelden iptal → oturum düşer ve kullanıcıya söylenir
        await fetch(`${base}/__mock/revoke`, { method: 'POST' });
        await win.evaluate(() => window.electronAPI.portalRefresh());
        await win.waitForSelector('.hs-card:not(.is-connected)', { timeout: 10000 });
        await win.waitForSelector('.modal', { timeout: 5000 });
        await win.waitForTimeout(400); // açılış animasyonu bitsin
        await win.screenshot({ path: path.join(OUT, '04-iptal-bildirimi.png') });
        assert.ok(!fs.existsSync(path.join(appData, '.hlauncher', 'hardsetups-session.json')));
        // Regresyon: oturum düşünce bağlanma penceresi kendiliğinden açılıp yeni kod almamalı
        assert.strictEqual(await win.$('.hs-code-value'), null, 'bağlanma penceresi kendiliğinden açıldı');
        await win.click('.modal .btn-primary');
        step('panelden iptal edilen cihaz oturumu kapattı, bildirim gösterildi');

        // Bakım bandı
        mock.state.scenario = 'maintenance';
        await win.evaluate(() => window.electronAPI.portalRefresh());
        await win.waitForSelector('.portal-banner', { timeout: 10000 });
        await win.screenshot({ path: path.join(OUT, '05-bakim.png') });
        step('bakım bandı gösterildi');
    } finally {
        await app.close().catch(() => {});
        await new Promise((r) => server.close(r));
        try { fs.rmSync(appData, { recursive: true, force: true }); } catch { /* kilit */ }
    }
    console.log(`\nE2E geçti. Ekran görüntüleri: ${OUT}`);
}

main().catch((err) => {
    console.error(`\nE2E başarısız: ${err.stack || err.message}\nEkran görüntüleri: ${OUT}`);
    process.exit(1);
});
