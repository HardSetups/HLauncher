# 04 · Kaynak paketi: dokular, dil, yazı tipi, özelleştirme

Resmi dosyaların yeri, ezme paketinin yapısı, dil dosyaları ve sunucu sahiplerinin ya da oyuncuların neyi değiştirebileceği.

## Resmi dosyalar (çekirdek mod jar'ı)

```
src/main/resources/
├── fabric.mod.json
└── assets/hardsetups/
    ├── themes/
    │   └── kiremit.json                  tema tanımı (resmi, tek)
    ├── lang/
    │   ├── tr_tr.json                    birincil dil
    │   └── en_us.json                    tam karşılık; eksik anahtarda yedek
    ├── sounds.json
    ├── sounds/ui/
    │   ├── bildirim.ogg
    │   ├── basari.ogg
    │   └── hata.ogg
    ├── font/
    │   └── baslik.json                   isteğe bağlı başlık yazı tipi
    └── textures/
        ├── font/
        │   └── baslik.png                isteğe bağlı başlık glifleri
        └── gui/sprites/
            ├── marka/
            │   └── logo.png              marka logosu (ezilmez, bkz. yasaklar)
            └── ikon/
                ├── bilgi.png             16×16 durum ikonları
                ├── basari.png
                ├── uyari.png
                └── hata.png
```

Kutular (panel, düğme, toast, HUD) koddan çizildiği için jar'da sprite'ları **yoktur**. Paketler bu sprite adlarını ekleyerek kod çizimini ezebilir ([03 › Sprite piksel kuralları](03-arayuz-bilesenleri.md#sprite-piksel-kuralları)).

Ürün modları aynı düzeni kendi ad alanında kurar:

```
assets/hardsetups-kumfirtinasi/
├── lang/tr_tr.json, en_us.json           anahtarlar hardsetups.kumfirtinasi.*
├── sounds.json + sounds/…
└── textures/gui/sprites/hud/…            ürüne özel çerçeve ve ikonlar
```

Ad alanında tire geçerlidir (`a-z 0-9 _ . -`). Türkçe karakter geçersizdir.

## Ezme paketi (tam yol ağacı)

Sunucu sahibinin ya da oyuncunun hazırlayacağı paket. Her dosya isteğe bağlıdır; yalnızca değiştirileni koy.

```
HardSetups-Tema-Ornek/
├── pack.mcmeta
├── pack.png                                      64×64 önizleme (isteğe bağlı)
└── assets/
    ├── hardsetups/
    │   ├── themes/
    │   │   └── kiremit.json                      yalnızca değişen roller
    │   ├── textures/gui/sprites/
    │   │   ├── panel/
    │   │   │   ├── yuzey.png + yuzey.png.mcmeta
    │   │   │   └── kart.png + kart.png.mcmeta
    │   │   ├── hud/
    │   │   │   └── panel.png + panel.png.mcmeta
    │   │   ├── toast/
    │   │   │   └── bildirim.png + bildirim.png.mcmeta
    │   │   ├── widget/
    │   │   │   ├── dugme_birincil.png + .mcmeta
    │   │   │   ├── dugme_birincil_vurgulu.png + .mcmeta
    │   │   │   ├── dugme_ikincil.png + .mcmeta
    │   │   │   ├── dugme_ikincil_vurgulu.png + .mcmeta
    │   │   │   └── dugme_pasif.png + .mcmeta
    │   │   └── ikon/
    │   │       └── bilgi.png, basari.png, uyari.png, hata.png
    │   ├── lang/
    │   │   ├── tr_tr.json                        yalnızca değişen anahtarlar
    │   │   └── en_us.json
    │   ├── sounds.json                           yalnızca olay tanımı değişiyorsa
    │   └── sounds/ui/*.ogg                       aynı yola .ogg koymak sesi değiştirir
    └── hardsetups-kumfirtinasi/
        └── textures/gui/sprites/hud/…            ürün sprite'ları
```

`pack.mcmeta` (1.21.1 için kaynak paketi biçimi **34**; 1.21–1.21.1 aralığı):

```json
{
  "pack": {
    "pack_format": 34,
    "description": "HardSetups Kiremit — sunucu ezmesi"
  }
}
```

1.21.2–1.21.3 için 42, 1.21.4 için 46. Paket yalnızca 1.21.1 hedefliyorsa 34 yeter.

Katmanlar: mod kaynakları kullanıcı paketlerinin altındadır. Paket listesinde üstteki paket kazanır.

- `themes/kiremit.json`: bütün katmanlar birleşir; her paket yalnızca yazdığı rolleri ezer.
- Dil dosyaları: anahtar bazında birleşir.
- Dokular ve `.ogg` dosyaları: dosya bazında ezilir. Bir sesi değiştirmenin en kolay yolu aynı yola yeni `.ogg` koymaktır.
- `sounds.json`: olaylar birleşir. Aynı olayı `"replace": true` olmadan yeniden tanımlarsan yeni ses eskisinin **yanına** eklenir ve ikisinden biri rastgele çalar. Değiştirmek için `"replace": true` ver.

## Dil dosyaları

Yer: `assets/<ad alanı>/lang/tr_tr.json` ve `en_us.json`. Minecraft eksik anahtarda `en_us`'a düşer; `en_us` yoksa ham anahtarı gösterir. Bu yüzden **`en_us.json` her zaman tamdır.** `tr_tr.json` birincil metindir, önce o yazılır.

### Anahtar adlandırma: `hardsetups.<mod>.<yer>.<ad>`

| Parça | Değerler | Not |
|---|---|---|
| `<mod>` | `cekirdek` (mod kimliği `hardsetups`), `kumfirtinasi`, `dolduroldur` | Mod kimliğinin `hardsetups-` sonrası; çekirdek için `cekirdek` |
| `<yer>` | `ekran`, `ayar`, `hud`, `toast`, `sohbet`, `baslik`, `ipucu`, `durum`, `hata`, `ses` | Metnin göründüğü yer |
| `<ad>` | küçük harf, ASCII, `_` ile | Gerekirse bir ara düzey: `ekran.gorunum.baslik`, `toast.kaydedildi.govde` |

`tr_tr.json` (örnek sınıfların kullandığı anahtarlar):

```json
{
  "hardsetups.cekirdek.ekran.gorunum.baslik": "Görünüm",
  "hardsetups.cekirdek.ayar.yuksek_kontrast": "Yüksek kontrast",
  "hardsetups.cekirdek.ayar.azaltilmis_hareket": "Azaltılmış hareket",
  "hardsetups.cekirdek.ayar.hud_olcek": "HUD ölçeği: %%%s",
  "hardsetups.cekirdek.hud.kalan_sure": "Kalan süre",
  "hardsetups.cekirdek.durum.bilgi": "Bilgi",
  "hardsetups.cekirdek.durum.basari": "Tamam",
  "hardsetups.cekirdek.durum.uyari": "Uyarı",
  "hardsetups.cekirdek.durum.hata": "Hata",
  "hardsetups.cekirdek.toast.kaydedildi.baslik": "Kaydedildi",
  "hardsetups.cekirdek.toast.kaydedildi.govde": "Görünüm ayarların saklandı.",
  "hardsetups.cekirdek.toast.kaydedilemedi.baslik": "Kaydedilemedi",
  "hardsetups.cekirdek.toast.kaydedilemedi.govde": "Ayar dosyası yazılamadı. Oyun klasörünün yazılabilir olduğunu kontrol et.",
  "hardsetups.cekirdek.ses.bildirim": "Bildirim",
  "hardsetups.cekirdek.ses.basari": "İşlem tamamlandı",
  "hardsetups.cekirdek.ses.hata": "İşlem başarısız"
}
```

`en_us.json`:

```json
{
  "hardsetups.cekirdek.ekran.gorunum.baslik": "Appearance",
  "hardsetups.cekirdek.ayar.yuksek_kontrast": "High contrast",
  "hardsetups.cekirdek.ayar.azaltilmis_hareket": "Reduced motion",
  "hardsetups.cekirdek.ayar.hud_olcek": "HUD scale: %s%%",
  "hardsetups.cekirdek.hud.kalan_sure": "Time left",
  "hardsetups.cekirdek.durum.bilgi": "Info",
  "hardsetups.cekirdek.durum.basari": "Done",
  "hardsetups.cekirdek.durum.uyari": "Warning",
  "hardsetups.cekirdek.durum.hata": "Error",
  "hardsetups.cekirdek.toast.kaydedildi.baslik": "Saved",
  "hardsetups.cekirdek.toast.kaydedildi.govde": "Your appearance settings were saved.",
  "hardsetups.cekirdek.toast.kaydedilemedi.baslik": "Couldn't save",
  "hardsetups.cekirdek.toast.kaydedilemedi.govde": "The settings file couldn't be written. Check that the game folder is writable.",
  "hardsetups.cekirdek.ses.bildirim": "Notification",
  "hardsetups.cekirdek.ses.basari": "Action completed",
  "hardsetups.cekirdek.ses.hata": "Action failed"
}
```

Kurallar:

- Parametre `%s` (sıralı: `%1$s`). Düz yüzde işareti `%%`. Türkçede yüzde işareti sayının önüne gelir: "%125". İngilizcede arkasına: "125%". Bu yüzden sayı biçimini dil dosyası belirler.
- Değerde `§` kullanma. Rengi kod verir.
- Büyük harfle yazılmış etiket yok. Cümle düzeni.
- "HardSetups" ve ürün adları ("Kum Fırtınası", "DoldurDoldur") çevrilmez.
- Hata metni: ne oldu + ne yapmalı. "Sen" hitabı.
- Anahtar değişirse eski anahtarı bir sürüm boyunca tut. Kaynak paketleri eski anahtarı ezmiş olabilir.
- Kod içinde metin yazma: `Text.translatable(anahtar, argumanlar...)`. Dil dosyası olmayabilecek istemciye giden metinde `Text.translatableWithFallback(anahtar, "Türkçe yedek")`.

## Başlık yazı tipi (isteğe bağlı)

Launcher'daki Chakra Petch'in oyundaki karşılığı. Yalnızca ekran başlığında (h1) ve büyük sayılarda. Gövde metni her zaman vanilya yazı tipidir. Yazı tipi yoksa başlık kalın vanilyadır; bu da tamamen geçerlidir.

`assets/hardsetups/font/baslik.json`:

```json
{
  "providers": [
    {
      "type": "bitmap",
      "file": "hardsetups:font/baslik.png",
      "ascent": 7,
      "height": 8,
      "chars": [
        "ABCÇDEFGĞHIİJKLM",
        "NOÖPQRSŞTUÜVWXYZ",
        "abcçdefgğhıijklm",
        "noöpqrsştuüvwxyz",
        "0123456789.,:!?-"
      ]
    },
    { "type": "reference", "id": "minecraft:default" }
  ]
}
```

- `file` yolu `textures/` altındandır: `assets/hardsetups/textures/font/baslik.png`.
- Doku, `chars` satırlarıyla aynı ızgaradadır. Her satır aynı sayıda karakter içerir (burada 16 × 5). Hücre boyutu = doku genişliği / satırdaki karakter sayısı. Boş hücre için `\u0000` yaz.
- `ascent` ≤ `height`. Vanilya ızgarası: `height` 8, `ascent` 7.
- **Son sağlayıcı `reference` → `minecraft:default` olmalı.** Bir glif ilk sağlayıcıda yoksa sıradakine bakılır. Böylece eksik karakter (ör. nadir noktalama) vanilyadan gelir.
- Türkçe harflerin hepsi olmalı: `Ç Ğ İ Ö Ş Ü ç ğ ı ö ş ü`. Başlıklar cümle düzeninde yazıldığı için küçük harfler de şarttır. Vanilyada Türkçe harfler ayrı sağlayıcıdadır (ascent 10, height 12). Kendi glifinde `İ Ğ Ö Ü` üst işaretini 8 px hücreye sığdır ya da bu harfleri ayrı bir sağlayıcıya daha büyük `height` ile koy.
- `Identifier` kurallarına göre dosya adı küçük harf ve ASCII.

Kullanım:

```java
private static final Identifier BASLIK_FONT = Identifier.of("hardsetups", "baslik");

heading = getTitle().copy().styled(s -> s.withFont(BASLIK_FONT));   // init() içinde bir kez
```

Unicode yazı tipi zorlanmışsa (Dil › Yazı tipi ayarları) başlık yazı tipi yine kullanılır. Testte bu seçeneği açık ve kapalı dene.

## Özelleştirme: kim neyi değiştirebilir?

**Sunucu sahibi:** kaynak paketini `server.properties` içinde `resource-pack` (URL), `resource-pack-sha1` ve isteğe bağlı `require-resource-pack` ile dağıtır. **Oyuncu:** paketi `resourcepacks/` klasörüne koyar ve Seçenekler › Kaynak paketleri'nden açar. İkisi de F3+T ile anında görünür.

| Serbest | Kural |
|---|---|
| Rol renklerini değiştirmek (`themes/kiremit.json`) | Kontrast bekçisinden geçmeli (metin 4,5:1, `hudPanel` alfası ≥ `0xE6`). Geçmeyen dosya bütünüyle yok sayılır |
| Kutu ve düğme sprite'ı eklemek | [Sprite piksel kuralları](03-arayuz-bilesenleri.md#sprite-piksel-kuralları): 1 texel kenar, pahlı köşe, düz dolgu. Yüksek kontrast açıkken sprite yok sayılır, kod çizimi kullanılır |
| Durum ikonlarını yeniden çizmek | 16×16, aynı anlam, aynı kenar ve pah kuralları |
| Dil metnini düzeltmek, yeni dil eklemek | Anlam ve ton korunur; parametre sayısı değişmez |
| Arayüz seslerini değiştirmek | Kısa, `volume` en fazla 0,6; aynı `subtitle` anahtarı |
| Kendi ad alanında yeni tema (`sunucum:gece`) | Oyuncu `tema.json`'da seçer. Resmi destek yalnızca `hardsetups:kiremit` içindir |

| Yasak | Neden |
|---|---|
| Marka logosunu (`hardsetups:marka/logo`) değiştirmek, kaldırmak ya da başka markayla birleştirmek | Marka kimliği. Çekirdek mod logoyu kaynak paketinden değil, kendi jar'ından okuyabilir (önerilen teknik önlem) |
| "HardSetups" adını, `[HardSetups]` sohbet önekini ya da ürün adlarını değiştirmek | Aynı |
| Okunmaz kontrast (metin 4,5:1 altı, saydam metin, saydam HUD paneli) | Erişilebilirlik. Bekçi reddeder; sprite'ta denetim yok, kural yine geçerlidir |
| `hardsetups:` ad alanında yeni tema kimliği yayımlamak | Bu ad alanı resmi temalara ayrılmıştır |
| Yanıp sönen, titreyen ya da `§k` kullanan doku/metin | Işığa duyarlı oyuncular. Saniyede 3'ten fazla parlama asla |
| HardSetups görünümünü taklit eden başka bir ürün | Oyuncuyu yanıltır |
| `config/hardsetups/tema.json`'u sunucu paketi ya da ürün bildirimiyle dağıtmak | Oyuncunun kendi seçimini ezer |
