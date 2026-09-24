// Uçtan uca: gerçek Electron uygulaması + mock API (sözleşme §7 "uçtan uca").
//   npm run test:e2e   (önce vite build yapar)
// Kullanıcı verisine dokunmaz: APPDATA geçici klasöre yönlendirilir. Tarayıcı
// açılmasın diye ana süreçteki shell.openExternal test sırasında susturulur (açılan
// adresler kaydedilir). alpha.7: HardSetups hesabı zorunlu — önce giriş kapısı.
// Ekran görüntüleri: E2E_OUT (varsayılan: işletim sisteminin temp klasörü).
/* global window, document -- win.evaluate() gövdeleri renderer'da çalışır */
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
    // lastSeenVersion eski: güncelleme sonrası ilk açılış gibi → "Bu sürümde neler var" çıkmalı
    fs.writeFileSync(path.join(appData, '.hlauncher', 'config.json'), JSON.stringify({ settings: { onboarded: true, checkUpdates: false }, lastSeenVersion: '1.0.0-alpha.5' }));
    fs.mkdirSync(path.join(appData, '.hlauncher', 'logs'), { recursive: true });
    fs.writeFileSync(path.join(appData, '.hlauncher', 'logs', 'hlauncher.log'), `eski satır --accessToken ${'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'}\n`);

    const server = await mock.start(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    // HL_EXTERNAL_BASE: Modrinth / Fabric meta da mock'tan (test internete çıkmaz)
    // HL_USER_DATA: açık bir geliştirme kopyası varken de çalışsın (tek instance kilidi userData'ya bağlı)
    const env = { ...process.env, APPDATA: appData, HL_API_BASE: base, HL_EXTERNAL_BASE: base, HL_USER_DATA: path.join(appData, 'electron-user') };
    delete env.ELECTRON_RUN_AS_NODE; // açıksa main.cjs kendini yeniden başlatır, Playwright süreci kaybeder
    delete env.NODE_ENV;              // dist/ yüklensin (Vite gerekmez)

    let app = await electron.launch({ args: [ROOT], env });
    const step = (name) => console.log(`  • ${name}`);
    const approve = (userCode, deny = false) => fetch(`${base}/__mock/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userCode, deny }) });
    const muteBrowser = (a) => a.evaluate(({ shell }) => { globalThis.__hlOpened = []; shell.openExternal = async (u) => { globalThis.__hlOpened.push(String(u)); }; });
    try {
        await muteBrowser(app);
        let win = await app.firstWindow();

        // Giriş kapısı: oturum yokken kabuk hiç çizilmez, arkada odaklanabilir öğe kalmaz
        await win.waitForSelector('.auth .auth-login', { timeout: 20000 });
        assert.strictEqual(await win.$('.rail'), null, 'kapı açıkken ray görünmemeli');
        assert.strictEqual(await win.$('.whatsnew'), null, '"neler var" girişten sonra gelmeli');
        const focusableOutside = await win.evaluate(() => [...document.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
            .filter((el) => !el.closest('.auth')).length);
        assert.strictEqual(focusableOutside, 0, 'kapının dışında odaklanabilir öğe kalmamalı');
        await win.waitForTimeout(400); // açılış animasyonu bitsin
        await win.screenshot({ path: path.join(OUT, '00-giris-ekrani.png') });
        step('uygulama açıldı: giriş ekranı görünüyor, kabuk (ray) yok');

        await win.click('.auth-login');
        const codeEl = await win.waitForSelector('.auth-code-value', { timeout: 10000 });
        const userCode = (await codeEl.textContent()).trim();
        assert.match(userCode, /^[A-Z]{4}-[A-Z]{4}$/);
        await win.waitForSelector('.auth-status.is-waiting');
        await win.waitForTimeout(300);
        await win.screenshot({ path: path.join(OUT, '01-giris-kodu.png') });
        step(`giriş kodu gösterildi (${userCode})`);

        await approve(userCode);
        await win.waitForSelector('.rail', { timeout: 20000 });
        assert.strictEqual(await win.$('.auth'), null, 'girişten sonra kapı kalkmalı');
        step('onaylandı: kabuk açıldı');

        await win.waitForSelector('.whatsnew .md', { timeout: 10000 });
        await win.waitForTimeout(300);
        await win.screenshot({ path: path.join(OUT, '00-neler-yeni.png') });
        await win.click('.modal .btn-primary');
        await win.waitForSelector('.whatsnew', { state: 'detached' });
        step('"Bu sürümde neler var" güncelleme sonrası bir kez gösterildi');

        await win.click('.rail-account');
        await win.waitForSelector('.hs-card.is-connected', { timeout: 20000 });
        await win.waitForSelector('.hs-balance', { timeout: 10000 });
        const username = (await win.textContent('.hs-username')).trim();
        const balance = (await win.textContent('.hs-balance b')).trim();
        assert.strictEqual(username, 'mert');
        assert.match(balance, /250,00/);
        await win.screenshot({ path: path.join(OUT, '03-bagli.png') });
        step(`bağlandı: ${username}, bakiye ${balance}`);

        // Ana sayfa: küçük "HardSetups'ta yeni" kartı + haberler panelden (kullanıcı kararı)
        await win.click('.rail-btn[aria-label="Ana sayfa"]');
        await win.waitForSelector('.hs-highlight', { timeout: 10000 });
        await win.waitForSelector('.news-item:has-text("Kum Fırtınası 1.4 yayında")', { timeout: 10000 });
        await win.screenshot({ path: path.join(OUT, '03-anasayfa.png') });
        step('ana sayfa: HardSetups kartı ve panel haberleri');

        // Vitrin → ürün sayfası → bakiye ile satın al → "Şimdi kur" → kütüphanede kurulur
        await win.click('.rail-library');
        await win.waitForSelector('.hero-card', { timeout: 15000 });
        assert.strictEqual(await win.$$eval('.hero-dot', (d) => d.length), 2, 'bilinmeyen action türü gizlenmeli');
        await win.waitForSelector('.camp .coupon');
        await win.waitForSelector('.bell-count');
        // v1.7: hesaba özel kuponlar (bilinmeyen türdeki elenir)
        await win.waitForSelector('.feed-title:has-text("Kuponların")');
        assert.ok((await win.textContent('.feed')).includes('HLW-7K2MQ9PX'));
        assert.ok(!(await win.textContent('.feed')).includes('BOZUK'));
        await win.waitForTimeout(300);
        await win.screenshot({ path: path.join(OUT, '03a-vitrin.png') });
        step('vitrin: hero, kampanya kuponu, hesap kuponları, öne çıkanlar, bildirim sayısı');

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
        await win.waitForSelector('.buy-consents input:not(:checked)'); // sözleşme kutusu işaretsiz başlar
        assert.ok(await win.$eval('.modal-foot .btn-primary', (b) => b.disabled), 'onay verilmeden öde düğmesi pasif olmalı');
        await win.check('.buy-consents input');
        await win.waitForTimeout(300);
        await win.screenshot({ path: path.join(OUT, '03a3-onay.png') });
        await win.click('.modal-foot .btn-primary'); // öde
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

        // Sorun bildir: önizleme temiz, onaysız gönderilmez, sunucuya temiz içerik gider
        await win.click('.rail-btn[aria-label="Ayarlar"]');
        await win.click('button:has-text("Sorun bildir")');
        await win.waitForSelector('.report-files');
        await win.fill('.report input', 'Test talebi');
        await win.fill('.report textarea', 'Launcher açılıyor ama deneme amaçlı bildiriyorum');
        await win.click('.report-file .link-btn');
        const previewText = await win.textContent('.report-preview');
        assert.ok(previewText.includes('[gizli]') && !previewText.includes('eyJhbGciOiJIUzI1NiJ9.eyJzdWIi'), 'önizlemede token görünmemeli');
        assert.ok(await win.$eval('.modal .btn-primary', (b) => b.disabled), 'onaysız gönder düğmesi pasif olmalı');
        await win.screenshot({ path: path.join(OUT, '03d-sorun-bildir.png') });
        await win.click('.report > .check-row input');
        await win.click('.modal .btn-primary');
        await win.waitForSelector('.modal-icon.tone-success', { timeout: 10000 });
        assert.ok(mock.state.lastReport && !mock.state.lastReport.raw.includes('eyJhbGciOiJIUzI1NiJ9.eyJzdWIi'));
        await win.click('.modal .btn-primary');
        await win.click('.rail-account');
        step('sorun bildirildi: önizleme ve sunucuya giden içerik temiz, onay zorunlu');

        // Oturum diskte şifreli, renderer'da token yok
        const sessionFile = JSON.parse(fs.readFileSync(path.join(appData, '.hlauncher', 'hardsetups-session.json'), 'utf8'));
        assert.ok(sessionFile.refresh.startsWith('enc:'), 'yenileme token\'ı şifreli olmalı');
        const leaked = await win.evaluate(async () => JSON.stringify(await window.electronAPI.portalState()));
        assert.ok(!/hla_|refresh|deviceCode|accessToken/i.test(leaked), `renderer'a gizli değer sızdı: ${leaked}`);
        step('oturum dosyası şifreli; renderer\'da token yok');

        // Çıkış onay ister; sonra giriş ekranı (kendi çıkışında iptal bildirimi yok)
        await win.click('.hs-logout');
        await win.waitForSelector('.hs-logout-confirm');
        await win.waitForTimeout(300);
        await win.screenshot({ path: path.join(OUT, '03e-cikis-onayi.png') });
        await win.click('.hs-logout-confirm');
        await win.waitForSelector('.auth .auth-login', { timeout: 10000 });
        assert.strictEqual(await win.$('.rail'), null);
        assert.strictEqual(await win.$('.auth-notice-revoked'), null, 'kendi çıkışında iptal bildirimi olmamalı');
        assert.ok(!fs.existsSync(path.join(appData, '.hlauncher', 'hardsetups-session.json')), 'çıkışta oturum dosyası silinmeli');
        step('"Bağlantıyı kes" onaylandı: giriş ekranına dönüldü');

        // Kayıt ol: aynı cihaz kodu akışı, onay sayfası kayıt adımıyla (yeni=1). Ret → yeni kod → onay
        await win.click('.auth-register');
        const regCode = (await (await win.waitForSelector('.auth-code-value', { timeout: 10000 })).textContent()).trim();
        const opened = await app.evaluate(() => globalThis.__hlOpened.slice(-1)[0] || '');
        assert.match(opened, /[?&]yeni=1/, `kayıt onay sayfası yeni=1 ile açılmalı: ${opened}`);
        await approve(regCode, true);
        await win.waitForSelector('.auth-status.is-denied', { timeout: 15000 });
        await win.screenshot({ path: path.join(OUT, '03f-kayit-reddedildi.png') });
        await win.click('.auth-retry');
        await win.waitForFunction((old) => {
            const el = document.querySelector('.auth-code-value');
            return !!el && el.textContent.trim() !== old;
        }, regCode, { timeout: 10000 });
        const regCode2 = (await win.textContent('.auth-code-value')).trim();
        await approve(regCode2);
        await win.waitForSelector('.rail', { timeout: 20000 });
        step('Kayıt ol: yeni=1 ile açıldı; reddedilen koddan sonra yeni kodla bağlanıldı');

        // Panelden iptal → oturum düşer, giriş ekranı iptal bildirimiyle görünür
        await fetch(`${base}/__mock/revoke`, { method: 'POST' });
        await win.evaluate(() => window.electronAPI.portalRefresh());
        await win.waitForSelector('.auth .auth-notice-revoked', { timeout: 10000 });
        assert.strictEqual(await win.$('.rail'), null, 'iptalden sonra kabuk kalkmalı');
        await win.waitForTimeout(400); // açılış animasyonu bitsin
        await win.screenshot({ path: path.join(OUT, '04-iptal-bildirimi.png') });
        assert.ok(!fs.existsSync(path.join(appData, '.hlauncher', 'hardsetups-session.json')));
        // Regresyon: oturum düşünce giriş akışı kendiliğinden başlayıp yeni kod almamalı
        assert.strictEqual(await win.$('.auth-code-value'), null, 'giriş akışı kendiliğinden başladı');
        step('panelden iptal edilen cihaz oturumu kapattı; giriş ekranında bildirim gösterildi');

        // Bakım: giriş ekranında bildirim, giriş düğmeleri pasif; bitince "Tekrar dene" açar
        mock.state.scenario = 'maintenance';
        await win.evaluate(() => window.electronAPI.portalRefresh());
        await win.waitForSelector('.auth-notice-maintenance', { timeout: 10000 });
        assert.ok(await win.$eval('.auth-login', (b) => b.disabled), 'bakımda giriş düğmesi pasif olmalı');
        assert.ok(await win.$eval('.auth-register', (b) => b.disabled), 'bakımda kayıt düğmesi pasif olmalı');
        await win.waitForTimeout(300);
        await win.screenshot({ path: path.join(OUT, '05-bakim.png') });
        mock.state.scenario = 'normal';
        await win.click('.auth-recheck');
        await win.waitForSelector('.auth-login:not(:disabled)', { timeout: 10000 });
        step('bakım: giriş ekranında bildirim, düğmeler pasif; bitince yeniden açıldı');

        // Çevrimdışı: daha önce giriş yapmış oyuncu internetsiz de açar (giriş ekranı görünmez)
        await win.click('.auth-login');
        await approve((await (await win.waitForSelector('.auth-code-value', { timeout: 10000 })).textContent()).trim());
        await win.waitForSelector('.rail', { timeout: 20000 });
        await app.close();
        app = await electron.launch({ args: [ROOT], env: { ...env, HL_API_BASE: 'http://127.0.0.1:9', HL_EXTERNAL_BASE: 'http://127.0.0.1:9' } });
        await muteBrowser(app);
        win = await app.firstWindow();
        const first = await win.waitForSelector('.rail, .auth:not(.auth-splash)', { timeout: 20000 });
        assert.ok(await first.evaluate((el) => el.classList.contains('rail')), 'kayıtlı oturumla giriş ekranı görünmemeli');
        await win.waitForTimeout(1500); // ağ hataları oturumu kapatmamalı
        assert.strictEqual(await win.$('.auth'), null, 'ağ hatası oturumu kapattı');
        await win.screenshot({ path: path.join(OUT, '06-cevrimdisi.png') });
        step('çevrimdışı: kayıtlı oturumla launcher doğrudan açıldı');
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
