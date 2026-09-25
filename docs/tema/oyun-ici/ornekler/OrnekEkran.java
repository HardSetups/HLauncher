package com.hardsetups.core.theme;

import java.io.IOException;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.screen.ScreenTexts;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Örnek ekran: "Görünüm" ayarları. Kalıp: vanilya arka planı (bulanıklık/karartma) + ortada yüzey paneli +
 * 12 px iç boşluk + kalın kiremit başlık + kontroller + sağ altta tek birincil düğme. İstemci sınıfı.
 */
public class OrnekEkran extends Screen {
    private static final Logger LOG = LoggerFactory.getLogger("HardSetups/Tema");
    private static final int PANEL_W = 240; // 4'ün katı; 320 px ölçekli ekrana kenar boşluğuyla sığar
    private static final int PANEL_H = 148;
    private static final int PAD = 12;

    private final Screen parent;
    private TemaAyarlari settings;
    private Text heading;
    private int px;
    private int py;

    public OrnekEkran(Screen parent) {
        super(Text.translatable("hardsetups.cekirdek.ekran.gorunum.baslik"));
        this.parent = parent;
    }

    @Override
    protected void init() {
        settings = TemaAyarlari.load();
        heading = getTitle().copy().formatted(Formatting.BOLD); // bir kez; render'da üretme
        px = (width - PANEL_W) / 2;
        py = Math.max(8, (height - PANEL_H) / 2);
        int x = px + PAD;
        int w = PANEL_W - 2 * PAD;

        addDrawableChild(new HsToggle(x, py + 32, w, 20,
                Text.translatable("hardsetups.cekirdek.ayar.yuksek_kontrast"),
                settings.highContrastEffective(),
                on -> update(settings.withYuksekKontrast(on ? TemaAyarlari.YuksekKontrast.ACIK : TemaAyarlari.YuksekKontrast.KAPALI))));

        addDrawableChild(new HsToggle(x, py + 56, w, 20,
                Text.translatable("hardsetups.cekirdek.ayar.azaltilmis_hareket"),
                settings.azaltilmisHareket(),
                on -> update(settings.withAzaltilmisHareket(on))));

        addDrawableChild(new HsSlider(x, py + 84, w, 20, Text.empty(), (settings.hudOlcek() - 0.5) / 1.5) {
            {
                updateMessage();
            }

            private float scale() {
                return 0.5f + Math.round(value * 6) * 0.25f; // 0.5 … 2.0, 0.25 adım
            }

            @Override
            protected void updateMessage() {
                setMessage(Text.translatable("hardsetups.cekirdek.ayar.hud_olcek", Math.round(scale() * 100)));
            }

            @Override
            protected void applyValue() {
                update(settings.withHudOlcek(scale()));
            }
        });

        addDrawableChild(new HsButton(px + PANEL_W - PAD - 96, py + PANEL_H - PAD - 20, 96, 20,
                ScreenTexts.DONE, HsButton.Kind.PRIMARY, button -> close()));
    }

    private void update(TemaAyarlari next) {
        settings = next;
        HsThemeLoader.apply(next); // anında uygula; dosyaya ekran kapanınca yazılır
    }

    /** Arka plan: önce vanilya (kare başına BİR kez), sonra panel. Screen.render bunu widget'lardan önce çağırır. */
    @Override
    public void renderBackground(DrawContext ctx, int mouseX, int mouseY, float delta) {
        super.renderBackground(ctx, mouseX, mouseY, delta);
        HsDraw.surface(ctx, px, py, PANEL_W, PANEL_H);
        HsDraw.dropShadow(ctx, px, py, PANEL_W, PANEL_H);
    }

    @Override
    public void render(DrawContext ctx, int mouseX, int mouseY, float delta) {
        super.render(ctx, mouseX, mouseY, delta); // renderBackground + widget'lar
        ctx.drawText(textRenderer, heading, px + PAD, py + PAD, HsTheme.current().color(Role.ACCENT_TEXT), false);
    }

    @Override
    public void removed() {
        try {
            settings.save();
        } catch (IOException e) {
            LOG.warn("tema.json yazılamadı: {}", e.getMessage());
            HsToast.show(Durum.HATA, Text.translatable("hardsetups.cekirdek.toast.kaydedilemedi.baslik"),
                    Text.translatable("hardsetups.cekirdek.toast.kaydedilemedi.govde"));
        }
    }

    @Override
    public void close() {
        if (client != null) client.setScreen(parent);
    }
}
