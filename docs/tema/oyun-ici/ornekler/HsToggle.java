package com.hardsetups.core.theme;

import java.util.function.Consumer;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.narration.NarrationMessageBuilder;
import net.minecraft.client.gui.widget.PressableWidget;
import net.minecraft.screen.ScreenTexts;
import net.minecraft.text.MutableText;
import net.minecraft.text.Text;

/**
 * Anahtar (açık/kapalı) satırı: etiket solda, "Açık/Kapalı" sözcüğü + 24×12 iz sağda.
 * Durum renkle değil, topuzun yeri ve sözcükle de belli olur. İstemci sınıfı.
 */
public class HsToggle extends PressableWidget {
    private static final int TRACK_W = 24;
    private static final int TRACK_H = 12;
    private static final int KNOB = 8;

    private final Consumer<Boolean> onChange;
    private boolean value;

    public HsToggle(int x, int y, int width, int height, Text label, boolean value, Consumer<Boolean> onChange) {
        super(x, y, width, height, label);
        this.value = value;
        this.onChange = onChange;
    }

    public boolean value() {
        return value;
    }

    @Override
    public void onPress() {
        value = !value;
        onChange.accept(value);
    }

    @Override
    protected void renderWidget(DrawContext ctx, int mouseX, int mouseY, float delta) {
        HsTheme t = HsTheme.current();
        TextRenderer tr = MinecraftClient.getInstance().textRenderer;
        int x = getX();
        int y = getY();
        int w = getWidth();
        int h = getHeight();
        boolean hot = active && isSelected();
        int textY = y + (h - 8) / 2;

        ctx.drawText(tr, getMessage(), x, textY, t.color(active ? Role.TEXT_PRIMARY : Role.TEXT_TERTIARY), false);

        int tx = x + w - TRACK_W;
        int ty = y + (h - TRACK_H) / 2;
        Text state = value ? ScreenTexts.ON : ScreenTexts.OFF;
        ctx.drawText(tr, state, tx - 4 - tr.getWidth(state), textY, t.color(Role.TEXT_SECONDARY), false);

        int fill = t.color(value ? Role.ACCENT_FILL : Role.RAISED_2);
        int edge = t.color(hot ? Role.ACCENT_TEXT : value ? Role.ACCENT_FILL : Role.LINE_STRONG);
        int bottom = hot ? edge : t.color(value ? Role.ACCENT_FILL_PRESSED : Role.LINE_STRONG);
        HsDraw.box(ctx, tx, ty, TRACK_W, TRACK_H, fill, edge, bottom);

        int kx = value ? tx + TRACK_W - 2 - KNOB : tx + 2;
        ctx.fill(kx, ty + 2, kx + KNOB, ty + 2 + KNOB, t.color(value ? Role.ON_ACCENT_FILL : Role.TEXT_SECONDARY));
    }

    /** Anlatıcı: "Yüksek kontrast: Açık". */
    @Override
    protected MutableText getNarrationMessage() {
        return getMessage().copy().append(": ").append(value ? ScreenTexts.ON : ScreenTexts.OFF);
    }

    @Override
    protected void appendClickableNarrations(NarrationMessageBuilder builder) {
        appendDefaultNarrations(builder); // başlık (yukarıdaki metin) + kullanım ipucu
    }
}
