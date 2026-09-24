# 05 · Kabul kontrol listesi

Her yeni ya da değişen ekran, HUD öğesi, toast ve sohbet mesajı bu listeden geçer. Bir madde geçmiyorsa iş bitmemiştir. Listeyi PR açıklamasına kopyalayıp işaretle.

## Test düzeni

- **Pencere boyutları:** 854×480 (vanilya varsayılanı), 1280×720, 1920×1080, 2560×1440.
- **GUI ölçeği:** 1, 2, 3, 4 ve Otomatik. Ölçekli alan en az 320×240 olacak şekilde; her ekran 320×240'ta tam görünmeli.
- **Türkçe sınama dizesi:** `Ğİ ğış öç ÜŞ Iı — Çalışıyor, İyi, Işık` (dil dosyasına geçici anahtar olarak koy).
- **Arka planlar:** ana menü (panorama), dünyada gündüz karda, gece mağarada, suyun altında.
- **Kaynak yeniden yükleme:** F3+T sonrası ekran ve HUD doğru renkte.

## Görünüm

- [ ] GUI ölçeği 1, 2, 3, 4 ve Otomatik'te taşma, kesilme, üst üste binme yok.
- [ ] 320×240 ölçekli alanda panel ekrana sığıyor; düğmeler tıklanabilir.
- [ ] Pencere boyutu değişince yerleşim yeniden hesaplanıyor (`init()`); kurucuda konum yok.
- [ ] Unicode yazı tipi **kapalı** ve **açık** (Dil › Yazı tipi ayarları) iki durumda da metin sığıyor. Genişlik sabit yazılmamış, `getWidth` ile ölçülmüş.
- [ ] Türkçe sınama dizesi doğru: `İ Ğ Ö Ü` üst işaretleri ve `Ç Ş` kuyrukları kesilmiyor (metnin üstünde ≥ 3 px, altında ≥ 2 px boşluk).
- [ ] Uzun Türkçe metin (İngilizceden ~%30 uzun) sığıyor ya da düzgün kayıyor/kırılıyor.
- [ ] Renkler yalnızca rolden: kodda `0xFF…` sabiti yok (`HsTheme.kiremit()` dışında).
- [ ] Metin doğrudan dünya ya da panorama üstünde değil; opak panel içinde ya da vanilyanın gölgeli çizimiyle.
- [ ] Kontrast: metin 4,5:1 ve üstü ([01 › Kontrast](01-kimlik.md#kontrast)). `textTertiary` ve `danger` metni yalnızca `surface` ya da daha koyu zeminde.
- [ ] Bir ekranda tek birincil (kiremit) düğme. `highlight` (kor) en fazla bir kez.
- [ ] Dört köşe pahlı (1 texel), kenarlar 1 px, yuvarlak köşe yok.
- [ ] Ölçüler 4 px ızgarasında (istisnalar: 1 px çizgi, 9/10 px metin satırı, 20 px kontrol).
- [ ] Panel içinde metin gölgesiz; parıltı, degrade, emoji yok. Etiketler büyük harfle yazılmamış.
- [ ] Menü arka plan bulanıklığı 0 ve 10'da ekran okunuyor.
- [ ] F3+T sonrası tema doğru; kaynak paketiyle ezilen rol görünüyor, bozuk paket oyunu bozmuyor.

## Erişilebilirlik

- [ ] **Durum yalnızca renkle bildirilmiyor.** Her durumda sözcük, ikon ya da sayı var. Ekran görüntüsünü gri tonlamaya çevirip kontrol et.
- [ ] Renk körlüğü: kırmızı/yeşil ayrımına dayanan bilgi yok (başarı ile hata sözle de ayrışıyor).
- [ ] Yüksek kontrast: vanilya Erişilebilirlik › Yüksek kontrast açıkken (`yuksekKontrast: otomatik`) varyant uygulanıyor; paket sprite'ları devre dışı, kod çizimi kullanılıyor.
- [ ] **Anlatıcı** (Ctrl+B ya da Erişilebilirlik › Anlatıcı): ekran başlığı, her düğme, anahtarın durumu ("Açık/Kapalı") ve kaydırıcı değeri okunuyor. Toast içeriği anlatıcıya veriliyor.
- [ ] Klavye: Tab ile bütün kontrollere ulaşılıyor, odak halkası (`accentText` kenar) görünüyor, Enter/Boşluk çalışıyor, Esc ekranı kapatıyor.
- [ ] **Yanıp sönme yok.** Sürekli nabız, titreşim, `§k` yok. Saniyede 3'ten fazla parlama asla.
- [ ] Azaltılmış hareket açıkken bütün geçişler anında (`motionMs` 0).
- [ ] Bildirim süresi çarpanı (Erişilebilirlik › Bildirim süresi) toast'larda uygulanıyor.
- [ ] Sesler: `subtitle` anahtarı var ve iki dilde çevrilmiş; ses düzeyi ≤ 0,6; her üzerine gelmede ses yok.
- [ ] Metin boyutu için HUD ölçeği 2,0'de HUD öğeleri çakışmıyor.

## Metin ve dil

- [ ] Bütün görünen metin `Text.translatable`; kodda sabit Türkçe/İngilizce metin yok (marka ve ürün adları hariç).
- [ ] Anahtarlar `hardsetups.<mod>.<yer>.<ad>` biçiminde; `tr_tr.json` ve `en_us.json` ikisinde de var.
- [ ] Hata metni: ne oldu + ne yapmalı. "Sen" hitabı, kısa cümle.
- [ ] Sohbet mesajı `HsChat` ile; `[HardSetups]` öneki değişmemiş.
- [ ] Kimlik, anahtar, dosya adında `toLowerCase(Locale.ROOT)`; `Identifier` içinde Türkçe karakter yok.

## Teknik

- [ ] **Kare başına nesne üretme yok.** `render`, `renderWidget`, `onHudRender` ve `Toast.draw` içinde `new`, `Text.literal`, `String.format`, `wrapLines`, `copy()` yok; bunlar `init()`'te ya da değer değişince yapılıyor. (JFR ya da bir ayırıcıyla bellek ayırma profiline bak.)
- [ ] `HsTheme.current()` her karede okunuyor; renk başka yerde saklanmıyor. Temadan türeyen önbellek `HsTheme.CHANGED`'de temizleniyor.
- [ ] `renderBackground` kare başına bir kez çağrılıyor (`super.render` zaten çağırır).
- [ ] HUD öğesi F1 ve F3'te gizleniyor; oyuncu yokken çizmiyor.
- [ ] HUD ölçeği piksel hizasında (`HsDraw.hudScale`); yazı bulanık değil.
- [ ] Yüzlerce kutu çizen listelerde çizim `ctx.draw(() -> …)` içinde toplanmış.
- [ ] Sprite çiziminden önce karışım açık (`HsDraw.drawSprite`).
- [ ] Toast ve sohbet her iş parçacığından güvenle çağrılıyor (`mc.execute`).
- [ ] Sürüme bağlı API'ler (`drawGuiTexture`, `Toast`, `HudRenderCallback`) tek bir yerde; 1.21.2+ yükseltmesinde bakılacak yerler belli.
- [ ] Ürün modu tema yükleyicisi kaydetmiyor; yalnızca okuyor.
- [ ] `config/hardsetups/tema.json` ürün bildirimine ya da sunucu paketine konmamış; `ayarlar.json`'a tema anahtarı yazılmamış.
- [ ] Tema değeri değiştiyse (`docs/tema/tema.json`) `KIMLIK.md`, `kiremit.json` ve `HsTheme.kiremit()` birlikte güncellenmiş; değerler birebir aynı (bir birim testiyle karşılaştır).
