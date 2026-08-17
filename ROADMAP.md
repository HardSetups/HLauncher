# HLauncher Yol Haritası

Hedef: **HLauncher** — oyuncu dostu (kolay kurulum, tek tık mod/performans), sunucu dostu (sunucuya özel mod seti dağıtımı, tek tık bağlanma) bir Minecraft launcher'ı olarak piyasaya sürmek.

Bu dosya projenin ana planıdır; her faz bittiğinde işaretlenir ve gerekirse güncellenir.

---

## Mevcut Durum Analizi (17 Ağustos 2026)

### Nasıl çalışıyor?

- **Süreç mimarisi:** Vite/React renderer (`src/`, ESM) + Electron main süreci (`electron/`, CommonJS). Aralarında `preload.cjs` context bridge ile güvenli IPC (`contextIsolation: true`, `nodeIntegration: false` — doğru kurulum).
- **Başlatma akışı:** UI `launchGame` IPC'si → `launcher.cjs`:
  1. Loader'a göre (release/optifine/fabric) kurulu sürüm aranır; yoksa **otomatik kurulur** (OptiFine: BMCL API'den jar + launchwrapper çıkarma + `inheritsFrom`'lu version.json; Fabric: Fabric Meta'dan hazır profil).
  2. Java tespiti: bundled runtime → Mojang runtime → yaygın vendor klasörleri → sistem `java`; hiçbiri yoksa Adoptium'dan Java 21 JRE indirilir.
  3. MCLC (`minecraft-launcher-core`) oyunu başlatır; sunucu adresi girildiyse Quick Play ile otomatik bağlanır; launcher gizlenir, oyun kapanınca geri gelir.
- **Sürüm listesi:** Mojang manifest'inden son 3 yılın release'leri, 12 saat disk önbelleği.
- **Sunucu listesi:** localStorage'da; her sunucu 30 sn'de bir mcstatus.io'dan durum çeker.
- **Veri:** `%APPDATA%\.hardsetups`; ayarlar renderer localStorage'ında (`thc_*`).

### Sağlam olan yanlar (koru)

- IPC güvenlik modeli doğru (context bridge, izolasyon).
- OptiFine/Fabric otomatik kurulum yaklaşımı ve MCLC `version.custom` kullanımı temiz.
- Paketli sürüm tuzaklarına karşı alınmış önlemler (`runAsNode` fuse, ELECTRON_RUN_AS_NODE koruması, `no-sandbox`, opak pencere) — bunlara dokunma (CLAUDE.md).

### Tespit edilen sorunlar / eksikler

| # | Sorun | Etki | Çözüm fazı |
|---|-------|------|-----------|
| 1 | Java indirme **her zaman Java 21** (`downloadJava`) — MC ≤1.16 Java 8 ister | Eski sürümler temiz makinede çökebilir | Faz 0 |
| 2 | İndirilen dosyalarda **SHA doğrulaması ve retry yok** | Bozuk indirme = anlaşılmaz hatalar | Faz 0 |
| 3 | ZIP çıkarma PowerShell'e bağımlı (`Expand-Archive`, ExecutionPolicy bypass) | AV/kurumsal makinelerde kırılgan | Faz 0 |
| 4 | Ayarlar renderer `localStorage`'ında | Kurulum kaldır/yükle ile kayıp; main süreç erişemiyor | Faz 0 |
| 5 | `app.requestSingleInstanceLock` yok | Çift launcher açılabilir | Faz 0 |
| 6 | Dev'de Electron, Vite hazır olmadan açılabiliyor (yarış) | Beyaz ekran, F5 gerek | Faz 0 |
| 7 | Kalıcı log dosyası yok (sadece console) | Kullanıcı hatalarını teşhis edilemez | Faz 0 |
| 8 | RAM slider'ı sabit 1–16 GB; sistem RAM'ine bakmıyor | 8 GB makinede 16 G seçilebilir → çökme | Faz 0 |
| 9 | Sadece offline auth (`Authenticator.getAuth`); `msmc` ekli ama kullanılmıyor | Premium hesap/online-mode sunucu desteği yok | Faz 2 |
| 10 | Otomatik güncelleme yok | Yayın sonrası sürüm dağıtımı elle | Faz 2 |
| 11 | OptiFine tek kaynağı BMCL (üçüncü parti Çin mirror'ı) | Erişilemezse OptiFine kurulamaz | Faz 3 (fallback) |
| 12 | Kod imzası yok (`CSC_IDENTITY_AUTO_DISCOVERY=false`) | SmartScreen uyarısı, güven sorunu | Faz 5 |
| 13 | Tek instance/profil: tüm sürümler aynı `mods` klasörünü paylaşır | Mod sistemi için engel | Faz 3 (instance) |
| 14 | Proje OneDrive senkron klasöründe | `node_modules`/`release` senkronu yavaşlatır, kilitlenme riski | Öneri (aşağıda) |

Temizlenenler (bugün): ölü `electron/main.js` + `launcher.js` (eski, `transparent: true`'lu sürüm), Vite şablon artıkları (`App.css`, `react.svg`, `vite.svg`), git deposu kuruldu, `.gitignore`'a `release/` eklendi.

---

## Faz 0 — Altyapı Sağlamlaştırma ✅ kısmen (aktif faz)

Amaç: Her şeyden önce çekirdeği güvenilir yapmak. Yeni özellik yok.

- [x] Git deposu + baseline commit + `.gitignore` düzeni
- [x] Ölü kod/şablon temizliği
- [x] CLAUDE.md / README güncellemesi
- [ ] **Dev akışı:** `wait-on http://localhost:5173` sonrası Electron başlat (beyaz ekran yarışı biter)
- [ ] **Loglama:** `electron-log` — main + launcher logları `%APPDATA%\.hlauncher\logs\` altına, hata mesajlarında "logu kopyala" butonu
- [ ] **Ayar deposu:** `electron-store` (main tarafı, `config.json`) + IPC ile get/set; localStorage'dan otomatik migrasyon
- [ ] **Tek instance kilidi** + ikinci açılışta mevcut pencereye odaklan
- [ ] **İndirme sağlamlığı:** SHA1/SHA256 doğrulama (Mojang/Adoptium/Fabric hash veriyor), başarısızlıkta 3 deneme, yarım dosyaların temizliği
- [ ] **ZIP:** PowerShell yerine saf JS (`yauzl` veya `adm-zip`)
- [ ] **Java matrisi:** gereken sürüme göre indirme (8 / 17 / 21, Adoptium API zaten parametrik) — sabit 21 bug'ı kapanır
- [ ] **RAM üst sınırı:** `os.totalmem()` IPC ile UI'a; öneri = toplamın yarısı, üst sınır = toplam − 2 GB
- [ ] Hata mesajlarının sınıflandırılması (ağ / disk / Java / sürüm) ve kullanıcı diliyle gösterimi

**Çıktı:** "Her makinede açılır, her başlatma ya çalışır ya da anlaşılır hata verir" durumu.

## Faz 1 — HLauncher Rebrand

- [ ] `package.json`: name `hlauncher`, productName **HLauncher**, appId `com.hlauncher.app`, artifactName `HLauncher-Kurulum-${version}.exe`, sürüm `1.0.0-alpha.1`
- [ ] Yeni logo + gerçek `.ico` (256px çok boyutlu; PNG'den üretim), pencere/başlık/NSIS kısayol adları
- [ ] Veri klasörü `%APPDATA%\.hlauncher` + `.hardsetups`/`.thehardcraft`'tan otomatik migrasyon (mevcut migrasyon deseni genişletilir)
- [ ] localStorage anahtarları `thc_*` → `hl_*` (migrasyonlu)
- [ ] UI metin/marka taraması (HARDSETUPS başlığı, Discord linki parametrik)

## Faz 2 — Hesap ve Dağıtım (oyuncu güveni)

- [ ] **Microsoft girişi** (`msmc` → dependencies): premium hesap, gerçek skin, online-mode sunucular; offline (kullanıcı adı) modu seçenek olarak kalır
- [ ] Çoklu hesap yönetimi + token yenileme
- [ ] **Otomatik güncelleme:** `electron-updater` + GitHub Releases (alpha/beta/stable kanalları)
- [ ] Sürüm notları ekranı ("neler yeni")
- [ ] (Opsiyonel, maliyetli) Kod imzalama sertifikası → SmartScreen itibarı; yoksa yayında "bilinmeyen yayıncı" SSS'i

## Faz 3 — Mod Sistemi (kolay mod kurulumu) — HLauncher'ın kalbi

- [ ] **Instance/profil sistemi:** her profil = ad + MC sürümü + loader + RAM + kendi `mods/`, `config/`, `resourcepacks/` dizini (`<root>/instances/<id>/`); MCLC `overrides.gameDirectory` ile izolasyon
- [ ] **Loader'lar:** Fabric ✅ → **NeoForge**, **Forge**, **Quilt** otomatik kurulum
- [ ] **Modrinth entegrasyonu** (API anahtarsız, launcher dostu): mod arama, sürüm/loader uyumluluk çözümü, bağımlılıklarla tek tık kurulum, güncelleme denetimi
- [ ] **Modpack:** `.mrpack` içe aktarma; popüler pack'lerin listesi
- [ ] CurseForge (API key gerekir) — ikinci aşama
- [ ] OptiFine fallback: BMCL erişilemezse kullanıcıya resmi siteden jar seçtirme + "Fabric+Sodium'a geç" önerisi

### Sunucu dostu katman (fark yaratan özellik)

- [ ] **Sunucu manifesti:** sunucu sahibi bir URL'de `hlauncher.json` yayınlar → `{ mcVersion, loader, mods[] (Modrinth id/sürüm veya doğrudan URL+sha), önerilenRam, adres, duyurular }`
- [ ] Launcher'a sunucu eklenince manifest algılanır → "Bu sunucu için hazırla" tek tığıyla doğru sürüm + loader + mod seti kurulur, uyumlu profille bağlanılır
- [ ] Mod seti değişince otomatik senkron (sunucu güncelleyince oyuncular otomatik alır)
- [ ] Sunucu sahipleri için mini dokümantasyon + manifest doğrulayıcı

## Faz 4 — Optimizasyon Özellikleri

- [ ] **"Performans Modu" preset'i:** tek tık → Fabric + Sodium + Lithium + FerriteCore + (ImmediatelyFast, EntityCulling) kurulumu (Modrinth üzerinden, sürüme uygun)
- [ ] **JVM preset'leri:** dengeli / düşük RAM / yüksek FPS — modern G1/ZGC bayrakları; gelişmiş kullanıcı için özel argüman alanı
- [ ] Otomatik RAM önerisi (Faz 0'daki totalmem verisiyle profil bazında)
- [ ] Paralel indirme (MCLC ayarı + kendi indiricimizde eş zamanlılık)
- [ ] Başlatma süresi ölçümü ve "ilk kurulum" ile "tekrar açılış" ayrımında önbellek kontrolü

## Faz 5 — Oyuncu Deneyimi ve Yayın

- [ ] İlk açılış sihirbazı (hesap → sunucu/mod tercihi → hazır)
- [ ] i18n: TR + EN (UI metinleri sözlük dosyasına)
- [ ] Discord Rich Presence ("X sunucusunda oynuyor")
- [ ] Haber/duyuru beslemesi (launcher ana ekranında; sunucu manifestindeki duyurularla birleşik)
- [ ] Sunucu kartlarında ping + sürüm rozeti; favoriler
- [ ] Beta programı (Discord üzerinden), crash raporlarının opt-in toplanması
- [ ] Web sitesi + indirme sayfası; GitHub Releases dağıtımı
- [ ] Yayın kontrol listesi: temiz VM'de kurulum testi, AV taraması, SmartScreen davranışı, güncelleme zinciri testi (alpha→beta)

---

## Teknik Borç / İleriye Dönük

- `electron/` tarafına birim test (`vitest`): `getRequiredJava`, sürüm/URL ayrıştırma gibi saf fonksiyonlar
- GitHub Actions CI: lint + build + (tag'de) dist artefaktı
- Kademeli TypeScript (önce `electron/`, sonra `src/`)
- İnline stiller büyüdükçe tasarım token'ları/CSS modüllerine geçiş (acele değil)

## Öneriler (karar senin)

1. **Projeyi OneDrive dışına taşı** (örn. `C:\Dev\HLauncher`): `node_modules` ve `release` senkronu diski/CPU'yu yoruyor, dosya kilitleme kaynaklı tuhaf build hataları üretebiliyor. Git artık kurulu olduğu için taşınma güvenli.
2. GitHub'da özel repo aç → yedek + Releases altyapısı (Faz 2'nin ön koşulu).
3. Offline mod, online-mode=false sunucular için kalabilir; ama yayında Microsoft girişini varsayılan yapmak hem güven hem skin/premium uyumu açısından doğru.

## Sıradaki Somut Adımlar

1. Faz 0'ın kalan maddeleri (wait-on, electron-log, electron-store, single instance, SHA+retry, yauzl, Java matrisi, RAM sınırı) — tek tek küçük commit'ler
2. Faz 1 rebrand (isim/ikon/veri klasörü migrasyonu)
3. Faz 3'e hazırlık: instance sistemi tasarımı (dizin şeması + config şeması)
