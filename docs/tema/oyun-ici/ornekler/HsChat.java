package com.hardsetups.core.theme;

import net.minecraft.text.MutableText;
import net.minecraft.text.Text;

/**
 * Sohbet biçimi: "[HardSetups] mesaj". Ortak sınıf: sunucuda da çalışır (orada gömülü Kiremit renkleri geçerli).
 * Gönderme — istemci: {@code mc.player.sendMessage(HsChat.message(t), false)};
 * sunucu: {@code serverPlayer.sendMessage(HsChat.message(t))}; eylem çubuğu için overlay = true.
 */
public final class HsChat {
    private HsChat() {
    }

    /** Marka adı; çevrilmez, değiştirilmez. */
    public static final String BRAND = "HardSetups";

    public static MutableText prefix() {
        HsTheme t = HsTheme.current();
        int bracket = t.rgb(Role.TEXT_SECONDARY);
        return Text.empty()
                .append(Text.literal("[").styled(s -> s.withColor(bracket)))
                .append(Text.literal(BRAND).styled(s -> s.withColor(t.rgb(Role.ACCENT_TEXT))))
                .append(Text.literal("] ").styled(s -> s.withColor(bracket)));
    }

    /** "[HardSetups] mesaj" */
    public static MutableText message(Text body) {
        return prefix().append(body(body));
    }

    /** "[HardSetups] Hata: mesaj" — durum sözle yazılır, renk yalnızca destekler. */
    public static MutableText status(Durum durum, Text body) {
        int color = HsTheme.current().rgb(durum.role);
        return prefix()
                .append(Text.translatableWithFallback(durum.labelKey, durum.fallback)
                        .styled(s -> s.withColor(color).withBold(true)))
                .append(Text.literal(": ").styled(s -> s.withColor(color)))
                .append(body(body));
    }

    /** Gövdenin kendi rengi yoksa textPrimary verilir; varsa dokunulmaz. */
    private static MutableText body(Text body) {
        int primary = HsTheme.current().rgb(Role.TEXT_PRIMARY);
        return body.copy().styled(s -> s.getColor() == null ? s.withColor(primary) : s);
    }
}
