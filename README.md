# HLauncher (HardSetups Launcher)

Oyuncu dostu ve sunucu dostu bir Minecraft launcher'ı. Electron + React + Vite ile geliştirilir; oyun başlatma çekirdeği `minecraft-launcher-core` üzerine kuruludur.

> Proje şu an "HardSetups Launcher" markasıyla çalışıyor ve **HLauncher** olarak yeniden markalanma sürecinde. Tam plan için [ROADMAP.md](ROADMAP.md).

## Özellikler (mevcut)

- Release / OptiFine / Fabric başlatma — OptiFine ve Fabric otomatik indirilip kurulur
- Mojang sürüm listesinden sürüm seçimi (son 3 yılın release'leri, 12 saat önbellek)
- Sunucu listesi: ekle/kaldır, canlı durum (oyuncu sayısı, MOTD, ikon — mcstatus.io)
- Tek tıkla sunucuya bağlanarak başlatma (Quick Play)
- Java otomatik tespiti; yoksa Adoptium'dan Java 21 JRE otomatik indirme
- RAM ayarı, tam ekran, özel Java yolu, tema rengi ve arka plan seçimi
- Oyun açıkken launcher gizlenir, kapanınca geri gelir

## Geliştirme

```bash
npm install
npm run dev        # Vite + Electron birlikte
npm run lint       # ESLint
npm run dist       # Windows NSIS kurulum paketi (release/)
npm run dist:dir   # Paketleme (kurulumsuz, hızlı test)
```

Önemli: geliştirme makinesinde `ELECTRON_RUN_AS_NODE=1` sistem değişkeni tanımlı olduğundan Electron her zaman `launch-electron.js` sarmalayıcısı üzerinden başlatılır. Ayrıntılar ve diğer kritik notlar için [CLAUDE.md](CLAUDE.md).

## Veri konumu

Oyun dosyaları ve launcher verisi: `%APPDATA%\.hardsetups` (eski `.thehardcraft` klasörü ilk açılışta otomatik taşınır).
