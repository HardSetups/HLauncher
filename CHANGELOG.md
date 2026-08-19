# Değişiklik Günlüğü

## 1.0.0-alpha.2 (hazırlanıyor)

- **Mod güncelleme denetimi:** Modlar sekmesinde "Güncellemeleri Denetle" — kurulu jar'lar Modrinth'e hash ile sorulur, eski sürümler tek tek veya "Tümünü Güncelle" ile yenilenir (elle eklenen modlara dokunulmaz)
- **Kurulum mesajları artık çok dilli:** Java/loader/mod indirme-kurulum ilerleme mesajları backend'den çeviri anahtarı olarak gelir; İngilizce arayüzde de İngilizce görünür
- **Haber beslemesi:** ana ekranda launcher haberleri (depodaki `news.json`, 30 dk önbellek) ve aktif sunucu profilinin duyuruları gösterilir
- **3D skin görüntüleyici:** ana ekran ve Hesap sekmesinde dönen, fareyle çevrilebilen 3D karakter modeli (skinview3d); WebGL yoksa 2D görsele düşer
- **Discord Rich Presence:** oyun açıkken Discord'da "X sunucusunda / Minecraft {sürüm}" durumu; Ayarlar → Genel'den kapatılabilir

### Düzeltmeler
- **Mod kurulumu sessizce başarısız oluyordu:** profil sürümü "En yeni" bırakıldığında "Kur" düğmesi hiçbir şey yapmıyordu. Artık "En yeni" güncel release'e çözümleniyor ve mod işlemlerindeki her hata kullanıcıya açıkça gösteriliyor
- Modrinth istekleri iletişim bilgili User-Agent ile yapılıyor (bloklanma önlemi)

## 1.0.0-alpha.1 — HLauncher (2026-08)

İlk HLauncher sürümü. HardSetups Launcher 1.0.0-beta.4 üzerine tam yeniden yapılanma.

### Yeni
- **Profil (instance) sistemi** — her profilin kendi sürümü, loader'ı, RAM'i ve mod klasörü
- **Yeni loader'lar:** Fabric'in yanına Quilt, Forge ve NeoForge (deneysel) eklendi
- **Modrinth entegrasyonu** — mod arama, bağımlılıklarıyla tek tık kurulum, kurulu mod yönetimi
- **Performans Paketi** — tek tıkla Sodium + Lithium + FerriteCore + ImmediatelyFast + EntityCulling
- **Modpack desteği** — .mrpack içe aktarma (yeni profil olarak)
- **Sunucu manifesti** — sunucu sahipleri `hlauncher.json` yayınlar, oyuncu tek tıkla hazır (docs/SERVER-MANIFEST.md)
- **Microsoft girişi** (msmc) — premium hesap; offline mod da korunuyor
- **İlk açılış sihirbazı**, TR/EN dil desteği, favori sunucular, sunucu sürüm rozeti
- **Otomatik güncelleme** altyapısı (GitHub Releases; depo ayarı bekliyor)
- JVM preset'leri (Dengeli / Düşük RAM / ZGC / Özel)

### İyileştirme
- Java artık sürüme göre **8 / 17 / 21** olarak indiriliyor (önceden her zaman 21 — eski sürümler çökebiliyordu)
- Tüm indirmelerde SHA doğrulaması + 3 deneme; ZIP işlemleri PowerShell yerine saf JS
- Ayarlar tarayıcı localStorage'ından `%APPDATA%\.hlauncher\config.json`'a taşındı (otomatik migrasyon)
- Kalıcı log dosyası (`logs/hlauncher.log`) ve hata penceresinden log klasörüne erişim
- Tek instance kilidi; RAM üst sınırı sistem belleğine göre; 1.20 öncesi sürümlerde sunucuya bağlanma düzeltildi
- Hata mesajları sınıflandırılıp kullanıcı diline çevrildi
- Veri klasörü `.hlauncher` (eski `.hardsetups`/`.thehardcraft` otomatik taşınır)
