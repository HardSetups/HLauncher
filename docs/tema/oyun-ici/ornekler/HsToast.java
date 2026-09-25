package com.hardsetups.core.theme;

import java.util.List;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.toast.Toast;
import net.minecraft.client.toast.ToastManager;
import net.minecraft.text.OrderedText;
import net.minecraft.text.Text;

/**
 * Temalı toast (sağ üst bildirim). 160 px geniş; 1 satır gövdeyle 32 px (vanilya ile aynı), en fazla 2 satır.
 * Sürüm notu: Toast arayüzü 1.21.1 içindir. 1.21.2+'da draw(DrawContext, TextRenderer, long) +
 * update(ToastManager, long) + getVisibility() oldu. İstemci sınıfı.
 */
public final class HsToast implements Toast {
    private static final int WIDTH = 160;
    private static final long DURATION_MS = 5000L;

    private final Durum durum;
    private final Text title;
    private final List<OrderedText> lines;

    private HsToast(Durum durum, Text title, Text body) {
        this.durum = durum;
        this.title = title;
        TextRenderer tr = MinecraftClient.getInstance().textRenderer;
        List<OrderedText> wrapped = tr.wrapLines(body, WIDTH - 16); // satırlar bir kez hesaplanır, her karede değil
        this.lines = wrapped.size() > 2 ? List.copyOf(wrapped.subList(0, 2)) : List.copyOf(wrapped);
    }

    /** Her iş parçacığından çağrılabilir; ekleme istemci iş parçacığında yapılır. */
    public static void show(Durum durum, Text title, Text body) {
        MinecraftClient mc = MinecraftClient.getInstance();
        mc.execute(() -> {
            mc.getToastManager().add(new HsToast(durum, title, body));
            mc.getNarratorManager().narrate(Text.empty().append(title).append(". ").append(body));
        });
    }

    @Override
    public int getWidth() {
        return WIDTH;
    }

    @Override
    public int getHeight() {
        return 12 + 10 * (1 + lines.size()); // 1 satır → 32
    }

    @Override
    public Visibility draw(DrawContext ctx, ToastManager manager, long startTime) {
        HsTheme t = HsTheme.current();
        TextRenderer tr = manager.getClient().textRenderer;
        int w = getWidth();
        int h = getHeight();
        HsDraw.panel(ctx, HsDraw.TOAST, 0, 0, w, h, Role.RAISED, Role.LINE_STRONG);
        ctx.fill(2, 2, 4, h - 2, t.color(durum.role)); // durum şeridi; anlamı başlık söyler, renk yalnızca destek
        ctx.drawText(tr, title, 10, 7, t.color(Role.TEXT_PRIMARY), false);
        for (int i = 0; i < lines.size(); i++) {
            ctx.drawText(tr, lines.get(i), 10, 18 + 10 * i, t.color(Role.TEXT_SECONDARY), false);
        }
        // Erişilebilirlik › Bildirim süresi çarpanına uyar.
        double duration = DURATION_MS * manager.getNotificationDisplayTimeMultiplier();
        return startTime >= duration ? Visibility.HIDE : Visibility.SHOW;
    }
}
