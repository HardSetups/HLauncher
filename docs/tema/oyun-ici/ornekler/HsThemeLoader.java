package com.hardsetups.core.theme;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.BufferedReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import net.fabricmc.fabric.api.resource.SimpleSynchronousResourceReloadListener;
import net.minecraft.resource.Resource;
import net.minecraft.resource.ResourceManager;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Tema yükleyici (istemci). Katman sırası, düşükten yükseğe:
 *   1. kodda gömülü Kiremit (HsTheme.kiremit)
 *   2. çekirdek mod jar'ındaki assets/hardsetups/themes/kiremit.json
 *   3. üstteki kaynak paketleri: her biri yalnızca yazdığı rolleri ezer
 *   4. oyuncu ayarı (config/hardsetups/tema.json): tema seçimi, yüksek kontrast, hareket, HUD ölçeği
 * Kaynaklar her yüklendiğinde (açılış, F3+T, paket değişimi) yeniden çalışır.
 * Bozuk ya da kontrast bekçisini geçemeyen bir katman bütünüyle atlanır; oyun asla temasız kalmaz.
 */
public final class HsThemeLoader implements SimpleSynchronousResourceReloadListener {
    public static final Identifier ID = Identifier.of("hardsetups", "theme");
    private static final Logger LOG = LoggerFactory.getLogger("HardSetups/Tema");

    /** Yazı rollerinin zemine karşı en düşük kontrastı (WCAG AA, normal metin). */
    private static final double MIN_CONTRAST = 4.5;
    private static final Role[][] PAIRS = {
            {Role.TEXT_PRIMARY, Role.SURFACE}, {Role.TEXT_SECONDARY, Role.SURFACE}, {Role.TEXT_TERTIARY, Role.SURFACE},
            {Role.TEXT_PRIMARY, Role.RAISED}, {Role.TEXT_SECONDARY, Role.RAISED},
            {Role.ACCENT_TEXT, Role.SURFACE}, {Role.ON_ACCENT_FILL, Role.ACCENT_FILL},
            {Role.SUCCESS, Role.SURFACE}, {Role.WARNING, Role.SURFACE}, {Role.DANGER, Role.SURFACE}, {Role.INFO, Role.SURFACE},
    };

    private static volatile Identifier themeId = HsTheme.DEFAULT_ID;
    private static volatile List<JsonObject> layers = List.of();

    @Override
    public Identifier getFabricId() {
        return ID;
    }

    @Override
    public void reload(ResourceManager manager) {
        TemaAyarlari settings = TemaAyarlari.load();
        Identifier wanted = settings.tema();
        List<JsonObject> read = readLayers(manager, wanted);
        if (read.isEmpty() && !wanted.equals(HsTheme.DEFAULT_ID)) {
            LOG.warn("Tema bulunamadı: {}; {} kullanılıyor", wanted, HsTheme.DEFAULT_ID);
            wanted = HsTheme.DEFAULT_ID;
            read = readLayers(manager, wanted);
        }
        themeId = wanted;
        layers = read;
        HsDraw.refreshSpriteOverrides(manager);
        apply(settings);
    }

    /** Oyuncu ayarı değişince (ayar ekranı) kaynakları yeniden yüklemeden uygular. Render iş parçacığından çağır. */
    public static void apply(TemaAyarlari settings) {
        HsTheme.set(compose(themeId, layers, settings));
    }

    /** "hardsetups:kiremit" → assets/hardsetups/themes/kiremit.json; tüm paketlerdeki kopyalar, düşük → yüksek öncelik. */
    private static List<JsonObject> readLayers(ResourceManager manager, Identifier theme) {
        Identifier file = Identifier.of(theme.getNamespace(), "themes/" + theme.getPath() + ".json");
        List<JsonObject> out = new ArrayList<>();
        for (Resource resource : manager.getAllResources(file)) {
            try (BufferedReader reader = resource.getReader()) {
                out.add(JsonParser.parseReader(reader).getAsJsonObject());
            } catch (Exception e) { // IOException, JsonParseException, IllegalStateException
                LOG.warn("Tema dosyası atlandı: {} (paket: {}): {}", file, resource.getPackId(), e.getMessage());
            }
        }
        return List.copyOf(out);
    }

    static HsTheme compose(Identifier id, List<JsonObject> layers, TemaAyarlari settings) {
        int[] colors = HsTheme.defaultColors();
        int[] motion = HsTheme.DEFAULT_MOTION.clone();
        JsonObject highContrast = null;
        for (JsonObject layer : layers) {
            try {
                int[] next = colors.clone();
                applyRoles(layer.has("roles") ? layer.getAsJsonObject("roles") : null, next);
                String problem = checkContrast(next);
                if (problem != null) {
                    LOG.warn("Tema katmanı reddedildi ({}): {}", id, problem);
                    continue;
                }
                int[] nextMotion = motion.clone();
                readMotion(layer.has("motion") ? layer.getAsJsonObject("motion") : null, nextMotion);
                colors = next;
                motion = nextMotion;
                JsonObject variants = layer.has("variants") ? layer.getAsJsonObject("variants") : null;
                if (variants != null && variants.has("highContrast")) highContrast = variants.getAsJsonObject("highContrast");
            } catch (RuntimeException e) { // ClassCastException, IllegalStateException, IllegalArgumentException
                LOG.warn("Tema katmanı okunamadı ({}): {}", id, e.getMessage());
            }
        }
        boolean hc = settings.highContrastEffective();
        if (hc && highContrast != null) {
            try {
                int[] next = colors.clone();
                applyRoles(highContrast, next);
                String problem = checkContrast(next);
                if (problem == null) colors = next;
                else LOG.warn("Yüksek kontrast varyantı reddedildi ({}): {}", id, problem);
            } catch (RuntimeException e) {
                LOG.warn("Yüksek kontrast varyantı okunamadı ({}): {}", id, e.getMessage());
            }
        }
        return new HsTheme(id, colors, motion, hc, settings.azaltilmisHareket(), settings.hudOlcek());
    }

    private static void applyRoles(JsonObject roles, int[] into) {
        if (roles == null) return;
        for (Map.Entry<String, JsonElement> entry : roles.entrySet()) {
            if (entry.getKey().startsWith("$")) continue; // açıklama alanları
            Role role = Role.byKey(entry.getKey());
            if (role == null) {
                LOG.warn("Bilinmeyen tema rolü yok sayıldı: {}", entry.getKey());
                continue;
            }
            into[role.ordinal()] = parseArgb(entry.getValue().getAsString());
        }
    }

    /**
     * "0xAARRGGBB" (ARGB) ya da "#RRGGBB" (opak). CSS'teki "#RRGGBBAA" bilerek reddedilir:
     * alfa sonda mı başta mı karışır.
     */
    static int parseArgb(String text) {
        String v = text.trim();
        if ((v.startsWith("0x") || v.startsWith("0X")) && v.length() == 10) {
            return (int) Long.parseLong(v.substring(2), 16);
        }
        if (v.startsWith("#") && v.length() == 7) {
            return 0xFF000000 | Integer.parseInt(v.substring(1), 16);
        }
        throw new IllegalArgumentException("renk 0xAARRGGBB ya da #RRGGBB olmalı: " + text);
    }

    private static void readMotion(JsonObject motion, int[] into) {
        if (motion == null) return;
        String[] keys = {"fastMs", "baseMs", "slowMs"};
        for (int i = 0; i < keys.length; i++) {
            if (motion.has(keys[i])) into[i] = Math.max(0, Math.min(1000, motion.get(keys[i]).getAsInt()));
        }
    }

    /** null = geçti; aksi hâlde sebebi. */
    static String checkContrast(int[] c) {
        for (Role role : Role.values()) {
            if (!role.translucent && (c[role.ordinal()] >>> 24) != 0xFF) return role.key + " yarı saydam olamaz";
        }
        for (Role[] pair : PAIRS) {
            double ratio = contrast(c[pair[0].ordinal()], c[pair[1].ordinal()]);
            if (ratio < MIN_CONTRAST) {
                return String.format(Locale.ROOT, "%s / %s kontrastı %.2f < %.1f", pair[0].key, pair[1].key, ratio, MIN_CONTRAST);
            }
        }
        if ((c[Role.HUD_PANEL.ordinal()] >>> 24) < 0xE6) return "hudPanel alfası 0xE6'dan düşük olamaz";
        return null;
    }

    /** WCAG 2 kontrast oranı (alfa yok sayılır). */
    public static double contrast(int argbA, int argbB) {
        double a = luminance(argbA);
        double b = luminance(argbB);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }

    private static double luminance(int argb) {
        return 0.2126 * channel(argb >> 16) + 0.7152 * channel(argb >> 8) + 0.0722 * channel(argb);
    }

    private static double channel(int value) {
        double c = (value & 0xFF) / 255.0;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
}
