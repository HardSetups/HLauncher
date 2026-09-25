package com.hardsetups.core.theme;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.resource.ResourceManagerHelper;
import net.minecraft.resource.ResourceType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Çekirdek modun istemci girişi (fabric.mod.json › entrypoints.client). Tema yükleyicisini kaydeder.
 * Ürün modları yükleyici KAYDETMEZ; yalnızca HsTheme.current() okur ve HsTheme.CHANGED'i dinler.
 */
public final class HardSetupsCoreClient implements ClientModInitializer {
    private static final Logger LOG = LoggerFactory.getLogger("HardSetups/Tema");

    @Override
    public void onInitializeClient() {
        ResourceManagerHelper.get(ResourceType.CLIENT_RESOURCES).registerReloadListener(new HsThemeLoader());
        HsTheme.CHANGED.register(theme ->
                LOG.info("Tema: {} (yüksek kontrast: {}, azaltılmış hareket: {})",
                        theme.id(), theme.highContrast(), theme.reducedMotion()));
    }
}
