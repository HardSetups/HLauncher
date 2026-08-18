# HLauncher

Oyuncu dostu ve sunucu dostu Minecraft launcher'ı. Electron + React + Vite; oyun başlatma çekirdeği `minecraft-launcher-core`.

## Özellikler

- **Profiller:** her profilin kendi sürümü, loader'ı, RAM'i ve mod klasörü
- **Loader'lar:** Release, OptiFine, Fabric, Quilt, Forge, NeoForge (deneysel) — hepsi otomatik kurulur
- **Tek tık mod kurulumu:** Modrinth araması, bağımlılıklar dahil; `.mrpack` modpack içe aktarma
- **Performans Paketi:** Sodium + Lithium + FerriteCore + ImmediatelyFast + EntityCulling tek tıkla
- **Sunucu dostu:** sunucu sahibi `hlauncher.json` yayınlar, oyuncu tek tıkla doğru sürüm + mod setiyle hazır — bkz. [docs/SERVER-MANIFEST.md](docs/SERVER-MANIFEST.md)
- **Hesap:** Microsoft girişi (premium) veya çevrimdışı kullanıcı adı
- Java otomatik yönetimi (sürüme göre 8/17/21, SHA doğrulamalı indirme)
- Canlı sunucu durumu, favoriler, sunucu duyuruları; TR/EN arayüz; ilk açılış sihirbazı
- JVM preset'leri, sistem belleğine göre RAM önerisi, otomatik güncelleme altyapısı

## Geliştirme

```bash
npm install
npm run dev        # Vite + Electron
npm test           # birim testler
npm run lint       # ESLint
npm run dist       # Windows NSIS kurulum paketi (release/)
```

Geliştirme makinesi notu: `ELECTRON_RUN_AS_NODE=1` sistem değişkeni tanımlı olduğundan Electron her zaman `launch-electron.js` üzerinden başlatılır. Mimari ayrıntıları için [CLAUDE.md](CLAUDE.md), yol haritası ve yayın öncesi kontrol listesi için [ROADMAP.md](ROADMAP.md).

## Veri konumu

`%APPDATA%\.hlauncher` — eski `.hardsetups` / `.thehardcraft` klasörleri ilk açılışta otomatik taşınır. Ayarlar `config.json`, profiller `instances.json`, loglar `logs/hlauncher.log`.
