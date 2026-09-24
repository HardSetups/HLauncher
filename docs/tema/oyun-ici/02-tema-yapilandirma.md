# 02 · Tema yapılandırması: tanım, yükleme, seçim

Temanın nerede tanımlandığı, nasıl yüklendiği, oyuncunun neyi seçtiği ve modların temayı nasıl okuduğu. Kod: [`ornekler/`](ornekler/). Sınıflar önerilen yapıdır; 1.21.1 + Fabric API 0.116.17+1.21.1'e karşı derlenir ve yükleyici mantığı testlerden geçti (bkz. [README › Doğrulama](README.md#doğrulama)).

## Üç dosya, üç sahip

| Dosya | Yer | Sahibi | İçerik |
|---|---|---|---|
| `kiremit.json` | çekirdek mod jar'ı: `assets/hardsetups/themes/kiremit.json` | çekirdek mod; kaynak paketi ezebilir | Renk rolleri, yüksek kontrast varyantı, hareket süreleri |
| `tema.json` | oyun klasörü: `config/hardsetups/tema.json` | çekirdek mod (oyuncunun tercihi) | Seçili tema, yüksek kontrast, azaltılmış hareket, HUD ölçeği |
| `ayarlar.json` | oyun klasörü: `config/hardsetups/ayarlar.json` | ürün modu + launcher | Lisans anahtarı (`lisans.anahtar.<oyun>`), ürün ayarları. **Tema buraya yazılmaz** |

## Tema tanım dosyası

Tam örnek: [`kiremit.json`](kiremit.json). Çekirdek modda `src/main/resources/assets/hardsetups/themes/kiremit.json` olarak durur.

- **Kimlik yoldan gelir.** `hardsetups:kiremit` → `assets/hardsetups/themes/kiremit.json`. Dosyadaki `"id"` bilgi amaçlıdır ve yolla aynı olmalıdır.
- **`roles`:** rol adı → renk. Rol adları [01 › Renk rolleri](01-kimlik.md#renk-rolleri) ile aynıdır.
- **Renk biçimi:** `"0xAARRGGBB"` (ARGB, önerilen) ya da `"#RRGGBB"` (opak). CSS'teki `"#RRGGBBAA"` bilerek reddedilir, çünkü alfa sonda mı başta mı karışır.
- **`variants.highContrast`:** yüksek kontrast açıkken üstüne yazılan roller. Yalnızca paletteki değerler kullanılır.
- **`motion`:** `fastMs`, `baseMs`, `slowMs` (0–1000 arasına kırpılır).
- **`shape`, `typography`, `$source`, `$comment`:** bilgi amaçlıdır; yükleyici okumaz. `$` ile başlayan anahtarlar her yerde yok sayılır.
- **Kısmi dosya geçerlidir.** Bir kaynak paketi yalnızca değiştirmek istediği rolleri yazar; yazmadıkları alttaki katmandan gelir.

Kaynak paketinden örnek ezme (yalnızca iki rol):

```json
{
  "roles": {
    "accentText": "0xFFF4957F",
    "hudPanel": "0xFF101216"
  }
}
```

## Oyuncu ayarı: `config/hardsetups/tema.json`

```json
{
  "surum": 1,
  "tema": "hardsetups:kiremit",
  "yuksekKontrast": "otomatik",
  "azaltilmisHareket": false,
  "hudOlcek": 1.0
}
```

| Alan | Tür | Varsayılan | Değerler |
|---|---|---|---|
| `surum` | sayı | 1 | Biçim sürümü. Alan eklenince artar |
| `tema` | metin | `hardsetups:kiremit` | Tema kimliği. Bulunamazsa varsayılana dönülür |
| `yuksekKontrast` | metin | `otomatik` | `otomatik`: vanilya Erişilebilirlik › Yüksek kontrast seçeneğini izler. `acik` / `kapali`: oyuncu elle seçti |
| `azaltilmisHareket` | mantıksal | `false` | `true` ise tüm geçişler anında olur |
| `hudOlcek` | sayı | `1.0` | 0,5–2,0. Ekranda 0,25 adımla seçilir. Piksel hizası için yuvarlanır |

Dosyayı yalnızca çekirdek mod okur ve yazar (`TemaAyarlari.load()` / `save()`). Yazma atomiktir: `tema.json.tmp` → yerine taşı.

### Neden `ayarlar.json`'dan ayrı?

- **Sır yok.** `ayarlar.json` lisans anahtarı taşır; launcher günlükte ve raporda bunu gizler. `tema.json` sır içermez: destekte istenebilir, ekran görüntüsünde görünebilir, sunucu sahibi paylaşabilir.
- **Tek sahip.** Launcher `ayarlar.json`'a oyun kapalıyken lisans anahtarını **birleştirir** (`electron/services/licenseconfig.cjs`). Oyun içinde değişen tema ayarı başka bir dosyada olunca mod ile launcher aynı dosyayı yazmak için yarışmaz. Bir mod `ayarlar.json`'u bellekten yeniden yazarken lisans anahtarını silme riski de doğmaz.
- **Ortak tercih.** Tema bütün HardSetups modlarına ortaktır ve çekirdek moda aittir. `ayarlar.json` ise ürün ayarlarıdır.
- **Biçim.** Launcher `ayarlar.json`'u düz `{"anahtar": "metin"}` haritası olarak birleştirir. Tema ayarında mantıksal değer ve sayı var.
- **Kurulumdan etkilenmez.** Launcher kurulum, güncelleme ve onarımda yalnızca ürün bildirimindeki (manifest) dosyaları yazar ve `managedPaths` klasörlerini (bugün `mods/`) yönetir. Lisans ayarını da `ayarlar.json`'a birleştirir. Bildirimde olmayan `tema.json`'a dokunmaz. Kural: ürün bildirimine `config/hardsetups/tema.json` konmaz, yoksa oyuncunun seçimini her güncellemede ezer.

Ürünün kendi HUD ölçeği ayarı varsa (ör. `ayarlar.json › hud.olcek`), yeni kod genel `hudOlcek` değerini kullanır. Geçiş döneminde ürün ayarı varsa o kazanır. Ürüne özel yeni görünüm ayarı eklenmez.

## Yükleme sırası

```
düşük öncelik
  1. HsTheme.kiremit()          kodda gömülü Kiremit (JSON bozuk olsa bile oyun temasız kalmaz)
  2. mod jar'ı                  assets/hardsetups/themes/kiremit.json
  3. kaynak paketleri           aynı yol; alttan üste, her biri yalnızca yazdığı rolleri ezer
  4. variants.highContrast      yüksek kontrast etkinse, en üstteki katmanın varyantı
  5. oyuncu ayarı (tema.json)   tema seçimi, hareket, HUD ölçeği
yüksek öncelik
```

`ResourceManager.getAllResources(id)` katmanları yükleme sırasında (artan öncelik) döndürür. Son eleman, normal okumada gelecek olan en üst pakettir. Mod kaynakları kullanıcı paketlerinin altındadır.

### Ne zaman yeniden yüklenir?

| Olay | Ne olur |
|---|---|
| Oyun açılışı | `HsThemeLoader.reload` çalışır |
| **F3+T** | Kaynaklar yeniden yüklenir, dinleyici yeniden çalışır |
| Kaynak paketi ekranında değişiklik | Aynı |
| Vanilya yüksek kontrast aç/kapat | Vanilya `high_contrast` paketini açıp kapatır ve kaynakları yeniden yükler (1.21.1 jar'ından doğrulandı). `otomatik` ayar kendiliğinden uyar |
| Oyuncu ayar ekranında değişiklik | `HsThemeLoader.apply(ayar)`: kaynakları yeniden yüklemeden anında uygular. Dosya ekran kapanınca yazılır |

Her durumda sonunda `HsTheme.CHANGED` olayı tetiklenir.

### Hatalı JSON'da güvenli geri dönüş

Kural: **bozuk katman bütünüyle atlanır, geri kalan katmanlar geçerli kalır.** Oyun asla temasız ya da yarım temayla kalmaz. Her durum günlüğe `HardSetups/Tema` adıyla uyarı yazar.

| Durum | Davranış |
|---|---|
| JSON sözdizimi bozuk | O paketin dosyası atlanır |
| `roles` nesne değil | Katman atlanır |
| Renk biçimi yanlış (`#RRGGBBAA`, eksik hane) | Katman atlanır |
| Bilinmeyen rol adı | Yalnızca o anahtar yok sayılır |
| Yarı saydam metin ya da yüzey rengi | Katman reddedilir (yalnızca 5 türetilmiş rol yarı saydam olabilir) |
| Kontrast eşiğin altında (4,5:1) | Katman reddedilir. Denetlenen çiftler: metin rolleri ve durum renkleri `surface` üstünde, `textPrimary`/`textSecondary` `raised` üstünde, `onAccentFill` `accentFill` üstünde |
| `hudPanel` alfası `0xE6` altında | Katman reddedilir |
| Seçili tema bulunamadı | `hardsetups:kiremit`'e dönülür |
| `tema.json` bozuk | `tema.json.bozuk-<zaman>` olarak saklanır, varsayılanlarla devam edilir (launcher'daki `ayarlar.json` davranışıyla aynı) |

## Çekirdek API taslağı

Paket: `com.hardsetups.core.theme`. Ortak sınıflar sunucuda da yüklenir; istemci sınıfları yalnızca istemcide.

```java
// Ortak
HsTheme t = HsTheme.current();          // her karede çağrılabilir; alan okuması, nesne üretmez
int argb  = t.color(Role.ACCENT_FILL);  // DrawContext.fill / drawText için ARGB
int rgb   = t.rgb(Role.ACCENT_TEXT);    // Style.withColor(int) / TextColor.fromRgb için RGB
boolean hc = t.highContrast();
int ms    = t.motionMs(HsTheme.Motion.BASE);  // azaltılmış harekette 0
float hud = t.hudScale();
Identifier id = t.id();                 // hardsetups:kiremit

HsTheme.CHANGED.register(theme -> onbellegiTemizle());   // tema değişti (render iş parçacığı)

MutableText m = HsChat.message(Text.translatable("hardsetups.kumfirtinasi.sohbet.tur_basladi"));
MutableText e = HsChat.status(Durum.HATA, Text.translatable("hardsetups.kumfirtinasi.hata.lisans"));

// İstemci
HsDraw.surface(ctx, x, y, w, h);        // yüzey paneli
HsDraw.card(ctx, x, y, w, h);           // kart
HsDraw.box(ctx, x, y, w, h, fill, edge, bottom);   // ham pahlı kutu (ARGB)
new HsButton(x, y, 96, 20, metin, HsButton.Kind.PRIMARY, b -> ...);
new HsToggle(x, y, w, 20, etiket, deger, yeni -> ...);
HsToast.show(Durum.BASARI, baslik, govde);
HsSesler.ui(HsSesler.BILDIRIM);
```

| Sınıf | Taraf | Görev |
|---|---|---|
| [`Role`](ornekler/Role.java) | ortak | Rol adları ve JSON anahtarları |
| [`HsTheme`](ornekler/HsTheme.java) | ortak | Etkin tema, gömülü Kiremit, `CHANGED` olayı |
| [`Durum`](ornekler/Durum.java) | ortak | Bilgi / başarı / uyarı / hata: rol + dil anahtarı |
| [`HsChat`](ornekler/HsChat.java) | ortak | `[HardSetups]` öneki ve durum mesajı |
| [`HsThemeLoader`](ornekler/HsThemeLoader.java) | istemci | Kaynak dinleyicisi, katmanlar, kontrast bekçisi |
| [`TemaAyarlari`](ornekler/TemaAyarlari.java) | istemci | `config/hardsetups/tema.json` |
| [`HsDraw`](ornekler/HsDraw.java) | istemci | Pahlı kutu, sprite ezmesi, HUD ölçeği |
| [`HsButton`](ornekler/HsButton.java), [`HsToggle`](ornekler/HsToggle.java), [`HsSlider`](ornekler/HsSlider.java) | istemci | Kontroller |
| [`HsToast`](ornekler/HsToast.java), [`HsHudSayac`](ornekler/HsHudSayac.java), [`HsSesler`](ornekler/HsSesler.java) | istemci | Bildirim, HUD örneği, sesler |
| [`OrnekEkran`](ornekler/OrnekEkran.java) | istemci | Görünüm ayarları ekranı (kalıp) |
| [`HardSetupsCoreClient`](ornekler/HardSetupsCoreClient.java) | istemci | Giriş noktası: yükleyiciyi kaydeder |

Kayıt (1.21.1 için, Fabric API `fabric-resource-loader-v0`):

```java
ResourceManagerHelper.get(ResourceType.CLIENT_RESOURCES).registerReloadListener(new HsThemeLoader());
```

`HsThemeLoader`, `SimpleSynchronousResourceReloadListener`'ı uygular: `getFabricId()` + `reload(ResourceManager)`. `reload` uygulama aşamasında, oyun iş parçacığında çalışır.

**Sunucu:** tema yalnızca istemci kaynaklarından yüklenir. Adanmış sunucuda `HsTheme.current()` her zaman gömülü Kiremit'tir. Sunucudan giden sohbet mesajı bu yüzden oyuncunun yüksek kontrast seçimini bilmez; `HsChat` yalnızca her iki modda da okunan rolleri kullanır.

**Ayrık kaynak kümeleri:** Loom'da `splitEnvironmentSourceSets()` kullanıyorsan ortak sınıflar `main`, istemci sınıfları `client` kümesine gider.

## Ürün modları temayı nasıl kullanır?

`hardsetups-kumfirtinasi` ve `hardsetups-dolduroldur` için:

1. `fabric.mod.json` içinde çekirdeğe bağımlı ol: `"depends": { "hardsetups": "*" }`.
2. Yükleyici **kaydetme**. Tek yükleyici çekirdektedir; ikinci kayıt aynı dosyayı iki kez okur.
3. Rengi her karede `HsTheme.current()`'ten oku. Kopyalayıp saklama; tema F3+T ile değişebilir.
4. Temadan türeyen pahalı bir şey önbelleğe alınıyorsa (ör. önceden boyanmış doku), `HsTheme.CHANGED`'de temizle.
5. Kendi sprite, ses ve dil dosyalarını kendi ad alanında tut: `assets/hardsetups-kumfirtinasi/...`. Dil anahtarları `hardsetups.kumfirtinasi.*`.
6. Kontrolleri (`HsButton`, `HsToggle`, `HsSlider`), bildirimi (`HsToast`) ve sohbeti (`HsChat`) çekirdekten kullan. Kopyasını yazma.

### Ürüne özel vurgu kuralı

- Ürün **yeni vurgu rengi tanımlamaz.** Birincil eylem, seçili durum ve marka her üründe `accentFill` / `accentText`'tir.
- Oyunun kendi anlamı olan renkleri (takım rengi, fırtına şiddeti, eşya nadirliği) **oyun verisidir, tema değildir.** Bunlar ürün modunda ayrı bir sınıfta sabit durur (ör. `KumFirtinasiRenkleri`). `Role`'e eklenmez.
- Oyun verisi rengi yalnızca küçük gösterge olarak kullanılır: şerit, nokta, çubuk dolgusu, ikon. Yanındaki metin her zaman `textPrimary` ya da `textSecondary`'dir. Renk tek başına anlam taşımaz; yanında sözcük ya da sayı olur.
- Nadir, tek seferlik vurgu gerekiyorsa `highlight` (kor) kullanılır. Ekranda en fazla bir kez.
- Gerçekten yeni bir rol gerekiyorsa sıra şudur: önce `docs/tema/tema.json` ve `KIMLIK.md` (launcher ile birlikte), sonra `kiremit.json`, `Role`, `HsTheme.kiremit()`. Tek kaynak kuralı bozulmaz.
