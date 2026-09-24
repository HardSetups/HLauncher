# 03 · Arayüz bileşenleri

Her bileşen için ölçü, roller ve 1.21.1 kodu. Ölçüler GUI pikselidir (bkz. [01 › 4 px ızgara](01-kimlik.md#4-px-ızgara-ve-gui-ölçeği)). Kod parçaları [`ornekler/`](ornekler/) sınıflarından alınmıştır.

İçindekiler: [Çizim temeli](#çizim-temeli-pahlı-kutu) · [Ekran](#ekran-screen) · [Panel ve kart](#panel-ve-kart) · [Düğme](#düğme) · [Metin](#metin) · [Kaydırıcı ve anahtar](#kaydırıcı-ve-anahtar) · [HUD](#hud-öğeleri) · [Toast](#toast-bildirimleri) · [Başlık ve altyazı](#başlık-ve-altyazı) · [Boss bar](#boss-bar) · [Sohbet](#sohbet-mesajı) · [Tooltip](#tooltip-ipucu-kutusu) · [Sesler](#sesler) · [Durum renkleri](#durum-renkleri) · [Sprite piksel kuralları](#sprite-piksel-kuralları)

## Çizim temeli: pahlı kutu

Bütün kutular (panel, kart, düğme, anahtar izi, HUD paneli, toast) aynı anatomiyi kullanır:

```
  0 1 2 3 4 5 6 7        . = boş (pah; saydam)
0 . K K K K K K .        K = kenar, 1 px
1 K I I I I I I K        I = üst ışık (edgeLight, dolgunun üstüne)
2 K D D D D D D K        D = dolgu
3 K D D D D D D K        A = alt kenar ("gölge tarafı")
4 K D D D D D D K
5 K D D D D D D K
6 K D D D D D D K
7 . A A A A A A .
```

**Varsayılan yol koddur**, sprite değil. `HsDraw.box` bu şekli 6 `fill` çağrısıyla çizer:

- Renkler temadan gelir. Kaynak paketinin JSON'u, yüksek kontrast ve F3+T hemen yansır.
- Kontrast bekçisi renkleri denetleyebilir; sprite pikseli denetlenemez.
- Doku atlası araması yok, nesne üretimi yok.

Kaynak paketi aynı adla bir nine-slice sprite koyarsa o çizilir (yüksek kontrast açıkken hariç). Bkz. [Sprite piksel kuralları](#sprite-piksel-kuralları).

```java
// HsDraw.box — köşe pikselleri hiç boyanmaz: pah
public static void box(DrawContext ctx, int x, int y, int w, int h, int fill, int edge, int bottom) {
    int r = x + w, b = y + h;
    ctx.fill(x + 1, y + 1, r - 1, b - 1, fill);      // dolgu
    ctx.fill(x + 1, y, r - 1, y + 1, edge);          // üst kenar
    ctx.fill(x, y + 1, x + 1, b - 1, edge);          // sol
    ctx.fill(r - 1, y + 1, r, b - 1, edge);          // sağ
    ctx.fill(x + 1, b - 1, r - 1, b, bottom);        // alt kenar
    ctx.fill(x + 1, y + 1, r - 1, y + 2, HsTheme.current().color(Role.EDGE_LIGHT)); // üst ışık
}
```

`fill(x1, y1, x2, y2, argb)`: sağ ve alt sınırlar dahil değildir. 1.21.1'de her `fill` hemen çizilir, sıra korunur. Yüzlerce kutu çizen bir listede çağrıları `ctx.draw(() -> { ... })` içine al.

| Bileşen | Dolgu | Kenar | Alt kenar |
|---|---|---|---|
| Yüzey paneli | `surface` | `line` | `line` |
| Kart | `raised` | `line` | `line` |
| HUD paneli | `hudPanel` | `line` | `line` |
| Toast | `raised` | `lineStrong` | `lineStrong` |
| Birincil düğme | `accentFill` | `accentFill` | `accentFillPressed` |
| Birincil düğme, odak | `accentFill` | `accentText` | `accentText` |
| İkincil düğme | `raised2` | `lineStrong` | `lineStrong` |
| İkincil düğme, odak | `raised2` | `accentText` | `accentText` |
| Pasif düğme | `raised` | `line` | `line` |

Yüzen öğelerin (toast, açılır panel, modal) altına `HsDraw.dropShadow` ile 1 px `shadow` çizgisi eklenir. Satır içi kartlara gölge konmaz.

## Ekran (Screen)

```
┌ vanilya arka planı (bulanıklık + karartma) ─────────────────┐
│          ┌ yüzey paneli 240 × H ─────────────┐              │
│          │ 12                                │              │
│          │ Görünüm              ← başlık y+12│              │
│          │                                   │              │
│          │ [kontrol 20]         ← y+32       │              │
│          │ [kontrol 20]         ← +24        │              │
│          │ …                                 │              │
│          │               [ Bitti ] ← sağ alt │              │
│          │                                12 │              │
│          └───────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

- **Panel:** genişlik 240 (4'ün katı; 320 px en küçük ekrana her yandan 40 px boşlukla sığar). Ortalanır; üstten en az 8 px.
- **İç boşluk** 12. Başlık `y + 12`. İlk kontrol `y + 32`. Kontroller 24 px adımla (20 + 4).
- **Alt düğmeler:** sağ altta. Birincil en sağda, ikincil solunda, aralarında 8 px. Bir ekranda tek birincil düğme.
- **Arka plan:** vanilyanınkini değiştirme; üstüne panel çiz. 1.21.1'de `Screen.render` önce `renderBackground`, sonra widget'ları çizer (jar'dan doğrulandı). Paneli `renderBackground` içinde çizersen widget'ların altında kalır.
- `renderBackground`'ı kare başına **bir kez** çağır. `super.render` zaten çağırır. İki kez çağırmak 1.21.1'de karartmayı ve bulanıklığı ikiler. Sonraki sürümlerde "Can only blur once per frame" hatasıyla çöker.
- Konumları `init()` içinde hesapla. Pencere boyutu değişince `init()` yeniden çağrılır.
- Metinleri (ör. kalın başlık) `init()`'te bir kez üret, `render`'da üretme.

```java
@Override
protected void init() {
    heading = getTitle().copy().formatted(Formatting.BOLD);
    px = (width - PANEL_W) / 2;
    py = Math.max(8, (height - PANEL_H) / 2);
    addDrawableChild(new HsButton(px + PANEL_W - PAD - 96, py + PANEL_H - PAD - 20, 96, 20,
            ScreenTexts.DONE, HsButton.Kind.PRIMARY, button -> close()));
}

@Override
public void renderBackground(DrawContext ctx, int mouseX, int mouseY, float delta) {
    super.renderBackground(ctx, mouseX, mouseY, delta);   // vanilya: bulanıklık + karartma
    HsDraw.surface(ctx, px, py, PANEL_W, PANEL_H);
    HsDraw.dropShadow(ctx, px, py, PANEL_W, PANEL_H);
}

@Override
public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
    super.render(ctx, mouseX, mouseY, delta);             // renderBackground + widget'lar
    ctx.drawText(textRenderer, heading, px + PAD, py + PAD, HsTheme.current().color(Role.ACCENT_TEXT), false);
}
```

**Ekran içi modal** (onay kutusu gibi): ekranın tamamına `scrim` doldur, üstüne ortada yüzey paneli + gölge. Modal açıkken arkadaki widget'lar tıklanmaz.

## Panel ve kart

| | Panel (yüzey) | Kart |
|---|---|---|
| Çağrı | `HsDraw.surface(ctx, x, y, w, h)` | `HsDraw.card(ctx, x, y, w, h)` |
| Roller | `surface` + `line` | `raised` + `line` |
| İç boşluk | 12 | 8 |
| Başlık | kalın `accentText` | `textPrimary` (kalın değil) |
| Gölge | yüzüyorsa `dropShadow` | yok |

Kart, panelin içinde bir kat üsttür. Kartın içine kart konmaz. Seçili kart: kenar `accentText`, zemin `accentWeak` karışımı (dolguyu çiz, üstüne `accentWeak` doldur).

## Düğme

| Ölçü | Değer |
|---|---|
| Yükseklik | 20 (vanilya) |
| Genişlik | 96 standart, 48 küçük, ya da panel iç genişliği; hep 4'ün katı |
| Metin | ortalanır; sığmazsa vanilya gibi kayar (`drawScrollableText`) |

| Hâl | Dolgu | Kenar / alt kenar | Metin |
|---|---|---|---|
| Birincil | `accentFill` | `accentFill` / `accentFillPressed` | `onAccentFill` |
| Birincil, üzerine gelme ya da klavye odağı | `accentFill` | `accentText` (odak halkası) | `onAccentFill` |
| İkincil | `raised2` | `lineStrong` | `textPrimary` |
| İkincil, odak | `raised2` | `accentText` | `textPrimary` |
| Pasif | `raised` | `line` | `textTertiary` |

`HsButton`, `ButtonWidget`'tan türer. Tıklama, Enter/Boşluk, tık sesi ve anlatıcı vanilyadan gelir. Yalnızca `renderWidget` değişir:

```java
public class HsButton extends ButtonWidget {
    public HsButton(int x, int y, int width, int height, Text message, Kind kind, PressAction onPress) {
        super(x, y, width, height, message, onPress, DEFAULT_NARRATION_SUPPLIER);
        this.kind = kind;
    }

    @Override
    protected void renderWidget(DrawContext ctx, int mouseX, int mouseY, float delta) {
        boolean hot = active && isSelected();            // üzerine gelme ya da odak
        Identifier sprite = (kind == Kind.PRIMARY ? HsDraw.BUTTON_PRIMARY : HsDraw.BUTTON_SECONDARY).get(active, hot);
        if (HsDraw.useSprite(sprite)) HsDraw.drawSprite(ctx, sprite, getX(), getY(), getWidth(), getHeight());
        else { /* HsDraw.box(...) — tablodaki roller */ }
        drawScrollableText(ctx, MinecraftClient.getInstance().textRenderer, 2, HsTheme.current().color(textRole));
    }
}
```

`ButtonTextures` (1.21.1, `net.minecraft.client.gui.screen`): `new ButtonTextures(enabled, disabled, enabledFocused)` ve `get(boolean enabled, boolean focused)`. Vanilya `PressableWidget` de aynı kalıpla çizer.

## Metin

| Tür | Rol | Stil | Gölge |
|---|---|---|---|
| Ekran başlığı | `accentText` | kalın (`Formatting.BOLD`) | yok |
| Kart ya da toast başlığı | `textPrimary` | normal | yok |
| Gövde | `textPrimary` | normal | yok |
| Açıklama, etiket | `textSecondary` | normal | yok |
| İpucu, pasif | `textTertiary` | normal; yalnızca `surface` ya da daha koyu zeminde | yok |
| Bağlantı | `accentText`, üzerine gelince `accentTextHover` | normal | yok |

```java
ctx.drawText(textRenderer, metin, x, y, HsTheme.current().color(Role.TEXT_PRIMARY), false);
```

- `drawText(TextRenderer, Text, x, y, argb, shadow)`. Buradaki renk varsayılandır; `Text` üstündeki `Style` rengi onu ezer.
- Rengi her zaman tam ARGB ver (`0xFF…`). 1.21.1 alfası neredeyse 0 olan rengi opak sayar (`TextRenderer.tweakTransparency`); sonraki sürümlerde bu davranışa güvenme.
- Uzun metin: `textRenderer.wrapLines(text, genislik)` → `List<OrderedText>`. Sonucu `init()`'te ya da metin değişince hesapla, her karede değil.
- Satır adımı 10. Türkçe büyük harfler için metnin üstünde 3 px boşluk bırak.

## Kaydırıcı ve anahtar

### Kaydırıcı

Vanilya düzeni korunur: 20 yüksek iz, 8 px tutamak, metin ortada (ör. "HUD ölçeği: %125").

| Parça | Rol |
|---|---|
| İz | dolgu `raised`, kenar `lineStrong` (odakta `accentText`) |
| Dolu kısım | `accentWeak` |
| Tutamak | dolgu `accentFill`, alt kenar `accentFillPressed`; pasifken `raised2` |
| Metin | `textPrimary`; pasifken `textTertiary` |

`HsSlider`, `SliderWidget`'tan türer (1.21.1'de `renderWidget` public'tir). Alt sınıf `updateMessage()` ve `applyValue()` yazar. Değeri bölümlere yuvarla (ör. 0,25 adım): `0.5f + Math.round(value * 6) * 0.25f`.

### Anahtar (aç/kapa)

Satır düzeni: etiket solda, "Açık/Kapalı" sözcüğü ve iz sağda. Launcher'daki ayar satırıyla aynı: etiket solda, kontrol sağda.

```
Yüksek kontrast                     Açık [▓▓▓▓▓▓▓▓▓▓▓▓ ■]
|← satır genişliği, yükseklik 20 →|         iz 24 × 12, topuz 8 × 8
```

| Hâl | İz dolgu / kenar | Topuz | Sözcük |
|---|---|---|---|
| Kapalı | `raised2` / `lineStrong` | solda, `textSecondary` | "Kapalı" (`ScreenTexts.OFF`) |
| Açık | `accentFill` / `accentFill`, alt `accentFillPressed` | sağda, `onAccentFill` | "Açık" (`ScreenTexts.ON`) |
| Odak | kenar `accentText` | — | — |

Durum renkle değil; topuzun yeri ve sözcükle de belli olur. Anlatıcı "Yüksek kontrast: Açık" der (`getNarrationMessage` ezilir). Vanilya `CyclingButtonWidget.onOffBuilder(...)` da kullanılabilir, ama çizimi vanilya düğmesidir.

## HUD öğeleri

1.21.1 için kayıt: `HudRenderCallback.EVENT.register((DrawContext ctx, RenderTickCounter tick) -> { ... })`. 1.21.6+'da yerini `HudElementRegistry` aldı.

**Yerleşim:** vanilya öğeleriyle çakışma.

| Bölge | Vanilya | HardSetups |
|---|---|---|
| Sol üst | F3 hata ayıklama ekranı | **Varsayılan yer** (4, 4). F3 açıkken gizlen |
| Üst orta | Boss bar | Kullanma |
| Sağ üst | Toast'lar, etki simgeleri | Kullanma |
| Sağ orta | Skor tablosu | Kullanma |
| Orta | Başlık/altyazı, nişangâh | Kullanma |
| Alt orta | Hotbar, can, açlık, eylem çubuğu | Kullanma |
| Sol alt | Sohbet | Kullanma |
| Sağ alt | Altyazılar (ses) | Kullanma |

**Ölçü ve roller:** panel 20 yüksek, yatay iç boşluk 8, `hudPanel` dolgu + `line` kenar. Etiket `textSecondary`, değer `textPrimary`. Ekran kenarından 4 px. Birden fazla HUD paneli alt alta 4 px arayla.

**Kurallar:**

- F1 (`options.hudHidden`), F3 (`inGameHud.getDebugHud().shouldShowDebugHud()`) ve oyuncu yokken çizme.
- Oyuncunun HUD ölçeğini uygula ve piksel hizasına yuvarla: `HsDraw.hudScale(mc)`.
- **Kare başına nesne üretme.** Metni ve genişliği yalnızca değer değişince yeniden oluştur.
- Uyarı rengi ek bilgidir: son 10 saniyede değer `warning` olur, ama bilgi sayının kendisindedir.

```java
@Override
public void onHudRender(DrawContext ctx, RenderTickCounter tickCounter) {
    MinecraftClient mc = MinecraftClient.getInstance();
    if (mc.player == null || mc.options.hudHidden || mc.inGameHud.getDebugHud().shouldShowDebugHud()) return;
    int seconds = secondsLeft.getAsInt();
    if (seconds < 0) return;
    if (seconds != lastSeconds) {                     // yalnızca değişince üret
        lastSeconds = seconds;
        valueText = Text.literal(String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60));
        width = PAD_X + mc.textRenderer.getWidth(LABEL) + 4 + mc.textRenderer.getWidth(valueText) + PAD_X;
    }
    float scale = HsDraw.hudScale(mc);
    MatrixStack m = ctx.getMatrices();
    m.push();
    m.translate(MARGIN, MARGIN, 0f);
    m.scale(scale, scale, 1f);
    HsDraw.panel(ctx, HsDraw.HUD_PANEL, 0, 0, width, HEIGHT, Role.HUD_PANEL, Role.LINE);
    // … etiket ve değer: drawText(..., false)
    m.pop();
}
```

Tam sınıf: [`HsHudSayac.java`](ornekler/HsHudSayac.java).

## Toast bildirimleri

| Ölçü | Değer |
|---|---|
| Genişlik | 160 (vanilya) |
| Yükseklik | 32 (1 satır gövde), 42 (2 satır); en fazla 2 satır |
| Durum şeridi | solda 2 px (`x 2–4`), durum rengi |
| Başlık | (10, 7), `textPrimary` |
| Gövde | (10, 18 + 10·i), `textSecondary` |
| Süre | 5 sn × Erişilebilirlik › Bildirim süresi çarpanı |
| Kutu | `raised` + `lineStrong` |

- Başlık durumu sözle söyler ("Kaydedilemedi", "Bağlantı kuruldu"). Şerit yalnızca destekler.
- Gövde yapıcıda (`wrapLines`) bir kez satırlara bölünür.
- Gösterirken anlatıcıya da ver: `mc.getNarratorManager().narrate(...)`.
- Toast sesini vanilya kendisi çalar. Üstüne ek ses çalma.
- Her iş parçacığından çağrılabilir: `HsToast.show(...)` işi `mc.execute` ile istemci iş parçacığına taşır.

```java
HsToast.show(Durum.BASARI,
        Text.translatable("hardsetups.cekirdek.toast.kaydedildi.baslik"),
        Text.translatable("hardsetups.cekirdek.toast.kaydedildi.govde"));
```

1.21.1 `Toast` arayüzü: `Visibility draw(DrawContext, ToastManager, long startTime)`, `getWidth()`, `getHeight()`; `getRequiredSpaceCount()` = `ceilDiv(getHeight(), 32)`. 1.21.2+'da arayüz değişti: `update(ToastManager, long)` + `getVisibility()` + `draw(DrawContext, TextRenderer, long)`.

## Başlık ve altyazı

Ekranın ortasındaki büyük metin. Yalnızca büyük anlar için: tur başladı, tur bitti, bölüm tamamlandı. Dakikada birden sık kullanma.

- Başlık `textPrimary`, kalın. Altyazı `textSecondary`. Vurgu gerekiyorsa altyazıda tek sözcük `accentText`. Dünya üstünde kiremit okunmayabilir (gökyüzünde 1,3:1); vanilya gölgesi yardım eder ama başlığın tamamını kiremit yapma.
- Süre: giriş 10, kalış 50, çıkış 10 tick (0,5 / 2,5 / 0,5 sn). Vanilya varsayılanı 10 / 70 / 20.

İstemcide (1.21.1):

```java
InGameHud hud = MinecraftClient.getInstance().inGameHud;
HsTheme t = HsTheme.current();
hud.setTitleTicks(10, 50, 10);
hud.setSubtitle(Text.translatable("hardsetups.kumfirtinasi.baslik.tur_alt", tur)
        .styled(s -> s.withColor(t.rgb(Role.TEXT_SECONDARY))));
hud.setTitle(Text.translatable("hardsetups.kumfirtinasi.baslik.tur_basladi")
        .styled(s -> s.withColor(t.rgb(Role.TEXT_PRIMARY)).withBold(true)));
```

Sunucudan (`net.minecraft.network.packet.s2c.play`):

```java
player.networkHandler.sendPacket(new TitleFadeS2CPacket(10, 50, 10));
player.networkHandler.sendPacket(new SubtitleS2CPacket(altyazi));
player.networkHandler.sendPacket(new TitleS2CPacket(baslik));
```

Eylem çubuğu (hotbar üstündeki kısa metin): istemcide `inGameHud.setOverlayMessage(text, false)`, sunucuda `player.sendMessage(text, true)`.

## Boss bar

Vanilya boss bar'ı yalnızca 7 sabit renk çizer: `BossBar.Color` = PINK, BLUE, RED, GREEN, YELLOW, PURPLE, WHITE. Kiremit yoktur.

- Oyun ilerlemesi için boss bar gerekiyorsa: `BossBar.Color.RED`, `BossBar.Style.PROGRESS`. Adı `textPrimary` rengiyle ver (ad metni RGB renk alır).
- Tam Kiremit görünüm gerekiyorsa vanilya boss bar'ını **kullanma**. Kendi HUD çubuğunu çiz: `hudPanel` kutu, içinde `raised2` iz ve `accentFill` dolgu, üstte `textPrimary` ad. Yerleşim üst orta, boss bar bölgesinde; ikisi aynı anda görünmez.
- Vanilya boss bar'ını mixin ile yeniden boyama. Başka modların ve vanilyanın boss bar'larını da değiştirir.

## Sohbet mesajı

Biçim: `[HardSetups] mesaj`. Parantezler `textSecondary`, "HardSetups" `accentText`, gövde `textPrimary`. Durum mesajında önekten sonra kalın durum sözcüğü ve iki nokta gelir: `[HardSetups] Hata: Lisans doğrulanamadı. Launcher'dan yeniden giriş yap.`

```java
public static MutableText prefix() {
    HsTheme t = HsTheme.current();
    int bracket = t.rgb(Role.TEXT_SECONDARY);
    return Text.empty()
            .append(Text.literal("[").styled(s -> s.withColor(bracket)))
            .append(Text.literal("HardSetups").styled(s -> s.withColor(t.rgb(Role.ACCENT_TEXT))))
            .append(Text.literal("] ").styled(s -> s.withColor(bracket)));
}
```

- `Style.withColor(int)` RGB alır; alfa vermek için değil. `HsTheme.rgb(...)` alfayı atar. Eşdeğeri: `Style.withColor(TextColor.fromRgb(rgb))`.
- Gövde çevrilebilir olsun: `Text.translatable("hardsetups.kumfirtinasi.sohbet.tur_basladi")`. İstemci kendi dilinde çözer.
- Dil dosyası olmayan istemciye gidebilecek metinde yedek ver: `Text.translatableWithFallback(anahtar, "Türkçe yedek")`.
- Gönderme: istemcide `mc.player.sendMessage(HsChat.message(t), false)`, sunucuda `serverPlayer.sendMessage(HsChat.message(t))`.
- Sohbet zemini oyuncu ayarıdır ve dünyanın üstündedir. Renkli kısmı kısa tut (önek, durum sözcüğü); gövde `textPrimary`.
- Önek her üründe aynıdır. Ürün adı gerekiyorsa gövdeye yazılır: `[HardSetups] Kum Fırtınası: Tur 3 başladı.`

## Tooltip (ipucu kutusu)

1.21.1'de vanilya ipucu kutusu sabit renklerle çizilir (`TooltipBackgroundRenderer`: zemin `0xF0100010`, kenar `0x505000FF` → `0x5028007F`, jar'dan doğrulandı). Renkler için doku ya da tema kancası yok.

- Widget ipuçları vanilya kalır: `widget.setTooltip(Tooltip.of(icerik, anlaticiMetni))`. Konumlandırma, satır kaydırma (170 px) ve anlatıcı hazır gelir.
- **Vanilya ipucunu mixin ile yeniden boyama.** Oyundaki bütün eşya ve mod ipuçlarını değiştirir.
- İçerik bizimdir: ilk satır `textPrimary`, ayrıntı satırları `textSecondary`, durum sözcüğü durum renginde.
- Kendi çizdiğimiz yüzey üstünde (HUD, özel liste) bilgi kutusu gerekiyorsa: `HsDraw.box` ile `raised` + `lineStrong` + `dropShadow`, iç boşluk 4, z sırası için `ctx.getMatrices().translate(0, 0, 400)`.
- 1.21.2+ farkı: ipucu zemini ve çerçevesi sprite oldu (`tooltip/background`, `tooltip/frame`) ve eşyaya `tooltip_style` bileşeniyle özel stil verilebiliyor. Yükseltmede `hardsetups:kiremit` stili buradan tanımlanabilir.

## Sesler

`assets/hardsetups/sounds.json`:

```json
{
  "ui.bildirim": {
    "subtitle": "hardsetups.cekirdek.ses.bildirim",
    "sounds": [{ "name": "hardsetups:ui/bildirim", "volume": 0.6 }]
  },
  "ui.basari": {
    "subtitle": "hardsetups.cekirdek.ses.basari",
    "sounds": [{ "name": "hardsetups:ui/basari", "volume": 0.6 }]
  },
  "ui.hata": {
    "subtitle": "hardsetups.cekirdek.ses.hata",
    "sounds": [{ "name": "hardsetups:ui/hata", "volume": 0.6 }]
  }
}
```

- Dosyalar: `assets/hardsetups/sounds/ui/bildirim.ogg` (Ogg Vorbis). `name` uzantısız yazılır.
- Arayüz sesi konumsuzdur: stereo olabilir. Dünyada konumlu çalacak ses mono olmalı (stereo ses mesafeyle azalmaz).
- Kısa (400 ms altı), yumuşak başlangıç, `volume` en fazla 0,6. Her üzerine gelmede ses yok.
- `subtitle` her seste olsun: Altyazıları göster açık oyuncu sesi yazıyla görür.

```java
public static final SoundEvent BILDIRIM = SoundEvent.of(Identifier.of("hardsetups", "ui.bildirim"));

public static void ui(SoundEvent sound) {
    MinecraftClient.getInstance().getSoundManager().play(PositionedSoundInstance.master(sound, 1.0f, 0.6f));
}
```

`PositionedSoundInstance.master(SoundEvent, pitch, volume)`. Yalnızca istemcide çalan arayüz sesi için kayıt gerekmez: 1.21.1'de ses örneği `SoundEvent.getId()` ile `sounds.json`'dan bulunur (jar'dan doğrulandı). Dünyada çalan ya da sunucudan tetiklenen ses ise `Registry.register(Registries.SOUND_EVENT, id, SoundEvent.of(id))` ile kaydedilir.

## Durum renkleri

| Durum | Rol | Sözcük (`Durum`) | Nerede |
|---|---|---|---|
| Bilgi | `info` | "Bilgi" | Nötr haber: yeni sürüm var, bağlanılıyor |
| Başarı | `success` | "Tamam" | İşlem bitti: kaydedildi, lisans doğrulandı |
| Uyarı | `warning` | "Uyarı" | Dikkat, ama devam edebilirsin: süre azalıyor, bağlantı yavaş |
| Hata | `danger` | "Hata" | İşlem olmadı: ne oldu + ne yapmalı |

- **Durumu yalnızca renkle bildirme.** Her durumda sözcük, ikon ya da sayı da olur. Renk körü oyuncu da anlamalı.
- Durum renkleri metin olarak yalnızca `surface` ya da daha koyu zeminde (`danger` kartta 4,3:1). Kartta, toast'ta ve düğmede şerit, nokta ya da ikon olarak kullan; metin `textPrimary`.
- Durum rengi süs değildir. Başlık, kenar ya da düğme rengi olarak kullanılmaz.
- Yıkıcı eylem (sil, kaldır) her zaman bir onay adımından geçer. Onaydaki düğme yine birincil düğmedir ve tehlikeyi metinle söyler ("Dünyayı sil"). Durum rengi düğme dolgusu olmaz.
- Hata metni kalıbı: `Durum.HATA` + "ne oldu." + "ne yapmalı." Aynı metin sohbette (`HsChat.status`) ve toast'ta (`HsToast.show`) kullanılabilir.

## Sprite piksel kuralları

Sprite, kaynak paketinin kod çizimini ezmesi ya da ürüne özel çerçeveler için kullanılır. Kod çizimiyle aynı anatomiye uyar.

**Yer:** `assets/<ad alanı>/textures/gui/sprites/<yol>.png`. Kimlik `<ad alanı>:<yol>` olur (`textures/gui/sprites/` ve `.png` yazılmaz). 1.20.2+ GUI atlası bu klasördeki bütün ad alanlarını toplar.

**Kurallar:**

1. **1 texel = 1 GUI pikseli.** Doku boyutu, `.mcmeta`'daki `width`/`height` ile aynıdır.
2. **Kenar 1 texel.** Köşe pikselleri alfa 0 (pah). Saydam pikseller çizimde atılır.
3. **Üst ışık:** kenarın hemen altındaki sıra. Dolgu ile beyaz %5'in önceden karıştırılmış **opak** rengi (aşağıdaki tablo).
4. **Alt kenar** gölge tarafıdır: birincil düğmede `accentFillPressed`, diğerlerinde kenar rengi.
5. **Dolgu düz renktir.** 1.21.1'de nine-slice orta ve kenar parçalarını **döşer** (tile). Desenli dolgu dikiş verir. `stretch_inner` 1.21.2'de (24w36a) geldi; 1.21.1'de yok.
6. **Kenarlık 2** (`border: 2`): üstte kenar + ışık, diğer yanlarda kenar + 1 dolgu. Çizim boyutu en az 5×5 olmalı.
7. Yarı saydam piksel yalnızca `hud/panel` dolgusunda (alfa en az `0xE6`). Çizerken karışım (blend) açılır (`HsDraw.drawSprite`).
8. Parıltı, degrade, gürültü, iç gölge yok.

`panel/yuzey.png.mcmeta`:

```json
{
  "gui": {
    "scaling": {
      "type": "nine_slice",
      "width": 8,
      "height": 8,
      "border": 2
    }
  }
}
```

`border` tek sayı ya da `{"left": 1, "top": 2, "right": 1, "bottom": 1}` nesnesi olabilir. Vanilya örneği: `widget/button` 200×20 dokudur, kenarlığı 3.

**Paketlerin ezebileceği sprite'lar** (hepsi 8×8, yukarıdaki mcmeta):

| Kimlik | Kenar | Üst ışık (opak) | Dolgu | Alt kenar |
|---|---|---|---|---|
| `hardsetups:panel/yuzey` | `#2B2F37` | `#212328` | `#15171C` | `#2B2F37` |
| `hardsetups:panel/kart` | `#2B2F37` | `#27292F` | `#1B1E24` | `#2B2F37` |
| `hardsetups:hud/panel` | `#2B2F37` | `#1C1E22` (alfa E6) | `#101216` (alfa E6) | `#2B2F37` |
| `hardsetups:toast/bildirim` | `#3A3F49` | `#27292F` | `#1B1E24` | `#3A3F49` |
| `hardsetups:widget/dugme_birincil` | `#A52B12` | `#AA361E` | `#A52B12` | `#7F200D` |
| `hardsetups:widget/dugme_birincil_vurgulu` | `#EC6A51` | `#AA361E` | `#A52B12` | `#EC6A51` |
| `hardsetups:widget/dugme_ikincil` | `#3A3F49` | `#2D3037` | `#22252C` | `#3A3F49` |
| `hardsetups:widget/dugme_ikincil_vurgulu` | `#EC6A51` | `#2D3037` | `#22252C` | `#EC6A51` |
| `hardsetups:widget/dugme_pasif` | `#2B2F37` | `#27292F` | `#1B1E24` | `#2B2F37` |

Kod, sprite'ı `ctx.drawGuiTexture(Identifier, x, y, w, h)` ile çizer (1.21.1 imzası). 1.21.2+'da imza `drawGuiTexture(RenderLayer::getGuiTextured, id, x, y, w, h)` oldu.

Ürün sprite'ları kendi ad alanındadır ve aynı kurallara uyar: `assets/hardsetups-kumfirtinasi/textures/gui/sprites/hud/firtina_cercevesi.png` → `hardsetups-kumfirtinasi:hud/firtina_cercevesi`.
