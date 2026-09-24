package com.hardsetups.core.theme;

import net.fabricmc.fabric.api.event.Event;
import net.fabricmc.fabric.api.event.EventFactory;
import net.minecraft.util.Identifier;

/**
 * Etkin temanın değişmez anlık görüntüsü. {@link #current()} her karede çağrılabilir:
 * bir alan okur, nesne üretmez. Renkler ARGB int'tir (DrawContext için); metin stili için {@link #rgb}.
 * Ortak sınıf: sunucuda tema yüklenmez, orada hep gömülü Kiremit değerleri geçerlidir.
 */
public final class HsTheme {
    public static final Identifier DEFAULT_ID = Identifier.of("hardsetups", "kiremit");

    /** fastMs, baseMs, slowMs (tema.json › motion). */
    static final int[] DEFAULT_MOTION = {120, 180, 260};

    /** Tema değişti: ilk yükleme, F3+T, kaynak paketi değişimi, oyuncu ayarı. Render iş parçacığında çağrılır. */
    public static final Event<Changed> CHANGED = EventFactory.createArrayBacked(Changed.class,
            listeners -> theme -> {
                for (Changed listener : listeners) listener.onThemeChanged(theme);
            });

    @FunctionalInterface
    public interface Changed {
        void onThemeChanged(HsTheme theme);
    }

    public enum Motion { FAST, BASE, SLOW }

    // DEFAULT_MOTION ve DEFAULT_ID'den SONRA tanımlı olmalı (statik alanlar yazılış sırasıyla başlar).
    private static volatile HsTheme current = defaults();

    private final Identifier id;
    private final int[] colors;   // Role.ordinal() → ARGB
    private final int[] motionMs; // Motion.ordinal() → ms
    private final boolean highContrast;
    private final boolean reducedMotion;
    private final float hudScale;

    HsTheme(Identifier id, int[] colors, int[] motionMs, boolean highContrast, boolean reducedMotion, float hudScale) {
        this.id = id;
        this.colors = colors.clone();
        this.motionMs = motionMs.clone();
        this.highContrast = highContrast;
        this.reducedMotion = reducedMotion;
        this.hudScale = hudScale;
    }

    public static HsTheme current() {
        return current;
    }

    static void set(HsTheme theme) {
        current = theme;
        CHANGED.invoker().onThemeChanged(theme);
    }

    public Identifier id() {
        return id;
    }

    /** ARGB: DrawContext.fill / drawText için. */
    public int color(Role role) {
        return colors[role.ordinal()];
    }

    /** RGB (alfa yok): Style.withColor(int) / TextColor.fromRgb için. */
    public int rgb(Role role) {
        return colors[role.ordinal()] & 0xFFFFFF;
    }

    public boolean highContrast() {
        return highContrast;
    }

    public boolean reducedMotion() {
        return reducedMotion;
    }

    /** Oyuncunun HUD ölçeği çarpanı (0.5–2.0). Piksel hizası için HsDraw.hudScale kullan. */
    public float hudScale() {
        return hudScale;
    }

    /** Animasyon süresi; azaltılmış harekette 0 (değişim anında olur). */
    public int motionMs(Motion motion) {
        return reducedMotion ? 0 : motionMs[motion.ordinal()];
    }

    /**
     * Kodda gömülü Kiremit. kiremit.json okunamasa bile oyun temasız kalmaz.
     * kiremit.json › roles ile birebir aynı tutulur (bir testle karşılaştır).
     * Switch ifadesi tüm rolleri kapsamak zorunda: yeni rol eklenince derleyici burayı hatırlatır.
     */
    public static int kiremit(Role role) {
        return switch (role) {
            case BACKGROUND -> 0xFF101216;          // grafit.900
            case BACKGROUND_DEEP -> 0xFF0B0C0F;     // grafit.950
            case SURFACE -> 0xFF15171C;             // grafit.850
            case RAISED -> 0xFF1B1E24;              // grafit.800
            case RAISED_2 -> 0xFF22252C;            // grafit.750
            case LINE -> 0xFF2B2F37;                // grafit.700
            case LINE_STRONG -> 0xFF3A3F49;         // grafit.600
            case ACCENT_FILL -> 0xFFA52B12;         // kiremit.500
            case ACCENT_FILL_PRESSED -> 0xFF7F200D; // kiremit.600
            case ACCENT_TEXT -> 0xFFEC6A51;         // kiremit.400
            case ACCENT_TEXT_HOVER -> 0xFFF4957F;   // kiremit.300
            case ON_ACCENT_FILL -> 0xFFFFFFFF;      // roles.onAccentFill
            case HIGHLIGHT -> 0xFFF0A04B;           // kor
            case TEXT_PRIMARY -> 0xFFF2F3F5;        // text.primary
            case TEXT_SECONDARY -> 0xFFB3B7C0;      // text.secondary
            case TEXT_TERTIARY -> 0xFF7C818C;       // text.tertiary
            case SUCCESS -> 0xFF3FCF7B;             // status.success
            case WARNING -> 0xFFE7A93B;             // status.warning
            case DANGER -> 0xFFE5484D;              // status.danger
            case INFO -> 0xFF4C8DFF;                // status.info
            case EDGE_LIGHT -> 0x0DFFFFFF;          // türetilmiş: %5 beyaz üst ışık çizgisi
            case SHADOW -> 0x66000000;              // türetilmiş: %40 siyah, 1 px sert gölge
            case HUD_PANEL -> 0xE6101216;           // türetilmiş: grafit.900 %90 (dünya üstünde okunurluk)
            case SCRIM -> 0xCC0B0C0F;               // türetilmiş: grafit.950 %80 (ekran içi modal perdesi)
            case ACCENT_WEAK -> 0x21A52B12;         // türetilmiş: kiremit.500 %13 (seçili satır zemini)
        };
    }

    static int[] defaultColors() {
        Role[] roles = Role.values();
        int[] colors = new int[roles.length];
        for (Role role : roles) colors[role.ordinal()] = kiremit(role);
        return colors;
    }

    static HsTheme defaults() {
        return new HsTheme(DEFAULT_ID, defaultColors(), DEFAULT_MOTION, false, false, 1.0f);
    }
}
