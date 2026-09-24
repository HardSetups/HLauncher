package com.hardsetups.core.theme;

import java.util.HashMap;
import java.util.Map;

/**
 * Tema rolleri. Kod rengi hex ile yazmaz, rol ister: {@code HsTheme.current().color(Role.ACCENT_FILL)}.
 * {@link #key} = kiremit.json › roles anahtarı (docs/tema/tema.json › roles ile aynı adlar).
 * Ortak sınıf: istemcide ve sunucuda çalışır.
 */
public enum Role {
    // Yüzeyler (grafit)
    BACKGROUND("background"),
    BACKGROUND_DEEP("backgroundDeep"),
    SURFACE("surface"),
    RAISED("raised"),
    RAISED_2("raised2"),
    LINE("line"),
    LINE_STRONG("lineStrong"),
    // Vurgu (kiremit)
    ACCENT_FILL("accentFill"),
    ACCENT_FILL_PRESSED("accentFillPressed"),
    ACCENT_TEXT("accentText"),
    ACCENT_TEXT_HOVER("accentTextHover"),
    ON_ACCENT_FILL("onAccentFill"),
    HIGHLIGHT("highlight"),
    // Metin
    TEXT_PRIMARY("textPrimary"),
    TEXT_SECONDARY("textSecondary"),
    TEXT_TERTIARY("textTertiary"),
    // Durum
    SUCCESS("success"),
    WARNING("warning"),
    DANGER("danger"),
    INFO("info"),
    // Oyun içi türetilmiş roller (tema.json'da yok; KIMLIK.md kurallarından). Yalnızca bunlar yarı saydam olabilir.
    EDGE_LIGHT("edgeLight", true),
    SHADOW("shadow", true),
    HUD_PANEL("hudPanel", true),
    SCRIM("scrim", true),
    ACCENT_WEAK("accentWeak", true);

    public final String key;
    public final boolean translucent;

    Role(String key) {
        this(key, false);
    }

    Role(String key, boolean translucent) {
        this.key = key;
        this.translucent = translucent;
    }

    private static final Map<String, Role> BY_KEY = new HashMap<>();

    static {
        for (Role role : values()) BY_KEY.put(role.key, role);
    }

    /** JSON anahtarından rol; bilinmiyorsa null. */
    public static Role byKey(String key) {
        return BY_KEY.get(key);
    }
}
