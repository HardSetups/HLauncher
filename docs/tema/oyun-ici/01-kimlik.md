# 01 · Kimlik: KIMLIK.md'nin oyun içi karşılığı

Kaynak: [`../KIMLIK.md`](../KIMLIK.md) ve [`../tema.json`](../tema.json). Bu sayfa değer uydurmaz. Yalnızca bu değerlerin Minecraft içinde nasıl kullanılacağını söyler. "Türetilmiş" diye işaretli beş rol, KIMLIK.md kurallarının piksel karşılığıdır.

## Karakter

**Dövülmüş grafit üstünde kiremit.** Oyunda bunun anlamı:

- Katmanlar: zemin → yüzey → kart. Her katman bir ton açıktır ve üst kenarının hemen altında 1 px ışık çizgisi taşır.
- Kiremit yalnızca birincil eylemde, seçili durumda ve önemli bilgide kullanılır. Bir ekranda tek birincil düğme olur.
- İmza şekil **pahlı köşe**dir: her kutunun dört köşesinde 1 texel kesik vardır.
- Yapılmayacaklar: parıltı, metin gölgesiyle parlatma, degrade süs, yanıp sönen öğe, `§k` (karışık yazı), emoji ikon.

## Renk rolleri

Kod rengi hex ile yazmaz, rol ister: `HsTheme.current().color(Role.ACCENT_FILL)`. ARGB değeri `DrawContext` içindir. `Style.withColor` için `rgb(...)` kullanılır, çünkü metin stili alfa almaz.

### Yüzeyler

| Rol (JSON) | Java | Palet | Hex | ARGB | Ne için |
|---|---|---|---|---|---|
| `background` | `BACKGROUND` | grafit.900 | `#101216` | `0xFF101216` | Kendi tam ekran zeminimiz (nadiren; genelde vanilya arka planı kalır) |
| `backgroundDeep` | `BACKGROUND_DEEP` | grafit.950 | `#0B0C0F` | `0xFF0B0C0F` | Gömük alanlar (liste kuyusu), perdenin tabanı |
| `surface` | `SURFACE` | grafit.850 | `#15171C` | `0xFF15171C` | Ekran paneli gövdesi |
| `raised` | `RAISED` | grafit.800 | `#1B1E24` | `0xFF1B1E24` | Kart, toast, pasif düğme, kaydırıcı izi |
| `raised2` | `RAISED_2` | grafit.750 | `#22252C` | `0xFF22252C` | İkincil düğme, kapalı anahtar izi |
| `line` | `LINE` | grafit.700 | `#2B2F37` | `0xFF2B2F37` | 1 px kenar: panel, kart, HUD paneli |
| `lineStrong` | `LINE_STRONG` | grafit.600 | `#3A3F49` | `0xFF3A3F49` | İkincil düğme ve kaydırıcı kenarı, toast kenarı, ayraç |

### Vurgu

| Rol (JSON) | Java | Palet | Hex | ARGB | Ne için |
|---|---|---|---|---|---|
| `accentFill` | `ACCENT_FILL` | kiremit.500 | `#A52B12` | `0xFFA52B12` | Birincil düğme dolgusu, açık anahtar, kaydırıcı tutamağı. **Metin rengi olarak kullanılmaz** (koyu zeminde 2,5:1) |
| `accentFillPressed` | `ACCENT_FILL_PRESSED` | kiremit.600 | `#7F200D` | `0xFF7F200D` | Birincil düğmenin alt kenarı (sert alt gölge), basılı hâl |
| `accentText` | `ACCENT_TEXT` | kiremit.400 | `#EC6A51` | `0xFFEC6A51` | Ekran başlığı, vurgu metni, odak halkası, `[HardSetups]` markası |
| `accentTextHover` | `ACCENT_TEXT_HOVER` | kiremit.300 | `#F4957F` | `0xFFF4957F` | Üzerine gelinen bağlantı metni. Çok az |
| `onAccentFill` | `ON_ACCENT_FILL` | beyaz | `#FFFFFF` | `0xFFFFFFFF` | Kiremit dolgu üstündeki metin ve ikon (7,1:1). Saf beyazın tek izinli yeri |
| `highlight` | `HIGHLIGHT` | kor | `#F0A04B` | `0xFFF0A04B` | Nadir vurgu: "yeni", ödül, indirim. Bir ekranda en fazla bir kez |

### Metin

| Rol (JSON) | Java | Hex | ARGB | Ne için |
|---|---|---|---|---|
| `textPrimary` | `TEXT_PRIMARY` | `#F2F3F5` | `0xFFF2F3F5` | Gövde metni, düğme etiketi, HUD değeri |
| `textSecondary` | `TEXT_SECONDARY` | `#B3B7C0` | `0xFFB3B7C0` | Açıklama, HUD etiketi, toast gövdesi, sohbet köşeli parantezi |
| `textTertiary` | `TEXT_TERTIARY` | `#7C818C` | `0xFF7C818C` | İpucu, pasif metin. **Yalnızca `surface` ya da daha koyu zeminde** |

### Durum

| Rol (JSON) | Java | Hex | ARGB | Sözcük (renk tek başına yetmez) |
|---|---|---|---|---|
| `success` | `SUCCESS` | `#3FCF7B` | `0xFF3FCF7B` | "Tamam" |
| `warning` | `WARNING` | `#E7A93B` | `0xFFE7A93B` | "Uyarı" |
| `danger` | `DANGER` | `#E5484D` | `0xFFE5484D` | "Hata" |
| `info` | `INFO` | `#4C8DFF` | `0xFF4C8DFF` | "Bilgi" |

Durum rengi süs değildir; yalnızca durum bildirir. Ayrıntı: [03 › Durum renkleri](03-arayuz-bilesenleri.md#durum-renkleri).

### Türetilmiş (yalnızca oyunda)

| Rol (JSON) | Java | ARGB | Neden |
|---|---|---|---|
| `edgeLight` | `EDGE_LIGHT` | `0x0DFFFFFF` | Beyaz %5: KIMLIK.md'deki kart üst ışık çizgisi |
| `shadow` | `SHADOW` | `0x66000000` | Siyah %40: yüzen öğenin altında 1 px sert gölge (pikselde yumuşak gölge olmaz) |
| `hudPanel` | `HUD_PANEL` | `0xE6101216` | grafit.900 %90: dünya üstünde okunurluk (aşağıdaki ölçüm) |
| `scrim` | `SCRIM` | `0xCC0B0C0F` | grafit.950 %80: ekran içi modal perdesi |
| `accentWeak` | `ACCENT_WEAK` | `0x21A52B12` | kiremit.500 %13: seçili satır zemini, kaydırıcının dolu kısmı (launcher'daki `--accent-weak` gibi) |

Yalnızca bu beş rol yarı saydam olabilir. Yükleyici başka bir rolde alfa görürse o katmanı reddeder.

## Kontrast

WCAG 2 oranları. Değerler `tema.json` renklerinden hesaplandı; eşik 4,5:1 (normal metin).

| Metin ↓ / zemin → | `surface` | `raised` | `raised2` | `accentFill` |
|---|---|---|---|---|
| `textPrimary` | 16,2 | 15,0 | 13,8 | 6,4 |
| `textSecondary` | 8,9 | 8,3 | 7,6 | 3,5 |
| `textTertiary` | 4,6 | **4,3** | **3,9** | 1,8 |
| `accentText` | 5,8 | 5,4 | 4,9 | 2,3 |
| `onAccentFill` | — | — | — | 7,1 |
| `success` | 8,9 | 8,3 | 7,6 | — |
| `warning` | 8,7 | 8,1 | 7,4 | — |
| `danger` | 4,6 | **4,3** | **3,9** | — |
| `info` | 5,6 | 5,2 | 4,8 | — |

Kurallar:

- `textTertiary` yalnızca `surface` ya da daha koyu zeminde. Kartta `textSecondary` kullan.
- `danger` metni yalnızca `surface` üstünde. Kartta, toast'ta, düğmede durum rengini şerit ya da ikon yap; metni `textPrimary` yaz.
- `accentFill` hiçbir zaman metin rengi değildir. Koyu zeminde vurgu metni `accentText`'tir.
- Kiremit dolgu üstünde yalnızca `onAccentFill` ya da `textPrimary`.
- Pasif (devre dışı) metin eşik dışıdır; `textTertiary` kalabilir.

## Minecraft'ın arka planları üzerinde

**Menüler (1.21.1 için, jar'dan doğrulandı):** `Screen.renderBackground` dünya yoksa panorama çizer. Sonra bulanıklık uygular ve `menu_background` ya da dünyadaysan `inworld_menu_background` dokusuyla karartır. Bulanıklık oyuncu ayarıdır: Erişilebilirlik › Menü arka plan bulanıklığı, 0–10, varsayılan 5. Envanter tipi ekranlar (`HandledScreen`) yarı saydam koyu bir degrade çizer (`0xC0101010` → `0xD0101010`).

Sonuç: arka plan tahmin edilemez. **Metin hiçbir zaman doğrudan arka plana yazılmaz, her zaman opak bir panelin içindedir.** Panel `surface` opaktır; içindeki kontrast arkadan bağımsızdır.

**HUD (dünya üstü):** Dünya her renkte olabilir. En kötü durum kar (`#F9FEFE`):

| Metin | Doğrudan dünya üstünde | `hudPanel` (%90) üstünde |
|---|---|---|
| `textPrimary` | 1,1 | 13,0 |
| `textSecondary` | — | 7,2 |
| `accentText` | 3,1 | 4,6 |

Kural: HUD metni ya `hudPanel` içindedir ya da vanilyanın kendi gölgeli çizimidir (başlık, altyazı, eylem çubuğu). Yükleyici `hudPanel` alfasının `0xE6` altına inmesine izin vermez.

## `§` biçim kodları: yalnızca zorunlu yedek

Kodda `§` yazılmaz. Renk `Style.withColor(rgb)` ile verilir (bkz. `HsChat`). `§` yalnızca `Text` nesnesi geçemediğin yerlerde yedektir:

- Düz metin alan yerler: sunucu MOTD'si (`server.properties`), düz metin kabul eden eklenti ya da komut yapılandırmaları.
- Dil dosyasında renk şart olduğunda. Bundan da kaçın: rengi kod versin, dil dosyası yalnızca metni tutsun.

### Rolden koda

En yakın kod CIE Lab ΔE ile bulundu. "Kullan" sütunu okunurluğa göre düzeltilmiş seçimdir.

| Rol | En yakın (ΔE) | Kullan | Not |
|---|---|---|---|
| `accentText` | `§c` RED (15,8) | `§c` | |
| `accentTextHover` | `§c` RED (34,1) | `§c` | |
| `accentFill` | `§4` DARK_RED (12,4) | — | Metin değildir; `§4` koyu zeminde 2,4:1 |
| `accentFillPressed` | `§4` DARK_RED (25,1) | — | Metin değildir |
| `highlight` (kor) | `§6` GOLD (25,0) | `§6` | |
| `textPrimary` | `§f` WHITE (4,3) | `§f` | |
| `textSecondary` | `§7` GRAY (6,9) | `§7` | |
| `textTertiary` | `§7` GRAY (17,0) | `§7` | `§8` koyu zeminde 2,5:1, kullanma |
| `success` | `§2` DARK_GREEN (34,1) | `§a` | `§a` açık tonu dünya üstündeki sohbette daha iyi okunur |
| `warning` | `§6` GOLD (19,3) | `§6` | |
| `danger` | `§c` RED (8,5) | `§c` | |
| `info` | `§9` BLUE (43,1) | `§b` | `§9` koyu zeminde 3,7:1; `§b` ton olarak uzak ama okunur |

Çakışmalar: `accentText` ile `danger` ikisi de `§c`. `highlight` ile `warning` ikisi de `§6`. Bu yüzden `§` yedeğinde durum **sözle** yazılır: `§c§lHata:§r§f Lisans doğrulanamadı.`

### 16 vanilya rengi

Değerler 1.21.1 `Formatting` sınıfından doğrulandı. Kontrast `grafit.900` üstündedir.

| Kod | `Formatting` | Hex | Kontrast | Kullanım |
|---|---|---|---|---|
| `§0` | BLACK | `#000000` | 1,1 | Kullanma |
| `§1` | DARK_BLUE | `#0000AA` | 1,4 | Kullanma |
| `§2` | DARK_GREEN | `#00AA00` | 6,0 | Kullanma (`§a` tercih) |
| `§3` | DARK_AQUA | `#00AAAA` | 6,5 | Kullanma |
| `§4` | DARK_RED | `#AA0000` | 2,4 | Kullanma |
| `§5` | DARK_PURPLE | `#AA00AA` | 2,9 | Kullanma |
| `§6` | GOLD | `#FFAA00` | 9,8 | `highlight`, `warning` |
| `§7` | GRAY | `#AAAAAA` | 8,1 | `textSecondary`, `textTertiary` |
| `§8` | DARK_GRAY | `#555555` | 2,5 | Kullanma |
| `§9` | BLUE | `#5555FF` | 3,7 | Kullanma |
| `§a` | GREEN | `#55FF55` | 14,1 | `success` |
| `§b` | AQUA | `#55FFFF` | 15,3 | `info` |
| `§c` | RED | `#FF5555` | 6,0 | `accentText`, `danger` |
| `§d` | LIGHT_PURPLE | `#FF55FF` | 7,1 | Kullanma |
| `§e` | YELLOW | `#FFFF55` | 17,6 | Kullanma (kimlikte yok) |
| `§f` | WHITE | `#FFFFFF` | 18,8 | `textPrimary` |

Biçim kodları: `§l` kalın (yalnızca başlık ve durum sözcüğü), `§r` sıfırla. `§k` (karışık, titreyen yazı) yasak. `§o`, `§n` ve `§m` kullanılmaz.

## Yazı

- **Yazı tipi:** vanilya `minecraft:default`. Satır yüksekliği `textRenderer.fontHeight` = 9. Büyük harf yüksekliği 7 px. Satır adımı olarak 10 px kullan.
- **Hiyerarşi:** ekran başlığı kalın ve `accentText`; gövde `textPrimary`; açıklama `textSecondary`. Launcher'daki Chakra Petch'in karşılığı kalın vanilyadır. İsteğe bağlı başlık yazı tipi: [04 › Başlık yazı tipi](04-kaynak-paketi.md#başlık-yazı-tipi-isteğe-bağlı).
- **Gölge:** panel içinde metin gölgesiz çizilir (`drawText(..., false)`). Gölge yalnızca vanilyanın dünya üstünde kendi çizdiği yerlerde kalır. Parlatmak için gölge kullanılmaz.
- **Türkçe karakterler:** vanilya yazı tipi `ğ ü ş ı ö ç İ Ğ Ü Ş Ö Ç` karakterlerinin hepsini `accented.png` sağlayıcısından çizer (1.21.1 `font/include/default.json`: ascent 10, height 12; düz harfler ascent 7, height 8). Yani `İ Ğ Ö Ü` normal harflerden 3 px yukarı taşar, `Ç Ş ç ş` kuyrukları 1 px daha aşağı iner. Metnin üstünde en az 3 px, altında en az 2 px boşluk bırak. 20 px yüksek kontrolde metni `y + 6`'ya koymak bunu sağlar.
- **Unicode yazı tipini zorla** (Dil › Yazı tipi ayarları) açıkken genişlikler değişir. Metin genişliğini asla sabit yazma; `textRenderer.getWidth(...)` ile ölç. Bu seçenek açıkken vanilya tek sayılı GUI ölçeğini bir üst çift sayıya çıkarır.
- **Büyük harf etiket yok.** Cümle düzeni: "Görünüm", "Şimdi oyna".
- **Java yerel ayar tuzağı:** Türkçe sistemde `"ACIK".toLowerCase()` sonucu `"acık"` olur (noktasız ı). Kimlik, anahtar ve dosya adında her zaman `toLowerCase(Locale.ROOT)` kullan. `Identifier` yalnızca `a-z 0-9 _ . -` (yolda ayrıca `/`) kabul eder, Türkçe karakter kabul etmez: `kumfirtinasi`, `kumfırtınası` değil.

## Pahlı köşe

Launcher'da `corner-shape: bevel` ile yapılan imza, oyunda **1 texel köşe kesiği**dir (`tema.json › shape.chamferPx.inGameTexel = 1`). 1 texel = 1 GUI pikseli. GUI ölçeği 2'de bu 2×2, ölçek 3'te 3×3 ekran pikselidir.

```
Sol üst köşe (büyütülmüş)        . = boş (saydam)
  . K K K K                      K = kenar (1 px)
  K I I I I                      I = üst ışık (edgeLight)
  K D D D D                      D = dolgu
  K D D D D
```

- Dört köşenin dördü de kesiktir. İç içe kutularda içteki de kesiktir.
- Pah her zaman 1 texeldir; büyütülmez. Yuvarlak köşe yok.
- Kod karşılığı: `HsDraw.box` köşe piksellerini hiç boyamaz. Sprite karşılığı: köşe pikseli alfa 0.

## 4 px ızgara ve GUI ölçeği

Tüm ölçüler GUI pikselidir. Vanilya bunu GUI ölçeğiyle (1, 2, 3, 4… ya da Otomatik) ekran pikseline çevirir.

| Ölçü | Değer | Not |
|---|---|---|
| Boşluk adımları | 4 · 8 · 12 · 16 | Aynı grup içi 4, gruplar arası 8, panel iç boşluğu 12, bölümler arası 16 |
| Kontrol yüksekliği | 20 | Vanilya düğmesiyle aynı (5×4) |
| Satır adımı (kontrol listesi) | 24 | 20 kontrol + 4 boşluk |
| Metin satırı | 10 | İstisna: yazı tipi 9 px |
| Kenar, ışık, pah | 1 | İstisna: çizgi kalınlığı |
| Standart düğme genişliği | 96 (küçük 48) | 4'ün katı |
| Ekran paneli genişliği | 240 | En küçük ekrana kenar boşluğuyla sığar |
| HUD kenar boşluğu | 4 | Ekran kenarından |

- **En küçük hedef alan:** 320×240 GUI pikseli. Vanilya otomatik ölçeği, ölçekli alan bu boyutun altına düşmeyecek en büyük ölçeği seçer (1.21.1 `Window.calculateScaleFactor`). Her ekran 320×240'ta tam görünmelidir.
- Konumları `init()` içinde hesapla, kurucuda (constructor) değil. Pencere boyutu değişince `init()` yeniden çağrılır.
- **HUD ölçeği:** oyuncu çarpanı (0,5–2,0), GUI ölçeğiyle çarpımı tam sayı olacak şekilde yuvarlanır (`HsDraw.hudScale`). Böylece yazı bulanıklaşmaz.

## Hareket

- Süreler `tema.json › motion`: hızlı 120, temel 180, yavaş 260 ms. Eğri `cubic-bezier(0.2, 0.8, 0.2, 1)` (hızlı başlar, yumuşak durur).
- Süreyi `HsTheme.current().motionMs(Motion.BASE)` ile al. Azaltılmış hareket açıksa 0 döner; değişim anında olur.
- Zamanı kare sayısıyla değil saatle ölç: `Util.getMeasuringTimeMs()`. Kare hızı değişse de süre sabit kalır.
- Animasyon yalnızca durum değişince oynar (açılma, seçilme). Sürekli nabız, yanıp sönme ve titreşim yok.

## Ses ve dil tonu

- **Dil:** Türkçe önce, İngilizce tam karşılık. "Sen" hitabı, kısa cümle. Hata metni iki parçadır: ne oldu + ne yapmalı. Örnek: "Lisans doğrulanamadı. Launcher'dan yeniden giriş yap."
- **Marka:** "HardSetups" çevrilmez, bölünmez, küçük harfe çevrilmez.
- **Ses:** kısa (400 ms altı), yumuşak, ses düzeyi en fazla 0,6. Her üzerine gelmede ses yok. Düğme tık sesi vanilyadan gelir; toast sesini vanilya kendisi çalar. Kendi seslerimiz yalnızca sonuç bildirir: bildirim, başarı, hata.
