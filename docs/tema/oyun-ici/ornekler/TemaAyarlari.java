package com.hardsetups.core.theme;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.MinecraftClient;
import net.minecraft.util.Identifier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Oyuncunun görünüm tercihi: config/hardsetups/tema.json. Yalnızca çekirdek mod okur/yazar.
 * Lisans ve ürün ayarları ayarlar.json'da kalır (launcher oraya birleştirme yapar); bu dosya ondan ayrıdır.
 * İstemci sınıfı (MinecraftClient'a dokunur).
 */
public record TemaAyarlari(Identifier tema, YuksekKontrast yuksekKontrast, boolean azaltilmisHareket, float hudOlcek) {

    public enum YuksekKontrast { OTOMATIK, ACIK, KAPALI }

    public static final int SURUM = 1;
    public static final TemaAyarlari VARSAYILAN =
            new TemaAyarlari(HsTheme.DEFAULT_ID, YuksekKontrast.OTOMATIK, false, 1.0f);

    private static final Logger LOG = LoggerFactory.getLogger("HardSetups/Tema");

    public static Path dosya() {
        return FabricLoader.getInstance().getConfigDir().resolve("hardsetups").resolve("tema.json");
    }

    /** Dosya yoksa varsayılan. Bozuksa tema.json.bozuk-<zaman> olarak saklanır, varsayılanla devam edilir. */
    public static TemaAyarlari load() {
        Path file = dosya();
        if (!Files.exists(file)) return VARSAYILAN;
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            JsonObject o = JsonParser.parseReader(reader).getAsJsonObject();
            Identifier tema = o.has("tema") ? Identifier.tryParse(o.get("tema").getAsString()) : null;
            YuksekKontrast yk = switch (o.has("yuksekKontrast") ? o.get("yuksekKontrast").getAsString() : "otomatik") {
                case "acik" -> YuksekKontrast.ACIK;
                case "kapali" -> YuksekKontrast.KAPALI;
                default -> YuksekKontrast.OTOMATIK;
            };
            boolean hareket = o.has("azaltilmisHareket") && o.get("azaltilmisHareket").getAsBoolean();
            float olcek = o.has("hudOlcek") ? o.get("hudOlcek").getAsFloat() : 1.0f;
            return new TemaAyarlari(tema != null ? tema : HsTheme.DEFAULT_ID, yk, hareket, clampOlcek(olcek));
        } catch (Exception e) { // IOException, JsonParseException, IllegalStateException, NumberFormatException
            keepCorrupt(file, e);
            return VARSAYILAN;
        }
    }

    /** Atomik yazma: geçici dosya → yerine taşı. Değerlerde sır yok; günlüğe yazılabilir. */
    public void save() throws IOException {
        JsonObject o = new JsonObject();
        o.addProperty("surum", SURUM);
        o.addProperty("tema", tema.toString());
        // Locale.ROOT şart: Türkçe yerel ayarda "ACIK".toLowerCase() → "acık" (noktasız ı) olur.
        o.addProperty("yuksekKontrast", yuksekKontrast.name().toLowerCase(Locale.ROOT));
        o.addProperty("azaltilmisHareket", azaltilmisHareket);
        o.addProperty("hudOlcek", hudOlcek);
        Path file = dosya();
        Files.createDirectories(file.getParent());
        Path tmp = file.resolveSibling("tema.json.tmp");
        Files.writeString(tmp, new GsonBuilder().setPrettyPrinting().create().toJson(o) + "\n", StandardCharsets.UTF_8);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    /** OTOMATIK: vanilya Erişilebilirlik › Yüksek kontrast seçeneğini izler. */
    public boolean highContrastEffective() {
        return switch (yuksekKontrast) {
            case ACIK -> true;
            case KAPALI -> false;
            case OTOMATIK -> {
                MinecraftClient mc = MinecraftClient.getInstance();
                yield mc != null && mc.options != null && mc.options.getHighContrast().getValue();
            }
        };
    }

    public TemaAyarlari withYuksekKontrast(YuksekKontrast value) {
        return new TemaAyarlari(tema, value, azaltilmisHareket, hudOlcek);
    }

    public TemaAyarlari withAzaltilmisHareket(boolean value) {
        return new TemaAyarlari(tema, yuksekKontrast, value, hudOlcek);
    }

    public TemaAyarlari withHudOlcek(float value) {
        return new TemaAyarlari(tema, yuksekKontrast, azaltilmisHareket, clampOlcek(value));
    }

    private static float clampOlcek(float value) {
        return Float.isFinite(value) ? Math.max(0.5f, Math.min(2.0f, value)) : 1.0f;
    }

    private static void keepCorrupt(Path file, Exception cause) {
        String stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"));
        Path aside = file.resolveSibling("tema.json.bozuk-" + stamp);
        try {
            Files.move(file, aside, StandardCopyOption.REPLACE_EXISTING);
            LOG.warn("tema.json okunamadı ({}); {} olarak saklandı, varsayılan tema kullanılıyor", cause.getMessage(), aside.getFileName());
        } catch (IOException e) {
            LOG.warn("tema.json okunamadı ve kenara alınamadı: {}", e.getMessage());
        }
    }
}
