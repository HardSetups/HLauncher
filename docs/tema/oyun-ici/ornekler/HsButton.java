package com.hardsetups.core.theme;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.ButtonTextures;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;

/**
 * Temalı düğme. ButtonWidget'tan türer: tıklama, klavye (Enter/Boşluk), tık sesi ve anlatıcı vanilyadan gelir.
 * Yükseklik 20 (vanilya). Bir ekranda tek PRIMARY olur. İstemci sınıfı.
 */
public class HsButton extends ButtonWidget {
    public enum Kind { PRIMARY, SECONDARY }

    private final Kind kind;

    public HsButton(int x, int y, int width, int height, Text message, Kind kind, PressAction onPress) {
        super(x, y, width, height, message, onPress, DEFAULT_NARRATION_SUPPLIER);
        this.kind = kind;
    }

    @Override
    protected void renderWidget(DrawContext ctx, int mouseX, int mouseY, float delta) {
        int x = getX();
        int y = getY();
        int w = getWidth();
        int h = getHeight();
        boolean hot = active && isSelected(); // üzerine gelme ya da klavye odağı

        ButtonTextures sprites = kind == Kind.PRIMARY ? HsDraw.BUTTON_PRIMARY : HsDraw.BUTTON_SECONDARY;
        Identifier sprite = sprites.get(active, hot);
        HsTheme t = HsTheme.current();
        if (HsDraw.useSprite(sprite)) {
            HsDraw.drawSprite(ctx, sprite, x, y, w, h); // paket sprite'ı (nine-slice)
        } else if (!active) {
            HsDraw.box(ctx, x, y, w, h, t.color(Role.RAISED), t.color(Role.LINE), t.color(Role.LINE));
        } else if (kind == Kind.PRIMARY) {
            int edge = t.color(hot ? Role.ACCENT_TEXT : Role.ACCENT_FILL);   // odak halkası: kiremit 400
            int bottom = hot ? edge : t.color(Role.ACCENT_FILL_PRESSED);     // sert alt gölge: kiremit 600
            HsDraw.box(ctx, x, y, w, h, t.color(Role.ACCENT_FILL), edge, bottom);
        } else {
            int edge = t.color(hot ? Role.ACCENT_TEXT : Role.LINE_STRONG);
            HsDraw.box(ctx, x, y, w, h, t.color(Role.RAISED_2), edge, edge);
        }

        Role text = !active ? Role.TEXT_TERTIARY : kind == Kind.PRIMARY ? Role.ON_ACCENT_FILL : Role.TEXT_PRIMARY;
        // Metni ortalar; sığmazsa kaydırır (vanilya davranışı). 2 = yatay iç boşluk.
        drawScrollableText(ctx, MinecraftClient.getInstance().textRenderer, 2, t.color(text));
    }
}
