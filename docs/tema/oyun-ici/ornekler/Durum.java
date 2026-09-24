package com.hardsetups.core.theme;

/**
 * Durum türleri. Renk tek başına bilgi taşımaz: her durumun sözlü bir etiketi vardır
 * (sohbette "Hata:", toast'ta başlık). Ortak sınıf.
 */
public enum Durum {
    BILGI(Role.INFO, "bilgi", "Bilgi"),
    BASARI(Role.SUCCESS, "basari", "Tamam"),
    UYARI(Role.WARNING, "uyari", "Uyarı"),
    HATA(Role.DANGER, "hata", "Hata");

    public final Role role;
    /** Dil anahtarı: hardsetups.cekirdek.durum.<ad> */
    public final String labelKey;
    /** Dil dosyası yoksa (ör. modsuz istemci) gösterilecek Türkçe yedek. */
    public final String fallback;

    Durum(Role role, String name, String fallback) {
        this.role = role;
        this.labelKey = "hardsetups.cekirdek.durum." + name;
        this.fallback = fallback;
    }
}
