package com.hardsetups.core.theme;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.sound.PositionedSoundInstance;
import net.minecraft.sound.SoundEvent;
import net.minecraft.util.Identifier;

/**
 * Arayüz sesleri. Kimlikler assets/hardsetups/sounds.json'daki olay adlarıdır.
 * Yalnızca istemcide çalan arayüz sesi için kayıt (Registry) şart değildir: ses kimliğiyle sounds.json'dan bulunur.
 * Dünyada çalan ya da sunucudan tetiklenen oyun sesleri ise Registries.SOUND_EVENT'e kaydedilir. İstemci sınıfı.
 */
public final class HsSesler {
    private HsSesler() {
    }

    public static final SoundEvent BILDIRIM = SoundEvent.of(Identifier.of("hardsetups", "ui.bildirim"));
    public static final SoundEvent BASARI = SoundEvent.of(Identifier.of("hardsetups", "ui.basari"));
    public static final SoundEvent HATA = SoundEvent.of(Identifier.of("hardsetups", "ui.hata"));

    /** Konumsuz arayüz sesi; perde 1.0, ses düzeyi en fazla 0.6. */
    public static void ui(SoundEvent sound) {
        MinecraftClient.getInstance().getSoundManager().play(PositionedSoundInstance.master(sound, 1.0f, 0.6f));
    }
}
