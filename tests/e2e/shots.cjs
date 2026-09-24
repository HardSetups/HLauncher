// Tasarım incelemesi için ekran görüntüleri: derlenmiş uygulama (dist/) mock API'ye karşı açılır,
// sayfalar gezilir, PNG'ler bir klasöre yazılır. Test değil; tasarım yaparken bakmak için.
//
//   npm run build && node tests/e2e/shots.cjs [çıktı klasörü] [--no-login] [--fresh] [--scenario=<ad>] [--size=1280x800]
//
// --no-login: HardSetups hesabı bağlanmadan: giriş kapısı (alpha.7), kod paneli, İngilizce hâli
// --fresh:    ilk kurulum — config.json yazılmaz; girişten sonra sihirbaz (onboarding) adımları çekilir
// --scenario: mock senaryosu (ör. maintenance, outdated, notDeployed → giriş ekranının durumları)
// --accent=#10b981: vurgu rengi (config.json settings.accent)
// --empty-home: vitrin boş gelir (canlıdaki gibi; ürün kataloğu dolu kalır)
// Giriş arayüzden bağımsız yapılır: portalLoginStart IPC'si çağrılır, kod mock'ta onaylanır.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright-core');
const mock = require('../../dev/mock-api/server.cjs');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] || def;
const OUT = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'hlauncher-shots-')));
const [W, H] = opt('size', '1280x800').split('x').map(Number);

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'hlauncher-shots-data-'));
    if (!flag('fresh')) {
        fs.mkdirSync(path.join(appData, '.hlauncher'), { recursive: true });
        fs.writeFileSync(path.join(appData, '.hlauncher', 'config.json'), JSON.stringify({
            settings: { onboarded: true, checkUpdates: false, ...(opt('accent') ? { accent: opt('accent') } : {}) },
            account: { type: 'offline', name: 'Oyuncu' },
            lastSeenVersion: require(path.join(ROOT, 'package.json')).version,
        }));
    }
    const server = await mock.start(0);
    if (flag('empty-home')) {
        // Vitrin boş: /v1/launcher/home tüm bölümleri boş döner, diğer uçlar mock'ta kalır
        const handlers = server.listeners('request');
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
            if (req.url.startsWith('/v1/launcher/home')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ hero: [], announcements: [], featured: [], campaigns: [], coupons: [], news: [], updates: [], expiring: [] }));
            }
            return handlers.forEach((h) => h.call(server, req, res));
        });
    }
    const base = `http://127.0.0.1:${server.address().port}`;
    if (opt('scenario')) mock.state.scenario = opt('scenario');
    const env = { ...process.env, APPDATA: appData, HL_API_BASE: base, HL_EXTERNAL_BASE: base, HL_USER_DATA: path.join(appData, 'electron-user') };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_ENV;

    const app = await electron.launch({ args: [ROOT], env });
    const shot = async (win, name) => {
        await win.waitForTimeout(700); // animasyonlar otursun
        const file = path.join(OUT, `${name}.png`);
        await win.screenshot({ path: file });
        console.log(`  ✓ ${file}`);
    };
    const clickIf = async (win, selector) => {
        const el = await win.$(selector);
        if (el) { await el.click(); return true; }
        console.log(`  – yok: ${selector}`);
        return false;
    };
    try {
        await app.evaluate(({ shell }) => { shell.openExternal = async () => {}; });
        const win = await app.firstWindow();
        await app.evaluate(({ BrowserWindow }, size) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setSize(size.W, size.H); w.center(); }, { W, H });
        await win.waitForLoadState('domcontentloaded');
        await win.waitForTimeout(1500);
        await shot(win, '01-acilis');

        if (flag('no-login')) {
            // Giriş kapısı: kod paneli ve dil değişimi
            if (await clickIf(win, '.auth-login:not(:disabled)')) {
                await win.waitForSelector('.auth-code-value', { timeout: 10000 }).catch(() => {});
                await shot(win, '02-giris-kodu');
                await clickIf(win, '.auth-cancel');
            }
            if (await clickIf(win, '.auth-lang button:not(.is-active)')) await shot(win, '02b-giris-dil');
        } else {
            const res = await win.evaluate(() => globalThis.electronAPI.portalLoginStart());
            if (res?.ok) {
                await fetch(`${base}/__mock/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userCode: res.userCode }) });
                await win.waitForSelector('.rail, .onboarding', { timeout: 20000 }).catch(() => {});
                // Ana sayfa bandındaki bakiye için /me yanıtını da bekle
                for (let i = 0; i < 40; i++) {
                    const st = await win.evaluate(() => globalThis.electronAPI.portalState()).catch(() => null);
                    if (st?.state?.signedIn && st.state.wallet) break;
                    await win.waitForTimeout(250);
                }
            } else console.log('  – giriş başlatılamadı', res?.error);
            if (flag('fresh') && await win.$('.onboarding')) {
                await shot(win, '02-ilk-kurulum-1');
                await clickIf(win, '.onboarding .modal-foot .btn-primary');
                await shot(win, '02-ilk-kurulum-2');
                await clickIf(win, '.onboarding .modal-foot button:last-child');
                await shot(win, '02-ilk-kurulum-3');
                await clickIf(win, '.onboarding .modal-foot .btn-primary');
            }
            await win.keyboard.press('Escape').catch(() => {});
        }
        await shot(win, '02-sonraki');
        if (await clickIf(win, '.rail-home')) {
            await shot(win, '03-ana-sayfa');
            // Ana sayfanın alt bölümleri (haberler, kaldığın yerden devam, kütüphane)
            await win.mouse.move(W / 2, H / 2);
            await win.mouse.wheel(0, 600);
            await shot(win, '03b-ana-sayfa-orta');
            await win.mouse.wheel(0, 2000);
            await shot(win, '03c-ana-sayfa-alt');
        }
        if (await clickIf(win, '.rail-library')) {
            await shot(win, '04-vitrin');
            await win.mouse.wheel(0, 700);
            await shot(win, '05-vitrin-asagi');
            if (await clickIf(win, '.hub-tab-library')) await shot(win, '06-kutuphane');
        }
        if (await clickIf(win, '.rail-settings')) await shot(win, '07-ayarlar');
        if (await clickIf(win, '.rail-account')) await shot(win, '08-hesap');
    } finally {
        await app.close().catch(() => {});
        await new Promise((r) => server.close(r));
        try { fs.rmSync(appData, { recursive: true, force: true }); } catch { /* kilit */ }
    }
    console.log(`Ekran görüntüleri: ${OUT}`);
})().catch((err) => { console.error('shots başarısız:', err); process.exit(1); });
