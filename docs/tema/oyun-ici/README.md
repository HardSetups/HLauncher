# HardSetups oyun içi temalandırma rehberi

Bu paket, HardSetups modlarının Minecraft içindeki görünümünü launcher ve siteyle aynı kimliğe bağlar. Temanın nasıl tanımlandığını, yüklendiğini ve her arayüz bileşeninin nasıl çizileceğini anlatır.

- **Kimin için:** HardSetups modlarını yazan geliştiriciler, insan ya da kod ajanı.
- **Hangi modlar:** çekirdek `hardsetups`, ürünler `hardsetups-kumfirtinasi` ve `hardsetups-dolduroldur`.
- **Hedef:** Minecraft **1.21.1**, Fabric, **Yarn** eşlemeleri, Java 21, Fabric API `0.116.17+1.21.1`. Sürüme bağlı API'ler metinde "1.21.1 için" diye işaretli; 1.21.2+ farkı tek satırla verilir.

> Gerçek mod kaynak kodu bu depoda yok. [`ornekler/`](ornekler/) altındaki sınıflar **önerilen yapıdır** (paket `com.hardsetups.core.theme`). Hepsi Yarn 1.21.1+build.3 ve Fabric API 0.116.17+1.21.1'e karşı uyarısız derlenir. Yükleyici mantığı testlerden geçti. Oyunda görsel olarak çalıştırılmadı.

## Tema kimliği

**`hardsetups:kiremit`**: varsayılan ve tek resmi tema. "Dövülmüş grafit üstünde kiremit": koyu grafit katmanlar, tek sıcak vurgu, pahlı köşeler.

- Biçim `ad alanı:ad`. Tema dosyası bu kimlikten bulunur: `assets/hardsetups/themes/kiremit.json`.
- `hardsetups:` ad alanı resmi temalara ayrılmıştır.
- İleride varyantlar gelebilir, ör. `hardsetups:kiremit-yuksek-kontrast`. Bugün yüksek kontrast, `kiremit.json` içindeki `variants.highContrast` bloğudur ve oyuncu ayarıyla açılır.
- Launcher'da oyuncu vurgu rengini değiştirebilir. **Modlar her zaman Kiremit kullanır** ([`../KIMLIK.md`](../KIMLIK.md)).

## Hızlı başlangıç

1. **Tema dosyasını koy.** [`kiremit.json`](kiremit.json) → çekirdek modda `src/main/resources/assets/hardsetups/themes/kiremit.json`.
2. **Sınıfları al.** [`ornekler/`](ornekler/) → `com.hardsetups.core.theme`. `HardSetupsCoreClient`'ı `fabric.mod.json › entrypoints.client` listesine ekle. Tema yükleyicisini yalnızca çekirdek kaydeder.
3. **Rengi rolden al.** `HsTheme.current().color(Role.ACCENT_FILL)` (ARGB, çizim için) ya da `.rgb(Role.ACCENT_TEXT)` (metin stili için). Kodda hex yazma.
4. **Hazır parçaları kullan.** Kutu `HsDraw.surface/card/box`, düğme `HsButton`, anahtar `HsToggle`, kaydırıcı `HsSlider`, bildirim `HsToast.show(...)`, sohbet `HsChat.message(...)`, ses `HsSesler.ui(...)`. Ekran kalıbı: [`OrnekEkran`](ornekler/OrnekEkran.java).
5. **Kabul et.** Her ekranı [05 · Kontrol listesi](05-kontrol-listesi.md) ile sına: GUI ölçeği 1–4 + Otomatik, Unicode yazı tipi, Türkçe karakterler, anlatıcı, F3+T.

## Dizin

| Dosya | İçerik |
|---|---|
| [01-kimlik.md](01-kimlik.md) | Renk rolleri (hex + ARGB), kontrast ölçümleri, vanilya arka planları, `§` yedek tablosu, yazı, pahlı köşe, 4 px ızgara, hareket, ses ve dil tonu |
| [02-tema-yapilandirma.md](02-tema-yapilandirma.md) | Tema tanım dosyası, oyuncu ayarı `config/hardsetups/tema.json`, yükleme sırası, F3+T, hatalı JSON'da geri dönüş, `HsTheme` API'si, ürün modlarının kullanımı |
| [03-arayuz-bilesenleri.md](03-arayuz-bilesenleri.md) | Ekran, panel, düğme, metin, kaydırıcı, anahtar, HUD, toast, başlık/altyazı, boss bar, sohbet, ipucu, sesler, durum renkleri, sprite piksel kuralları |
| [04-kaynak-paketi.md](04-kaynak-paketi.md) | Resmi dosyaların ve ezme paketinin yol ağacı, `pack.mcmeta` (34), dil dosyaları ve anahtar kuralı, başlık yazı tipi, izinler ve yasaklar |
| [05-kontrol-listesi.md](05-kontrol-listesi.md) | Ekran başına kabul listesi: görünüm, erişilebilirlik, metin, teknik |
| [kiremit.json](kiremit.json) | Oyun içi tema tanımının tam örneği |
| [ornekler/](ornekler/) | `Role`, `HsTheme`, `HsThemeLoader`, `TemaAyarlari`, `HsDraw`, `HsButton`, `HsToggle`, `HsSlider`, `HsToast`, `HsChat`, `HsHudSayac`, `HsSesler`, `Durum`, `OrnekEkran`, `HardSetupsCoreClient` |

## Launcher ile ilişki

Değerlerin tek kaynağı [`../tema.json`](../tema.json); anlamları [`../KIMLIK.md`](../KIMLIK.md)'de. Bu paket yeni renk uydurmaz; o değerleri oyuna çevirir. Yalnızca beş rol oyuna özgü türetilmiştir (`edgeLight`, `shadow`, `hudPanel`, `scrim`, `accentWeak`) ve kaynakları `kiremit.json › $source` içinde yazılıdır.

| Launcher | Oyun içi |
|---|---|
| Katmanlar: `--bg` çerçeve, `--surface` içerik, `--raised*` kartlar | `background` → `surface` → `raised` / `raised2` |
| Tek vurgu, yalnızca birincil eylem ve seçili durum | `accentFill` / `accentText`, aynı kural; ekranda tek birincil düğme |
| `corner-shape: bevel` (kontrol 5 px, panel 8 px) | 1 texel pah, her kutunun dört köşesinde |
| Kart üst kenarında `rgba(255,255,255,0.05)` ışık çizgisi | `edgeLight` = `0x0DFFFFFF`, kenarın altındaki 1 px sıra |
| Oyna düğmesi: dolu vurgu + ince, sert alt gölge | Birincil düğme: `accentFill` + `accentFillPressed` alt kenar |
| Chakra Petch başlık, Segoe UI Variable arayüz | Kalın vanilya başlık (`accentText`), vanilya `minecraft:default` gövde; isteğe bağlı başlık yazı tipi |
| Hareket 120–260 ms, `prefers-reduced-motion` | `motionMs(...)`, oyuncu ayarı `azaltilmisHareket` |
| Cümle düzeni, büyük harfli etiket yok, emoji ikon yok | Aynı |

Değişiklik akışı: `tema.json` değişirse `KIMLIK.md`, `kiremit.json` ve `HsTheme.kiremit()` birlikte güncellenir. Üçü birebir aynı kalır; `version` artar.

Launcher'ın oyun klasöründe dokunduğu tek ayar dosyası `config/hardsetups/ayarlar.json`'dur: lisans anahtarını düz anahtarlarla (`lisans.anahtar.kumfirtinasi`) birleştirir. Tema tercihi bu yüzden ayrı dosyadadır: `config/hardsetups/tema.json`. Gerekçe: [02 › Neden ayarlar.json'dan ayrı?](02-tema-yapilandirma.md#neden-ayarlarjsondan-ayrı)

## Doğrulama

**Nasıl doğrulandı:**

1. **Derleme.** `ornekler/` sınıfları yerel bir Fabric Loom projesinde (Loom 1.11.8) Minecraft 1.21.1 + Yarn `1.21.1+build.3` + Fabric API `0.116.17+1.21.1` ile `-Xlint:all` açıkken uyarısız derlendi.
2. **Birim testi.** `HsThemeLoader.compose` gerçek sınıflarla çalıştırıldı: kiremit.json = gömülü değerler, kısmi ezme, yüksek kontrast varyantı, kontrast bekçisi, `#RRGGBBAA` reddi, `hudPanel` alfa sınırı, saydam metin reddi, bozuk JSON. 12/12 geçti.
3. **Değer eşleşmesi.** `kiremit.json`, `HsTheme.kiremit()` ve `../tema.json` betikle karşılaştırıldı: 25 rolün hepsi aynı.
4. **Jar incelemesi.** Yarn eşlemeli 1.21.1 jar'ı `javap` ile okundu: `Screen.render` önce `renderBackground`'ı çağırır; `renderBackground` = panorama (dünya yoksa) + bulanıklık + karartma; bulanıklık 0–10, varsayılan 5; `renderBlur` 1.21.1'de çift çağrıda hata atmaz; `DrawContext.fill` hemen çizer (`tryDraw`); `drawGuiTexture` karışımı açmaz ve `position_tex` alfa 0'ı atar; `Window.calculateScaleFactor` 320×240 sınırı; `TextRenderer.tweakTransparency`; `Toast.getRequiredSpaceCount` = `ceilDiv(h, 32)`; toast sesi `ToastManager`'da çalar; ses örneği `SoundEvent.getId()` ile bulunur; yüksek kontrast seçeneği `high_contrast` paketini açıp kaynakları yeniden yükler; `Formatting` 16 renk değeri; `BossBar.Color`; ipucu zemini/kenar sabitleri; `Tooltip` satır genişliği 170; varsayılan başlık süresi 10/70/20; `%%` kaçışı; GUI atlası `gui/sprites` dizin kaynağı; Türkçe glifler `accented.png`'de (ascent 10, height 12).

**Kaynaklar:**

- Yarn 1.21.1 javadoc: [DrawContext](https://maven.fabricmc.net/docs/yarn-1.21.1+build.3/net/minecraft/client/gui/DrawContext.html), [Toast](https://maven.fabricmc.net/docs/yarn-1.21.1+build.3/net/minecraft/client/toast/Toast.html), [ButtonTextures](https://maven.fabricmc.net/docs/yarn-1.21.1+build.3/net/minecraft/client/gui/screen/ButtonTextures.html), [Identifier](https://maven.fabricmc.net/docs/yarn-1.21.1+build.3/net/minecraft/util/Identifier.html), [TextColor](https://maven.fabricmc.net/docs/yarn-1.21.1+build.3/net/minecraft/text/TextColor.html), [Style](https://maven.fabricmc.net/docs/yarn-1.21.1+build.3/net/minecraft/text/Style.html), [ResourceManager](https://maven.fabricmc.net/docs/yarn-1.21.1+build.3/net/minecraft/resource/ResourceManager.html), [Screen](https://maven.fabricmc.net/docs/yarn-1.21.1+build.3/net/minecraft/client/gui/screen/Screen.html), [GameOptions](https://maven.fabricmc.net/docs/yarn-1.21.1+build.3/net/minecraft/client/option/GameOptions.html)
- Yarn 1.21.3 javadoc (1.21.2+ farkları): [DrawContext](https://maven.fabricmc.net/docs/yarn-1.21.3+build.2/net/minecraft/client/gui/DrawContext.html), [Toast](https://maven.fabricmc.net/docs/yarn-1.21.3+build.2/net/minecraft/client/toast/Toast.html)
- Fabric API 1.21.1 kaynağı: [HudRenderCallback](https://github.com/FabricMC/fabric/blob/1.21.1/fabric-rendering-v1/src/client/java/net/fabricmc/fabric/api/client/rendering/v1/HudRenderCallback.java), [SimpleSynchronousResourceReloadListener](https://github.com/FabricMC/fabric/blob/1.21.1/fabric-resource-loader-v0/src/main/java/net/fabricmc/fabric/api/resource/SimpleSynchronousResourceReloadListener.java), [ResourceManagerHelper](https://github.com/FabricMC/fabric/blob/1.21.1/fabric-resource-loader-v0/src/main/java/net/fabricmc/fabric/api/resource/ResourceManagerHelper.java)
- [Fabric for Minecraft 1.21.6](https://fabricmc.net/2025/06/15/1216.html) (HUD API'si `HudElementRegistry` oldu)
- Minecraft Wiki: [Pack format](https://minecraft.wiki/w/Pack_format) (1.21–1.21.1 = 34), [Resource pack › GUI](https://minecraft.wiki/w/Resource_pack) (nine-slice), [Font](https://minecraft.wiki/w/Font), [Sounds.json](https://minecraft.wiki/w/Sounds.json), [tooltip_style](https://minecraft.wiki/w/Data_component_format/tooltip_style)
- [Minecraft Snapshot 24w36a](https://www.minecraft.net/en-us/article/minecraft-snapshot-24w36a) (`stretch_inner`, 1.21.2)
- 1.21.1 vanilya dokuları: [minecraft-assets 1.21.1](https://github.com/InventivetalentDev/minecraft-assets/tree/1.21.1/assets/minecraft) (`widget/*.png.mcmeta`, `font/include/default.json`)

**Doğrulanmadı:**

- Sınıflar gerçek bir istemcide çalıştırılıp ekranda görülmedi. Piksel sonucu (pah, üst ışık, toast yerleşimi) ilk entegrasyonda gözle kontrol edilmeli.
- 1.21.2+ davranışları yalnızca yükseltme notu düzeyindedir. "Can only blur once per frame" çökmesi sonraki sürümlerin hata kayıtlarından bilinir. Sıfır alfalı metnin sonraki sürümlerde görünmez olması doğrulanmadı; bu yüzden kural "her zaman tam ARGB ver"dir.
- Mod kaynaklarının kullanıcı kaynak paketlerinin altında yüklenmesi Fabric'in bilinen davranışıdır, bu çalışmada ayrıca ölçülmedi.
