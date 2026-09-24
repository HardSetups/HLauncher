// Tasarım incelemesi için ekran görüntüleri: derlenmiş uygulama (dist/) mock API'ye karşı açılır,
// sayfalar gezilir, PNG'ler bir klasöre yazılır. Test değil; tasarım yaparken bakmak için.
//
//   npm run build && node tests/e2e/shots.cjs [çıktı klasörü] [--no-login] [--fresh] [--scenario=<ad>] [--size=1280x800]
//
// --no-login: HardSetups hesabı bağlanmadan (giriş ekranı / kilit görünümü)
// --fresh:    ilk kurulum (onboarding) — config.json yazılmaz
// --beta:     Ayarlar › "Beta sürümlerini de kur" açık (kütüphanede beta rozeti)
// --empty-library: hesapta hiç ürün yok (boş kütüphane + katalog önerileri)
// --install:  kütüphanedeki ilk ürünü kurar (kurulu kart görünümü)
// --scenario=sparse | emptyStore: canlıdaki gibi az içerikli / tamamen boş vitrin
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
            settings: { onboarded: true, checkUpdates: false, hsBetaChannel: flag('beta') },
            account: { type: 'offline', name: 'Oyuncu' },
            lastSeenVersion: require(path.join(ROOT, 'package.json')).version,
        }));
    }
    const server = await mock.start(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    if (opt('scenario')) mock.state.scenario = opt('scenario');
    if (flag('empty-library')) mock.state.owned = new Set();
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
    // Tekerlek olayı imlecin altındaki öğeye gider: önce içerik alanının ortasına gel
    const scroll = async (win, dy) => { await win.mouse.move(W / 2 + 40, H / 2); await win.mouse.wheel(0, dy); };
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

        if (!flag('no-login') && !flag('fresh')) {
            const res = await win.evaluate(() => globalThis.electronAPI.portalLoginStart());
            if (res?.ok) {
                await fetch(`${base}/__mock/approve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userCode: res.userCode }) });
                await win.waitForTimeout(2500);
                await win.keyboard.press('Escape').catch(() => {});
            } else console.log('  – giriş başlatılamadı', res?.error);
        }
        await shot(win, '02-sonraki');
        if (await clickIf(win, '.rail-home')) await shot(win, '03-ana-sayfa');
        if (await clickIf(win, '.rail-library')) {
            await shot(win, '04-vitrin');
            await scroll(win, 700);
            await shot(win, '05-vitrin-asagi');
            await scroll(win, 700);
            await shot(win, '05b-vitrin-asagi-2');
            await scroll(win, 1400);
            await shot(win, '05c-vitrin-son');
            if (await clickIf(win, '.hub-tab-library')) {
                await shot(win, '06-kutuphane');
                await scroll(win, 700);
                await shot(win, '06b-kutuphane-asagi');
                // --install: ilk ürünü kur, kurulu kart görünümü (Oyna + menü)
                if (flag('install') && await clickIf(win, '.hs-item .btn-primary')) {
                    await win.waitForSelector('.hs-item.is-installed .btn-play', { timeout: 30000 }).catch(() => console.log('  – kurulum bitmedi'));
                    await scroll(win, -2000);
                    await shot(win, '06d-kuruldu');
                }
            }
            if (await clickIf(win, '.hub-tab-store')) {
                await win.waitForSelector('.pcard:not(.is-skeleton)', { timeout: 5000 }).catch(() => {});
                if (await clickIf(win, '.pcard:not(.is-skeleton)')) {
                    await win.waitForSelector('.pview-head', { timeout: 5000 }).catch(() => {});
                    await shot(win, '06c-urun');
                }
            }
        }
        if (await clickIf(win, '.rail-settings')) {
            await shot(win, '07-ayarlar');
            await scroll(win, 500);
            await shot(win, '07b-ayarlar-asagi');
        }
        if (await clickIf(win, '.rail-account')) await shot(win, '08-hesap');
    } finally {
        await app.close().catch(() => {});
        await new Promise((r) => server.close(r));
        try { fs.rmSync(appData, { recursive: true, force: true }); } catch { /* kilit */ }
    }
    console.log(`Ekran görüntüleri: ${OUT}`);
})().catch((err) => { console.error('shots başarısız:', err); process.exit(1); });
