# HLauncher Yol Haritası

Hedef: **HLauncher** — oyuncu dostu (kolay kurulum, tek tık mod/performans), sunucu dostu (sunucuya özel mod seti dağıtımı, tek tık bağlanma) bir Minecraft launcher'ı olarak piyasaya sürmek.

**Durum (18 Ağustos 2026): Faz 0-4 tamamlandı, Faz 5 büyük ölçüde tamamlandı.** Kod tarafı 1.0.0-alpha.1 olarak hazır; kalan işler aşağıdaki "Yayın öncesi yapılacaklar" listesinde.

---

## Tamamlananlar

### Faz 0 — Altyapı ✅
- Git deposu, ölü kod temizliği, güncel dokümantasyon
- `electron/lib/` modüler mimari; birim testler (`npm test`, 39 test)
- Sağlam indirme: SHA1/SHA256 doğrulama, 3 deneme, geçici dosya + atomik taşıma
- ZIP işlemleri saf JS (adm-zip) — PowerShell bağımlılığı kalktı
- **Java matrisi:** sürüme göre 8/17/21 otomatik kurulum (Adoptium, SHA-256 doğrulamalı)
- Kalıcı log (`electron-log` → `logs/hlauncher.log`), hata penceresinden log erişimi
- Ayarlar `config.json`'da (atomik yazım); localStorage'dan otomatik migrasyon
- Tek instance kilidi; RAM sınırı sistem belleğine göre; hata mesajları kullanıcı dilinde
- Dev akışı: `wait-on` ile Vite hazır olmadan Electron açılmıyor

### Faz 1 — Rebrand ✅
- `hlauncher` 1.0.0-alpha.1, appId `com.hlauncher.app`, NSIS "HLauncher"
- Veri klasörü `%APPDATA%\.hlauncher` (eski `.hardsetups`/`.thehardcraft` otomatik taşınır)
- UI marka/başlık güncellendi (logo dosyası aynı — yeni logo tasarımı yayın öncesi listede)

### Faz 2 — Hesap ve Dağıtım ✅ (2 dış bağımlılık hariç)
- **Microsoft girişi** (msmc): premium profil, token yenileme; offline mod korunuyor
- Otomatik güncelleme: electron-updater + GitHub Releases altyapısı hazır
- CHANGELOG.md sürüm notları

### Faz 3 — Mod Sistemi ✅
- **Profil (instance) sistemi**: her profilin kendi mods/config dizini (`instances/<id>`); 'default' profili geriye dönük uyumlu olarak kök dizinde
- Loader'lar: Fabric, Quilt, Forge, NeoForge (deneysel, MCLC installer yolu), OptiFine (BMCL + resmi jar ile manuel fallback)
- **Modrinth**: arama, sürüm/loader uyumluluğu, zorunlu bağımlılıklarla kurulum, kurulu mod listesi/silme
- **.mrpack içe aktarma** → yeni profil (hash doğrulamalı, overrides dahil)
- **Sunucu manifesti** (`hlauncher.json`): tek tıkla sunucuya özel kurulum + mod eşitleme — docs/SERVER-MANIFEST.md

### Faz 4 — Optimizasyon ✅
- Performans Paketi: Sodium + Lithium + FerriteCore + ImmediatelyFast + EntityCulling (tek tık)
- JVM preset'leri: Dengeli / Düşük RAM / ZGC (Java 17+ korumalı) / Özel argümanlar
- RAM önerisi (onboarding + ayarlar), MCLC paralel indirme (maxSockets 8), başlatma süresi logda

### Faz 5 — Deneyim ✅ (kısmen)
- İlk açılış sihirbazı (dil → hesap → RAM)
- i18n: TR + EN (tam sözlük, anahtar tutarlılığı test ediliyor)
- Favori sunucular, sunucu sürüm rozeti, sunucu duyuruları (manifest üzerinden)
- Discord Rich Presence modülü hazır (client ID bekliyor, o gelene dek kapalı)

---

## Yayın Öncesi Yapılacaklar (dış bağımlılıklar / kararlar)

1. ~~GitHub publish ayarı~~ ✅ `HardSetups/HLauncher` — depo **public** (18 Ağu 2026), CI her `v*` tag'inde taslak release + kurulum paketi üretiyor. **Oyunculara güncelleme gitmesi için taslak release'i Publish etmek gerekir** (taslaklar `releases/latest`'te görünmez). Not: public depoda LICENSE dosyası yok — varsayılan "tüm hakları saklıdır"; açık kaynak lisansı istenirse karar verilmeli.
2. ~~Yeni logo/ikon~~ ✅ `public/logo.ico` (7 boyut, 16-256px) üretildi ve build'e bağlandı. (İleride farklı bir logo tasarımı istenirse aynı yolla .ico yenilenir.)
3. **Discord uygulaması** oluştur (discord.com/developers) → client ID'yi `electron/lib/discord.cjs` içindeki `DISCORD_CLIENT_ID` sabitine yaz.
4. **Gerçek makine QA'sı**: `npm run dist:dir` çıktısını temiz bir Windows'ta dene — özellikle Microsoft girişi, OptiFine/Fabric/Forge kurulumları ve eski `.hardsetups` verisinden migrasyon.
5. (Opsiyonel) Kod imzalama sertifikası — SmartScreen uyarısını azaltır.
6. (Opsiyonel) Projeyi OneDrive dışına taşı (`C:\Dev\HLauncher`) — senkron yükü ve kilitlenme riski.

## Sonraki Sürümler (backlog)

- ~~Kurulu modların güncelleme denetimi~~ ✅ alpha.2'de (Modrinth hash eşleme, tekli/tümünü güncelle)
- ~~GitHub Actions CI~~ ✅ (.github/workflows/ci.yml — lint+test+build; v* tag'inde taslak release)
- ~~Backend ilerleme mesajlarının i18n'i~~ ✅ alpha.2'de (key+params ile; hata metinleri hâlâ TR — TR-öncelikli ürün için bilinçli)
- CurseForge entegrasyonu (API anahtarı gerekir)
- ~~Haber beslemesi~~ ✅ alpha.2'de (repo kökündeki `news.json` → ana ekran; sunucu duyuruları profilde saklanıp gösteriliyor)
- ~~Skin görüntüleyici (3D)~~ ✅ alpha.2'de (skinview3d; Microsoft hesabında UUID→Crafatar, offline'da Minotar; WebGL yedekli)
- Crash raporu toplama (opt-in, backend gerekir)
- Kademeli TypeScript

## Bilinen Sınırlamalar

- NeoForge deneyseldir: MCLC'nin forge işleyicisi üzerinden kuruluyor; bazı sürümlerde sorun çıkarsa Fabric/Forge önerilir.
- OptiFine tek otomatik kaynağı BMCL mirror'ıdır; erişilemezse launcher resmi jar ile manuel kurulum yolu sunar.
- Quilt profilleri Fabric modlarını da kabul eder (Modrinth aramasında ikisi birlikte sorgulanır) — nadir uyumsuzluklar olabilir.
