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
// --beta:     Ayarlar › "Beta sürümlerini de kur" açık (kütüphanede beta rozeti)
// --empty-library: hesapta hiç ürün yok (boş kütüphane + katalog önerileri)
// --install:  kütüphanedeki ilk ürünü kurar (kurulu kart görünümü)
// --scenario=sparse | emptyStore: canlıdaki gibi az içerikli / tamamen boş vitrin (vitrin + katalog)
// --audit:    görsel denetim turu (standart turdan sonra): menüler, profil sekmeleri, sürüm menüsü,
//             modallar (yeni profil, silme, sorun bildir, satın alma, çıkış), oyun başlatma/çalışıyor
//             göstergeleri, güncelleme hazır, hata/çökme pencereleri. Birkaç profil, sunucu, skin ve
//             mod dosyası hazırlanır. --skip-tour: standart turu atla (yalnızca denetim)
// --long:     uzun metinler: profil, ürün, kullanıcı, sunucu adı ve bildirim metni (taşma denetimi)
// --lang=en:  arayüz dili (config.json settings.language; İngilizce metinler çoğu yerde daha uzun)
// Giriş arayüzden bağımsız yapılır: portalLoginStart IPC'si çağrılır, kod mock'ta onaylanır.
/* global document -- win.evaluate() gövdeleri renderer'da çalışır */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { _electron: electron } = require('playwright-core');
const mock = require('../../dev/mock-api/server.cjs');

const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] || def;
const OUT = path.resolve(args.find((a) => !a.startsWith('--')) || fs.mkdtempSync(path.join(os.tmpdir(), 'hlauncher-shots-')));
const [W, H] = opt('size', '1280x800').split('x').map(Number);
const AUDIT = flag('audit');
const LONG = flag('long');

// Uzun metinler (--long): arayüzün izin verdiği üst sınırlara yakın
const LONG_TEXT = {
    profile: 'Yaz tatili hayatta kalma sunucusu: arkadaşlarla',   // 48 karakter (ad alanı sınırı)
    product: 'Kum Fırtınası: Çölün Ortasında Uzun Bir Hayatta Kalma Macerası',
    username: 'mert_hardsetups_uzun_kullanici',
    notif: 'Kum Fırtınası 1.5.0 yayında: yeni harita, yeni yaratıklar, kum fırtınası sırasında sığınak kurma ve çok oyunculu düzeltmeler',
};

// Küçük PNG kodlayıcı (skin kütüphanesi için 64×64 skin; mock'taki gibi bağımlılıksız)
function makePng(w, h, pixel) {
    const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, crc]);
    };
    const rows = [];
    for (let y = 0; y < h; y++) {
        const row = Buffer.alloc(1 + w * 4);
        for (let x = 0; x < w; x++) Buffer.from(pixel(x, y)).copy(row, 1 + x * 4);
        rows.push(row);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

/** Denetim verisi: birkaç profil (biri uzun adlı, mod dosyalı), sunucular, skin kütüphanesi. */
function seedAuditData(root) {
    const now = Date.now();
    const day = 86400e3;
    const instances = [
        { id: 'default', name: 'Varsayılan', mcVersion: null, loader: 'release', ram: null, origin: 'builtin', createdAt: now - 90 * day },
        { id: 'p-yaz', name: LONG ? LONG_TEXT.profile : 'Yaz sunucusu', mcVersion: '1.21.1', loader: 'fabric', ram: 6, origin: 'manual', serverAddress: 'oyna.ornek-sunucu.com', lastPlayed: now - 2 * 3600e3, createdAt: now - 30 * day },
        { id: 'p-yaratici', name: 'Yaratıcı dünya', mcVersion: '1.20.1', loader: 'forge', ram: null, origin: 'manual', lastPlayed: now - 2 * day, createdAt: now - 20 * day },
        { id: 'p-shader', name: 'Shader denemesi', mcVersion: '1.20.4', loader: 'optifine', ram: null, origin: 'manual', lastPlayed: now - 6 * day, createdAt: now - 10 * day },
    ];
    fs.writeFileSync(path.join(root, 'instances.json'), JSON.stringify({ instances }, null, 2));
    const mods = path.join(root, 'instances', 'p-yaz', 'mods');
    fs.mkdirSync(mods, { recursive: true });
    for (const name of ['sodium-fabric-0.6.13+mc1.21.1.jar', 'lithium-fabric-mc1.21.1-0.15.0.jar', 'cok-uzun-adli-bir-mod-dosyasi-duzen-denemesi-icin-fabric-1.21.1-v2.4.0-beta.jar']) {
        fs.writeFileSync(path.join(mods, name), Buffer.from(`sahte jar ${name}`));
    }
    fs.writeFileSync(path.join(mods, 'kapali-mod-0.1.0.jar.disabled'), Buffer.from('sahte'));
    // Skin: gövde/baş renkli basit 64×64 desen
    const skins = path.join(root, 'skins');
    fs.mkdirSync(skins, { recursive: true });
    const png = makePng(64, 64, (x, y) => (y < 16 ? [196, 140, 100, 255] : y < 32 ? [60, 90, 160, 255] : [40, 40, 48, 255]));
    const id = 'a1b2c3d4e5f60718';
    fs.writeFileSync(path.join(skins, `${id}.png`), png);
    fs.writeFileSync(path.join(skins, 'index.json'), JSON.stringify({ skins: [{ id, name: LONG ? 'Çok uzun adlı skin denemesi' : 'Mavi gömlek', variant: 'classic', source: 'file', hash: 'x', addedAt: now }] }));
    return [
        { id: 's1', name: LONG ? 'Ornek Sunucu Hayatta Kalma ve Mini Oyunlar Ağı' : 'Örnek sunucu', address: 'oyna.ornek-sunucu.com', favorite: true, manifestUrl: '', addedAt: now - 5 * day },
        { id: 's2', name: '', address: 'mc.hypixel.net', favorite: false, manifestUrl: '', addedAt: now - 4 * day },
    ];
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'hlauncher-shots-data-'));
    if (!flag('fresh')) {
        const root = path.join(appData, '.hlauncher');
        fs.mkdirSync(root, { recursive: true });
        const servers = AUDIT || LONG ? seedAuditData(root) : [];
        fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({
            settings: { onboarded: true, checkUpdates: false, hsBetaChannel: flag('beta'), ...(opt('accent') ? { accent: opt('accent') } : {}), ...(opt('lang') ? { language: opt('lang') } : {}) },
            account: { type: 'offline', name: LONG ? 'UzunOyuncuAdi_16' : 'Oyuncu' },
            servers,
            // Denetimde "Bu sürümde neler var" açılışta bir kez görünür
            lastSeenVersion: AUDIT ? '1.0.0-alpha.6' : require(path.join(ROOT, 'package.json')).version,
        }));
    }
    const server = await mock.start(0);
    if (LONG) {
        // Yanıtlardaki ürün adını ve bildirim metnini uzat (JSON dizesi içinde düz değiştirme)
        mock.state.user.username = LONG_TEXT.username;
        const handlers = server.listeners('request');
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
            const end = res.end;
            res.end = function patched(chunk, ...rest) {
                if (typeof chunk === 'string' && chunk.startsWith('{')) {
                    chunk = chunk.split('Kum Fırtınası').join(LONG_TEXT.product).split('Yeni sürüm yayında').join(LONG_TEXT.notif);
                }
                return end.call(this, chunk, ...rest);
            };
            return handlers.forEach((h) => h.call(server, req, res));
        });
    }
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
            if (AUDIT && await win.waitForSelector('.whatsnew', { timeout: 4000 }).catch(() => null)) await shot(win, 'a00-neler-yeni');
            await win.keyboard.press('Escape').catch(() => {});
        }
        await shot(win, '02-sonraki');
        if (!flag('skip-tour')) await tour(win);
        if (AUDIT) await audit(win);
    } finally {
        await app.close().catch(() => {});
        await new Promise((r) => server.close(r));
        try { fs.rmSync(appData, { recursive: true, force: true }); } catch { /* kilit */ }
    }
    console.log(`Ekran görüntüleri: ${OUT}`);

    async function tour(win) {
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
            if (await win.$('.hub-band .bell')) {
                await win.click('.hub-band .bell');
                await win.waitForSelector('.notif-item', { timeout: 5000 }).catch(() => {});
                await shot(win, '04b-bildirimler');
                await win.keyboard.press('Escape');
            }
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
    }

    // ── Denetim turu (--audit) ───────────────────────────────────────────────
    // Her adım kendi içinde yakalanır: biri tutmazsa tur sürer (eksik adım günlükte görünür)
    async function audit(win) {
        const send = (channel, payload) => app.evaluate(({ BrowserWindow }, a) => BrowserWindow.getAllWindows()[0].webContents.send(a.channel, a.payload), { channel, payload });
        const step = async (name, fn) => {
            try { await fn(); } catch (err) { console.log(`  – ${name}: ${String(err.message).split('\n')[0]}`); }
            await win.keyboard.press('Escape').catch(() => {});
            await win.mouse.click(4, H - 4).catch(() => {}); // açık menü kalmasın (ray boşluğu)
            await win.waitForTimeout(250);
        };
        const go = async (selector) => { await win.click(selector); await win.waitForTimeout(500); };
        const toTop = () => win.evaluate(() => document.querySelectorAll('.page-scroll').forEach((el) => { el.scrollTop = 0; }));
        const toEnd = () => win.evaluate(() => { const el = document.querySelector('.page-scroll'); el.scrollTop = el.scrollHeight; });
        // Öğeyi kaydırma alanının altına getir (açılır panel yukarı açılmalı)
        const toBottomEdge = (selector) => win.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'end' }), selector);
        const center = (selector) => win.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), selector);
        const profileName = LONG ? LONG_TEXT.profile : 'Yaz sunucusu';

        await step('ana sayfa menüsü', async () => {
            await go('.rail-home');
            await center('.recent-row');
            await win.click('.recent-row .menu > button');
            await shot(win, 'a01-ana-sayfa-menu');
        });
        await step('kütüphane kartı üzerine gelme', async () => {
            await center('.lib-card');
            await win.hover('.lib-card');
            await shot(win, 'a02-kutuphane-karti');
        });
        await step('ray ipucu', async () => {
            await win.hover('.rail-inst >> nth=0');
            await shot(win, 'a03-ray-ipucu');
        });
        await step('profil: modlar', async () => {
            await go(`.rail-inst[aria-label="${profileName}"]`);
            await win.waitForSelector('.table-row', { timeout: 8000 }).catch(() => {});
            await shot(win, 'a04-profil-modlar');
            await win.click('.inst-actions .menu > button');
            await shot(win, 'a05-profil-menu');
        });
        await step('profil: içerik menüsü', async () => {
            await win.click('.toolbar-end .menu > button');
            await shot(win, 'a06-icerik-menu');
        });
        await step('profil: mod silme onayı', async () => {
            await win.click('.table-row .icon-btn-danger');
            await shot(win, 'a07-mod-sil');
        });
        for (const [n, name] of [[2, 'a08-profil-kaynak'], [3, 'a09-profil-shader']]) {
            await step(name, async () => { await win.click(`.inst .tabs .tab:nth-child(${n})`); await shot(win, name); });
        }
        await step('profil: ayarlar + sürüm menüsü', async () => {
            await win.click('.inst .tabs .tab:nth-child(4)');
            await shot(win, 'a10-profil-ayarlar');
            await win.click('.iset .vmenu-trigger');
            await shot(win, 'a11-surum-menusu');
        });
        await step('profil: sürüm menüsü (alt kenarda)', async () => {
            await toBottomEdge('.iset .vmenu-trigger');
            await win.click('.iset .vmenu-trigger');
            await shot(win, 'a12-surum-menusu-alt');
            // Liste panelin içinde kaymalı (panel kesilip listenin sonu kaybolmamalı)
            const list = await win.evaluate(() => { const el = document.querySelector('.vmenu-list'); return el && { scroll: el.scrollHeight, client: el.clientHeight, panel: el.closest('.vmenu-panel').getBoundingClientRect().height }; });
            console.log(`  · sürüm listesi: içerik ${list?.scroll} px, görünen ${list?.client} px, panel ${Math.round(list?.panel)} px`);
            // Açıkken sayfa kaydırılır: panel tetikleyiciyle birlikte gitmeli
            await win.evaluate(() => { document.querySelector('.page-scroll').scrollTop -= 120; });
            await shot(win, 'a12b-surum-menusu-kaydirma');
        });
        await step('profil: ayarlar aşağı', async () => {
            await toEnd();
            await shot(win, 'a13-profil-ayarlar-alt');
        });
        await step('yeni profil + sürüm menüsü', async () => {
            await go('.rail-add');
            await win.fill('.modal input', LONG ? LONG_TEXT.profile : 'Yeni profil');
            await shot(win, 'a14-yeni-profil');
            await win.click('.modal .vmenu-trigger');
            await shot(win, 'a15-yeni-profil-surum');
            // Escape yalnızca açılır listeyi kapatmalı, pencereyi değil
            await win.keyboard.press('Escape');
            await shot(win, 'a15b-yeni-profil-escape');
        });
        await step('keşfet: hedef profil', async () => {
            await go('.rail-browse');
            await win.click('.target-picker');
            await shot(win, 'a16-kesfet-hedef');
        });
        await step('keşfet: sıralama', async () => {
            await win.click('.browse .toolbar .menu > button');
            await shot(win, 'a17-kesfet-siralama');
        });
        await step('sunucular', async () => {
            await go('.rail-servers');
            await shot(win, 'a18-sunucular');
            await win.click('.server-row .btn-play');
            await shot(win, 'a19-sunucu-oyna-menu');
        });
        await step('sunucu ekle formu', async () => {
            await win.click('.servers .page-head .btn-primary');
            await shot(win, 'a20-sunucu-ekle');
        });
        await step('hesap: skin menüsü', async () => {
            await go('.rail-account');
            await center('.skin-tile');
            await win.click('.skin-tile .menu > button');
            await shot(win, 'a21-skin-menu');
        });
        await step('hesap: oyuncudan al', async () => {
            await win.click('.lib-tools .menu > button');
            await shot(win, 'a22-skin-oyuncudan');
        });
        await step('hesap: bağlantıyı kes onayı', async () => {
            await center('.hs-logout');
            await shot(win, 'a23-hesap-kartlar');
            await win.click('.hs-logout');
            await shot(win, 'a24-cikis-onayi');
        });
        await step('ayarlar: sorun bildir', async () => {
            await go('.rail-settings');
            await toEnd();
            await win.click('.settings-list button:has(.lucide-life-buoy)');
            await win.waitForSelector('.report-files', { timeout: 5000 }).catch(() => {});
            await win.fill('.report textarea', 'Oyun açılırken siyah ekranda kalıyor. '.repeat(8));
            await win.click('.report-file .link-btn').catch(() => {});
            await shot(win, 'a25-sorun-bildir');
        });
        await step('ürün: satın alma', async () => {
            await go('.rail-library');
            await win.click('.hub-tab-store').catch(() => {});
            await win.waitForSelector('.pcard:has-text("DoldurDoldur")', { timeout: 8000 });
            await win.click('.pcard:has-text("DoldurDoldur")');
            await win.waitForSelector('.pview-head', { timeout: 8000 });
            await shot(win, 'a26-urun');
            await toEnd();
            await shot(win, 'a26b-urun-alt');
            await win.click('.pview-cta .btn-primary');
            await shot(win, 'a27-satin-al');
            await win.click('.modal .btn-primary');
            await win.waitForSelector('.buy-sum', { timeout: 8000 });
            await shot(win, 'a28-satin-al-onay');
        });
        await step('kütüphane: kur + menü + kaldır', async () => {
            await go('.rail-library');
            await win.click('.hub-tab-library');
            await win.waitForSelector('.hs-item .btn-primary, .hs-item.is-installed', { timeout: 10000 });
            if (!await win.$('.hs-item.is-installed')) {
                await win.click('.hs-item .btn-primary');
                await win.waitForTimeout(300);
                await shot(win, 'a29-kuruluyor');
                await win.waitForSelector('.hs-item.is-installed .btn-play', { timeout: 30000 });
            }
            await shot(win, 'a30-kurulu');
            await win.click('.hs-item.is-installed .menu > button');
            await shot(win, 'a31-kurulu-menu');
            await win.click('.menu-panel .is-danger');
            await shot(win, 'a32-kaldir-onayi');
        });
        await step('oyun: başlatılıyor / çalışıyor', async () => {
            // Başlatma ana süreçte taklit edilir: gerçek Minecraft indirilmez, pencere gizlenmez
            await app.evaluate(({ ipcMain }) => {
                ipcMain.removeAllListeners('launch-game');
                ipcMain.removeAllListeners('hide-launcher');
                ipcMain.removeAllListeners('show-launcher');
                ipcMain.on('hide-launcher', () => {});
                ipcMain.on('show-launcher', () => {});
                ipcMain.on('launch-game', (e) => e.sender.send('launch-progress', { type: 'assets', task: 42, total: 100 }));
            });
            await go(`.rail-inst[aria-label="${profileName}"]`);
            await toTop();
            await win.click('.inst-actions .btn-play');
            await shot(win, 'a33-baslatiliyor');
            await send('launch-finished');
            await shot(win, 'a34-calisiyor');
            await go('.rail-home');
            await shot(win, 'a35-calisiyor-ana-sayfa');
        });
        await step('oyun: çöktü', async () => {
            await send('game-closed');
            await send('game-crashed', { code: -1073741819 });
            await shot(win, 'a36-coktu');
        });
        await step('hata penceresi', async () => {
            await send('launch-error', 'Java 21 bulunamadı ve indirilemedi. İnternet bağlantını kontrol et ya da Ayarlar › Java yolu alanından Java 21 kurulumunu seç.\nAyrıntı: C:\\Users\\oyuncu\\AppData\\Roaming\\.hlauncher\\runtime\\java-runtime-delta\\windows-x64\\java-runtime-delta\\bin\\javaw.exe bulunamadı');
            await shot(win, 'a37-hata');
        });
        await step('güncelleme', async () => {
            await send('updater-status', { state: 'downloading', percent: 37, version: '1.0.0-alpha.8' });
            await shot(win, 'a38-guncelleme-iniyor');
            await send('updater-status', { state: 'ready', version: '1.0.0-alpha.8', notes: 'Yeni görünüm ince ayarları.\nAçılır menüler artık kesilmiyor.\nİndirme paneli düzeltmeleri.' });
            await shot(win, 'a39-guncelleme-hazir');
        });
        await step('üst bar: güncelleme düğmesi', async () => { await shot(win, 'a40-ust-bar'); });
        // Girişliyken HardSetups bakıma girer / launcher eskir: kabuk kalır, üstte bant görünür
        await step('bakım bandı', async () => {
            mock.state.scenario = 'maintenance';
            await win.evaluate(() => globalThis.electronAPI.portalRefresh());
            await win.waitForSelector('.portal-banner', { timeout: 8000 });
            await go('.rail-home');
            await shot(win, 'a41-bakim-ana-sayfa');
            await go('.rail-library');
            await shot(win, 'a42-bakim-hardsetups');
        });
        await step('sürüm eski bandı', async () => {
            mock.state.scenario = 'outdated';
            await win.evaluate(() => globalThis.electronAPI.portalRefresh());
            await win.waitForSelector('.portal-banner .btn-secondary', { timeout: 8000 });
            await shot(win, 'a43-surum-eski-hardsetups');
            await go('.rail-home');
            await shot(win, 'a44-surum-eski-ana-sayfa');
            mock.state.scenario = 'normal';
        });
    }
})().catch((err) => { console.error('shots başarısız:', err); process.exit(1); });
