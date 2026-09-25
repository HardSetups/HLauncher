package com.hardsetups.core.theme;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.widget.SliderWidget;
import net.minecraft.text.Text;

/**
 * Temalı kaydırıcı. Vanilya düzeni korunur (metin izin ortasında, tutamak 8 px); yalnızca çizim değişir.
 * Alt sınıf updateMessage() ve applyValue() yazar. İstemci sınıfı.
 */
public abstract class HsSlider extends SliderWidget {
    private static final int HANDLE_W = 8;

    protected HsSlider(int x, int y, int width, int height, Text text, double value) {
        super(x, y, width, height, text, value);
    }

    @Override
    public void renderWidget(DrawContext ctx, int mouseX, int mouseY, float delta) {
        HsTheme t = HsTheme.current();
        int x = getX();
        int y = getY();
        int w = getWidth();
        int h = getHeight();
        boolean hot = active && isSelected();

        int edge = t.color(hot ? Role.ACCENT_TEXT : Role.LINE_STRONG);
        HsDraw.box(ctx, x, y, w, h, t.color(Role.RAISED), edge, edge);

        int hx = x + (int) (value * (w - HANDLE_W));
        ctx.fill(x + 1, y + 2, hx + HANDLE_W / 2, y + h - 1, t.color(Role.ACCENT_WEAK)); // dolu kısım
        int handle = t.color(active ? Role.ACCENT_FILL : Role.RAISED_2);
        HsDraw.box(ctx, hx, y, HANDLE_W, h, handle, active ? handle : edge, t.color(active ? Role.ACCENT_FILL_PRESSED : Role.LINE));

        drawScrollableText(ctx, MinecraftClient.getInstance().textRenderer, 2,
                t.color(active ? Role.TEXT_PRIMARY : Role.TEXT_TERTIARY));
    }
}
