package com.hardsetups.core.theme;

import com.mojang.blaze3d.systems.RenderSystem;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.ButtonTextures;
import net.minecraft.resource.ResourceManager;
import net.minecraft.util.Identifier;

/**
 * Pahlı kutu çizimi. Varsayılan yol KOD: renkler temadan gelir, yüksek kontrast ve paket renkleri kendiliğinden uyar.
 * Bir kaynak paketi aynı adla nine-slice sprite koyarsa o çizilir (yüksek kontrast açıkken hariç).
 * İstemci sınıfı. Sürüm notu: drawGuiTexture(Identifier, x, y, w, h) 1.21.1 imzasıdır;
 * 1.21.2+: drawGuiTexture(RenderLayer::getGuiTextured, id, x, y, w, h).
 */
public final class HsDraw {
    private HsDraw() {
    }

    // Paketlerin ezebileceği sprite adları: assets/hardsetups/textures/gui/sprites/<yol>.png
    public static final Identifier PANEL = sprite("panel/yuzey");
    public static final Identifier CARD = sprite("panel/kart");
    public static final Identifier HUD_PANEL = sprite("hud/panel");
    public static final Identifier TOAST = sprite("toast/bildirim");
    public static final ButtonTextures BUTTON_PRIMARY = new ButtonTextures(
            sprite("widget/dugme_birincil"), sprite("widget/dugme_pasif"), sprite("widget/dugme_birincil_vurgulu"));
    public static final ButtonTextures BUTTON_SECONDARY = new ButtonTextures(
            sprite("widget/dugme_ikincil"), sprite("widget/dugme_pasif"), sprite("widget/dugme_ikincil_vurgulu"));

    private static final List<Identifier> KNOWN = List.of(PANEL, CARD, HUD_PANEL, TOAST,
            BUTTON_PRIMARY.enabled(), BUTTON_PRIMARY.disabled(), BUTTON_PRIMARY.enabledFocused(),
            BUTTON_SECONDARY.enabled(), BUTTON_SECONDARY.enabledFocused());

    private static volatile Set<Identifier> packSprites = Set.of();

    private static Identifier sprite(String path) {
        return Identifier.of("hardsetups", path);
    }

    /** HsThemeLoader.reload çağırır: hangi sprite'ları bir kaynak paketi sağlıyor? */
    static void refreshSpriteOverrides(ResourceManager manager) {
        Set<Identifier> found = new HashSet<>();
        for (Identifier id : KNOWN) {
            Identifier png = Identifier.of(id.getNamespace(), "textures/gui/sprites/" + id.getPath() + ".png");
            if (manager.getResource(png).isPresent()) found.add(id);
        }
        packSprites = Set.copyOf(found);
    }

    /** Paket sprite'ı var ve yüksek kontrast kapalıysa true. */
    public static boolean useSprite(Identifier sprite) {
        return !HsTheme.current().highContrast() && packSprites.contains(sprite);
    }

    /** Yüzey paneli (ekran gövdesi). */
    public static void surface(DrawContext ctx, int x, int y, int w, int h) {
        panel(ctx, PANEL, x, y, w, h, Role.SURFACE, Role.LINE);
    }

    /** Kart (panel içindeki bir kat üst). */
    public static void card(DrawContext ctx, int x, int y, int w, int h) {
        panel(ctx, CARD, x, y, w, h, Role.RAISED, Role.LINE);
    }

    public static void panel(DrawContext ctx, Identifier sprite, int x, int y, int w, int h, Role fill, Role edge) {
        if (useSprite(sprite)) {
            drawSprite(ctx, sprite, x, y, w, h);
            return;
        }
        HsTheme t = HsTheme.current();
        box(ctx, x, y, w, h, t.color(fill), t.color(edge), t.color(edge));
    }

    /**
     * GUI atlasından sprite (nine-slice ise dilimlenir). 1.21.1'de drawGuiTexture karışımı kendisi açmaz;
     * vanilya düğmesi gibi önce enableBlend. Tam saydam pikseller (pah) zaten atılır, yarı saydamlar için şart.
     */
    public static void drawSprite(DrawContext ctx, Identifier sprite, int x, int y, int w, int h) {
        RenderSystem.enableBlend();
        ctx.drawGuiTexture(sprite, x, y, w, h); // 1.21.1 imzası
        RenderSystem.disableBlend();
    }

    /**
     * Pahlı kutu: 1 px kenar, dört köşe pikseli boş (pah), kenarın altında 1 px üst ışık, alt kenar "gölge tarafı".
     * 6 fill çağrısı; nesne üretmez. 1.21.1'de her fill hemen çizilir (sıra korunur). Yüzlerce kutu çizen bir
     * listede çağrıları ctx.draw(() -> { ... }) içine alıp tek seferde çizdir.
     */
    public static void box(DrawContext ctx, int x, int y, int w, int h, int fill, int edge, int bottom) {
        int r = x + w;
        int b = y + h;
        ctx.fill(x + 1, y + 1, r - 1, b - 1, fill);      // dolgu
        ctx.fill(x + 1, y, r - 1, y + 1, edge);          // üst kenar (köşeler hariç)
        ctx.fill(x, y + 1, x + 1, b - 1, edge);          // sol
        ctx.fill(r - 1, y + 1, r, b - 1, edge);          // sağ
        ctx.fill(x + 1, b - 1, r - 1, b, bottom);        // alt kenar
        ctx.fill(x + 1, y + 1, r - 1, y + 2, HsTheme.current().color(Role.EDGE_LIGHT)); // üst ışık
    }

    /** Yüzen öğelerin (toast, açılır panel) altına 1 px sert gölge. */
    public static void dropShadow(DrawContext ctx, int x, int y, int w, int h) {
        ctx.fill(x + 1, y + h, x + w - 1, y + h + 1, HsTheme.current().color(Role.SHADOW));
    }

    /**
     * HUD ölçeği: oyuncu çarpanını, GUI ölçeğiyle çarpımı tam sayı olacak şekilde yuvarlar.
     * Böylece 1 GUI pikseli her zaman tam ekran pikseline düşer (bulanık yazı yok).
     */
    public static float hudScale(MinecraftClient mc) {
        double gui = mc.getWindow().getScaleFactor();
        return (float) (Math.max(1L, Math.round(gui * HsTheme.current().hudScale())) / gui);
    }
}
