package com.hardsetups.core.theme;

import java.util.Locale;
import java.util.function.IntSupplier;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.Text;

/**
 * Örnek HUD öğesi: sol üstte "Kalan süre 2:15" paneli. Ürün modu veri kaynağını verir.
 * Kayıt: {@code HudRenderCallback.EVENT.register(new HsHudSayac(() -> oyun.kalanSaniye()))}.
 * Sürüm notu: HudRenderCallback 1.21.1 içindir; 1.21.6+'da yerini HudElementRegistry aldı. İstemci sınıfı.
 */
public final class HsHudSayac implements HudRenderCallback {
    private static final Text LABEL = Text.translatable("hardsetups.cekirdek.hud.kalan_sure");
    private static final int MARGIN = 4;   // ekran kenarından
    private static final int PAD_X = 8;
    private static final int HEIGHT = 20;

    private final IntSupplier secondsLeft; // < 0 → gizle

    // Önbellek: metin ve ölçüler yalnızca değer değişince yeniden üretilir (kare başına nesne yok).
    private int lastSeconds = Integer.MIN_VALUE;
    private Text valueText = Text.empty();
    private int labelWidth;
    private int width;

    public HsHudSayac(IntSupplier secondsLeft) {
        this.secondsLeft = secondsLeft;
    }

    @Override
    public void onHudRender(DrawContext ctx, RenderTickCounter tickCounter) {
        MinecraftClient mc = MinecraftClient.getInstance();
        if (mc.player == null || mc.options.hudHidden || mc.inGameHud.getDebugHud().shouldShowDebugHud()) return;
        int seconds = secondsLeft.getAsInt();
        if (seconds < 0) return;

        TextRenderer tr = mc.textRenderer;
        if (seconds != lastSeconds) {
            lastSeconds = seconds;
            valueText = Text.literal(String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60));
            labelWidth = tr.getWidth(LABEL);
            width = PAD_X + labelWidth + 4 + tr.getWidth(valueText) + PAD_X;
        }

        HsTheme t = HsTheme.current();
        float scale = HsDraw.hudScale(mc);
        MatrixStack m = ctx.getMatrices();
        m.push();
        m.translate(MARGIN, MARGIN, 0f);
        m.scale(scale, scale, 1f);
        HsDraw.panel(ctx, HsDraw.HUD_PANEL, 0, 0, width, HEIGHT, Role.HUD_PANEL, Role.LINE);
        int textY = (HEIGHT - 8) / 2;
        ctx.drawText(tr, LABEL, PAD_X, textY, t.color(Role.TEXT_SECONDARY), false);
        // Son 10 saniye: uyarı rengi. Bilgi zaten sayının kendisinde; renk yalnızca vurgular.
        ctx.drawText(tr, valueText, PAD_X + labelWidth + 4, textY,
                t.color(seconds <= 10 ? Role.WARNING : Role.TEXT_PRIMARY), false);
        m.pop();
    }
}
