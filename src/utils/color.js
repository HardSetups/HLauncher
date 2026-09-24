// Vurgu renginin üzerine binen metin/ikon için okunabilir rengi (siyah/beyaz) seçer.
// WCAG göreli parlaklığı (sRGB doğrusallaştırma) ile iki adayın kontrastı hesaplanır,
// yüksek olan seçilir. Ör. Kiremit #A52B12 → beyaz (7.1:1), Ateş #ff6a3d → siyah.
function channel(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function contrastText(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const onWhite = 1.05 / (lum + 0.05);
  const onBlack = (lum + 0.05) / 0.05;
  return onBlack > onWhite ? '#000000' : '#ffffff';
}
