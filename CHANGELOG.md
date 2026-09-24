# Değişiklik Günlüğü

## 1.0.0-alpha.7 — yayımlanmadı

### HardSetups hesabı
- Hesap sayfasında **HardSetups hesabını bağla**: giriş tarayıcıda yapılır, launcher parola görmez. Ekranda büyük bir bağlantı kodu çıkar; tarayıcı açılmazsa adres kopyalanabilir
- Bağlıyken kullanıcı adı ve bakiye görünür; "Hesabım", "Bağlı cihazlar" ve "Bağlantıyı kes"
- Oturum anahtarı Windows'un şifreli deposunda tutulur; siteden cihaz kaldırılırsa launcher bir sonraki istekte bunu fark eder ve söyler
- HardSetups bakımdayken üstte bir bant görünür, kurulu oyunlar oynanabilir kalır

### HardSetups mağazası
- Sol raydaki **HardSetups** sayfası: öne çıkanlar, kampanyalar, duyurular ve haberler
- **Ürün sayfası:** görseller, planlar, indirimli fiyat, gereksinimler (Minecraft sürümü, önerilen RAM)
- **Bakiyeyle satın alma:** launcher kart bilgisi istemez. Satın almadan önce tutar, bakiye ve onaylanacak belgeler gösterilir; bakiye yetmezse eksik tutar ve bakiye yükleme bağlantısı çıkar. Aynı düğmeye iki kez basmak iki kez satın almaz
- **Bildirimler:** üstteki zil; okunmamış sayısı, "tümünü okundu yap", eski bildirimler için "daha fazla"
- Ana sayfada küçük bir **"HardSetups'ta yeni"** kartı; launcher haberleri HardSetups panelinden gelir

### Kütüphane
- Satın aldığın ürünler tek listede: **Kur**, **Güncelle**, **Onar** ve **Kaldır**
- Kurulum yalnızca eksik ya da değişmiş dosyaları indirir, yarıda kalan indirmeye kaldığı yerden devam eder; her dosya doğrulanır
- **Lisans anahtarıyla kurulum:** hesap bağlamadan da anahtar girerek kurabilirsin
- Kurulan ürün kendi profilinde açılır; sürümü ve loader'ı ürünle kilitlidir. Kaldırırken dünyaların `yedekler` klasörüne alınır
- İnternet yokken lisanslı ürünler bir süre (varsayılan 72 saat) oynanabilir
- Ürünler çevrimdışı (kullanıcı adıyla) hesapla da açılır

### Yardım ve bilgi
- **Sorun bildir** (Ayarlar'da ve oyun çökünce): hangi dosyaların gideceğini önceden görürsün; token, anahtar ve bilgisayar yolları gönderilmeden temizlenir; onay kutusu işaretlenmeden hiçbir şey gönderilmez
- Güncellemeden sonra ilk açılışta **"Bu sürümde neler var"** penceresi
- Hakkında bölümünde derlemenin imza durumu ve "Mojang veya Microsoft ile bağlantılı değildir" ibaresi
- Discord durumunda oynadığın HardSetups ürününün adı görünür
- Ayarlar'da **"Kapatınca tepsiye küçült"** (varsayılan kapalı)

### Güvenlik
- Electron 44'e geçildi (39 artık güvenlik güncellemesi almıyordu)
- Chromium sandbox yeniden açık; yalnızca açılışta çöken makinelerde kendiliğinden kapanır
- Paket sertleştirildi: ASAR bütünlük denetimi, yalnızca ASAR'dan yükleme, NODE_OPTIONS ve hata ayıklayıcı bayrakları kapalı, çerez şifreleme
- Tarayıcıda yalnızca izinli adresler açılır; kamera/mikrofon/bildirim gibi tarayıcı izinleri kapalı
- Microsoft oturumu, şifreli depolama yoksa diske yazılmaz
- Ürün görselleri yalnızca izinli adreslerden, boyut ve tür denetiminden geçerek yüklenir; indirmeler yalnızca izinli sunuculardan yapılır

## 1.0.0-alpha.6 — 2026-09-24

### Güvenlik düzeltmesi
- **Oyun oturum anahtarı log dosyasına yazılıyordu:** oyun her açıldığında Minecraft erişim token'ı (`--accessToken`) `logs\hlauncher.log` dosyasına düz metin olarak giriyordu. Artık her log satırı yazılmadan önce süzülüyor; token, lisans anahtarı ve cihaz kodu `[gizli]` olarak görünüyor
- Önceki sürümlerin yazdığı log dosyaları ilk açılışta bir kez temizleniyor
- Bu token'lar en geç 24 saatte kendiliğinden geçersiz olur. Son 24 saat içinde log dosyanı bir yerde paylaştıysan o paylaşımı sil

### Güncelleme kaynağı
- Otomatik güncellemeler ve launcher haberleri artık **HardSetups/HLauncher-releases** reposundan geliyor (yalnızca derlenmiş sürümler). Oyuncu tarafında yapılacak bir şey yok

## 1.0.0-alpha.5 — 2026-09-23

### Profil merkezli yeni arayüz
- Tek bir "Oyna" yok: profil seçilir, profil sayfasından oynanır. Sol rayda profiller (son oynanan üstte), ana sayfada **Kaldığın yerden devam** + **Kütüphane**
- Profil sayfası: **Modlar / Kaynak paketleri / Shaderlar / Ayarlar** sekmeleri
- Her içerik için **aç/kapat** (dosya `.disabled` olur), **sil** (onaylı), **güncelle** / **tümünü güncelle**, arama ve Açık/Kapalı filtresi; Modrinth'teki dosyalar ad, ikon ve sürümle görünür
- **Keşfet:** Modrinth'te mod, kaynak paketi, shader ve modpack ara; hedef profil seç, tek tıkla kur, kurulu olanlar işaretli. Modpack kurulumu yeni profil oluşturur
- Sunucular sayfası: canlı durum, **hangi profille oynanacağını** seçme, sunucu paketi kurulumu
- Profil ayarları: ad, sürüm/loader, bellek, **otomatik bağlanılacak sunucu**, klasör, silme
- Profiller için Minecraft tarzı **piksel ikonlar** (profil kimliğinden türetilir)
- Tasarım baştan: nötr grafit palet, tek vurgu rengi, sade tipografi, satır düzeninde ayarlar

### Hesap ve skinler
- Hesap sayfası baştan: büyük 3D önizleme (bekle/yürü/koş/el salla/eğil animasyonları), hesap kartı, UUID kopyalama
- **Skin kütüphanesi:** PNG dosyasından ya da oyuncu adından skin ekle, 3D önizle, klasik/ince kol seç, yeniden adlandır, sil
- **Skin değiştirme** (Microsoft hesabı): kütüphaneden tek tıkla uygula, varsayılan skine dön, **pelerin seç/gizle**
- Çevrimdışı hesaplarda kütüphane çalışır; skinin oyunda görünmediği açıkça belirtilir

### İndirmeler
- Sağ altta **indirme paneli**: mod/paket/shader/modpack kurulumu, performans paketi, sunucu paketi ve oyun hazırlığı yüzde ilerlemeyle görünür
- Kurulumlar sayfadan çıkınca **kaybolmuyor**, arka planda sürüp sonucu panelde gösteriyor
- Kurulum sırasında sayfanın aşağı yukarı zıplaması giderildi (üst bant kalktı, düğmeler sabit genişlikte, yeniden aramada liste yerinde kalıyor)

### Profil ayarları
- Kart bölümler; loader'lar açıklamalı kartlarla, sürüm için "her zaman en yeni" seçeneği
- **RAM:** "genel ayar / bu profile özel" seçimi, işaretli kaydırıcı, +/− düğmeleri, önerilen değer çizgisi, sistem belleğine göre uyarı
- Otomatik bağlanma: kayıtlı sunuculardan seç ya da adres yaz

### Otomatik güncelleme
- Launcher açık kaldığı sürece **3 saatte bir** GitHub Releases'ı denetler (önceden yalnızca açılışta)
- Yeni sürüm arka planda iner, ilerlemesi indirme panelinde görünür
- İnince **sürüm notlarıyla** bir pencere açılır: "Şimdi yeniden başlat" ya da "Sonra" (launcher kapanırken sessizce kurulur); üst barda "Güncelleme hazır" düğmesi kalır
- Oyun açıkken yeniden başlatma engellenir; Ayarlar'daki "Otomatik güncelleme" anahtarı artık yeniden başlatmadan etkili

### Arayüz
- Menüler, sürüm seçici, formlar, silinen satırlar ve sekme alt çizgisi artık animasyonlu

### Düzeltmeler
- **Microsoft girişi paketlenmiş sürümde çalışmıyordu:** giriş kütüphanesi (msmc) kurulum paketine girmiyordu
- Mod aç/kapat animasyonu satır yeniden oluştuğu için görünmüyordu
- IPC dinleyicileri artık birikmiyor; boş/kırık durumlarda kullanıcıya hata gösteriliyor
- Türkçe büyük harf (İ/ı), yarım kalan çeviriler, 980×640'ta taşan/kesilen alanlar
- Renderer'dan gelen profil güncellemeleri beyaz listeden geçiyor

## 1.0.0-alpha.4 — 2026-08-18

### Güvenlik sertleştirmesi
- Dış linkler artık uygulama içinde değil **sistem tarayıcısında** açılıyor; pencere açma ve uygulama dışına gezinme engellendi
- Paketli sürüme sıkı **Content-Security-Policy** eklendi
- **Microsoft oturum token'ı** artık Windows DPAPI (safeStorage) ile şifreli saklanıyor (eski kayıtlar ilk kullanımda şifreliye taşınır)
- ZIP çıkarmada **zip-slip** (yol kaçışı) koruması — testle doğrulandı (adm-zip'in okuma tarafı korumasız çıktı)
- https→http yönlendirme düşürmesi engellendi; ayar/sunucu verileri IPC'de şema süzgecinden geçiyor

### Yeni
- **Çökme algılama:** oyun sıfır dışı kodla kapanırsa neden-öneri içeren uyarı (kullanıcı kapatınca gösterilmez)
- Ayarlar → Genel: **Ekran görüntüleri** kısayolu ve **Önbelleği temizle** (boşaltılan alanı gösterir)
- Profil kartlarında **klasörü aç** düğmesi
- Kurulum sihirbazına **tema rengi seçimi** eklendi

## 1.0.0-alpha.3 — 2026-08-18

- **Yeni görünüm:** HLauncher kimliği — Chakra Petch başlık fontu, keskin köşeli koyu paneller, blok hissi veren Oyna düğmesi, seçili kartlarda vurgu çizgisi; tüm emoji ikonlar gerçek (vektör) ikonlarla değişti
- **Pencere modu:** başlık çubuğuna büyüt/küçült düğmesi; pencere boyutu ve konumu artık hatırlanıyor
- **Ayarlar → Genel'e launcher güncelleme kartı:** mevcut sürüm + "Güncellemeleri Denetle" düğmesi + canlı durum (denetleniyor / indiriliyor %x / hazır) ve "Yeniden Başlat ve Güncelle" düğmesi
- Hareket azaltma (prefers-reduced-motion) tercihi destekleniyor

## 1.0.0-alpha.2 — 2026-08-18

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
