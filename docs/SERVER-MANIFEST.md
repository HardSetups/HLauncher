# HLauncher Sunucu Manifesti (hlauncher.json)

HLauncher'ın **sunucu dostu** özelliği: sunucu sahibi olarak bir URL'de küçük bir
JSON dosyası yayınlarsınız; oyuncu bu adresi launcher'a eklediğinde tek tıkla
sunucunuza uygun **sürüm + mod loader + mod seti** kurulur ve oyuncu doğru
profille bağlanır. Mod listenizi güncellediğinizde oyuncular bir sonraki
kurulumda otomatik eşitlenir (listeden çıkan modlar silinir, yeniler kurulur).

## Kullanım

1. Aşağıdaki şemaya uygun bir `hlauncher.json` dosyası hazırlayın.
2. HTTPS ile erişilebilen bir adreste yayınlayın (web siteniz, GitHub raw, CDN...).
3. Oyunculara adresi verin: launcher'da **Sunucular → Sunucu paketi URL** alanına
   yapıştırıp sunucuyu eklerler, karttaki 📦 düğmesine basarlar. Hepsi bu.

## Şema

```json
{
  "manifestVersion": 1,
  "name": "Örnek Sunucu",
  "address": "mc.orneksunucu.com",
  "mcVersion": "1.21.4",
  "loader": "fabric",
  "recommendedRam": 4,
  "mods": [
    { "type": "modrinth", "id": "sodium" },
    { "type": "modrinth", "id": "lithium", "versionId": "isteğe-bağlı-sürüm-id" },
    {
      "type": "url",
      "url": "https://cdn.orneksunucu.com/mods/ozel-mod-1.2.jar",
      "filename": "ozel-mod-1.2.jar",
      "sha1": "dosyanın-sha1-özeti"
    }
  ],
  "announcements": [
    { "date": "2026-08-17", "text": "Yeni sezon başladı!" }
  ]
}
```

## Alanlar

| Alan | Zorunlu | Açıklama |
|------|---------|----------|
| `manifestVersion` | ✅ | Her zaman `1` |
| `name` | ✅ | Oyuncuya gösterilen sunucu/profil adı |
| `address` | ✅ | Sunucu adresi (`host` veya `host:port`) |
| `mcVersion` | ✅ | Minecraft sürümü, örn. `"1.21.4"` |
| `loader` | ✅ | `release`, `optifine`, `fabric`, `quilt`, `forge`, `neoforge` |
| `recommendedRam` | — | Önerilen RAM (GB, 1-64). Profil bu değerle kurulur |
| `mods` | — | Mod listesi (en fazla 200). Aşağıya bakın |
| `announcements` | — | `{date, text}` listesi; launcher son 10 tanesini gösterir |

### Mod girdileri

**`type: "modrinth"`** — önerilen yol. `id` alanına Modrinth proje slug'ı veya
ID'si yazılır (örn. `sodium`). Launcher, `mcVersion` + `loader` ile uyumlu en
yeni sürümü zorunlu bağımlılıklarıyla birlikte kurar. Belirli bir sürüme
sabitlemek için `versionId` ekleyin.

**`type: "url"`** — kendi barındırdığınız jar'lar için. `url` HTTPS olmalı,
`filename` düz bir dosya adı olmalı ve `sha1` zorunludur (bozuk/değiştirilmiş
indirmeleri reddetmek için). SHA-1 özetini PowerShell'de şöyle alırsınız:
`Get-FileHash -Algorithm SHA1 .\ozel-mod-1.2.jar`

## Notlar

- Manifest uygulandığında `srv-<adres>` kimlikli özel bir profil oluşturulur;
  oyuncunun diğer profillerine ve dünyalarına dokunulmaz.
- Launcher'ın kurduğu modlar takip edilir: manifestten çıkardığınız mod,
  oyuncunun profilinden de kaldırılır. Oyuncunun elle eklediği modlara dokunulmaz.
- JSON'unuzu yayınlamadan önce doğrulamak için launcher'da herhangi bir sunucuya
  manifest URL'si olarak ekleyip deneyebilirsiniz; hatalar açık şekilde listelenir.
