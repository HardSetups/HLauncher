# HardSetups tema kimliği: `hardsetups:kiremit`

Launcher, oyun içi modlar ve site aynı görsel kimliği paylaşır. Değerlerin tek kaynağı [`tema.json`](tema.json); bu sayfa ne işe yaradıklarını anlatır. Oyun içi uygulama rehberi: [`oyun-ici/`](oyun-ici/README.md).

## Karakter

**Dövülmüş grafit üstünde kiremit.** Koyu, sakin yüzeyler; tek sıcak vurgu. Premium hissi parıltıdan değil derinlikten ve özenden gelir:

- Yüzeyler katmanlıdır: zemin → yüzey → kart. Her katman bir ton açılır, üst kenarında çok ince bir ışık çizgisi taşır.
- Vurgu (kiremit) yalnızca birincil eylemde, seçili durumda ve önemli bilgide kullanılır. Bir ekranda tek birincil eylem olur.
- İmza şekil **pahlı köşe**dir (köşesi kesik kare). Minecraft bloklarının ve Chakra Petch harflerinin kesik köşelerini tekrar eder. Launcher'da `corner-shape: bevel`, oyunda 1 texel'lik köşe kesiği.
- Yapılmayacaklar: neon parıltı, metin gölgesi ile parlatma, gökkuşağı degradeleri, sürekli yanıp sönen öğe, emoji ikon.

## Renkler

| Ad | Değer | Kullanım |
|---|---|---|
| Kiremit 500 | `#A52B12` | Marka dolgusu: birincil düğme, seçili sekme işareti. Üstündeki metin beyaz (7.1:1) |
| Kiremit 400 | `#EC6A51` | Koyu zeminde vurgu metni, bağlantı, ikon, odak halkası (5.9:1) |
| Kiremit 600 | `#7F200D` | Basılı düğme, dolgunun gölge tarafı |
| Kiremit 300 | `#F4957F` | Açık vurgu (üzerine gelme metni), çok az |
| Kor | `#F0A04B` | Nadir vurgu: indirim, "yeni", ödül. Bir ekranda en fazla bir kez |
| Grafit 950–600 | `#0B0C0F` … `#3A3F49` | Zemin, yüzey, kart ve çizgiler (tema.json › roles) |
| Metin | `#F2F3F5` / `#B3B7C0` / `#7C818C` | Birincil / ikincil / üçüncül. Saf beyaz kullanılmaz |
| Durum | başarı `#3FCF7B`, uyarı `#E7A93B`, hata `#E5484D`, bilgi `#4C8DFF` | Yalnızca durum bildirir, süs değildir |

Launcher'da oyuncu vurgu rengini değiştirebilir; **varsayılan** Kiremit'tir. Modlar ve site her zaman Kiremit kullanır.

## Derinlik ve arka plan

- Zemin düz tek renk değildir: grafit 950'den 900'e çok yumuşak bir geçiş, sol üstte kiremitin %6–10 opaklıkta geniş, bulanık bir ışığı, kenarlarda hafif karartma ve %2–3 opaklıkta ince bir doku (grain).
- Kartlar: `raised` zemin, 1 px `line` kenar, üst kenarda `rgba(255,255,255,0.05)` ışık çizgisi, altta yumuşak gölge.
- Hareket 120–260 ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`; `prefers-reduced-motion` açıksa kapanır.

## Yazı

- Launcher: başlıklar Chakra Petch 600/700, arayüz Segoe UI Variable. Site: Poppins.
- Oyun içi: vanilya Minecraft yazı tipi (Türkçe karakterler doğru görünür). Başlıklar kalın + Kiremit 400.
- Büyük harfli, harf aralığı açılmış etiket kullanılmaz. Cümle düzeni: "Kütüphanem", "Şimdi oyna".

## Ses ve dil

Türkçe önce, İngilizce tam karşılık. "Sen" hitabı, kısa cümle. Hata metni: ne oldu + ne yapmalı.
