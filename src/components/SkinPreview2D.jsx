// Skin PNG'sinden hafif 2D ön görünüm (kafa, gövde, kollar, bacaklar + katmanlar).
// Kütüphane kartlarında her biri için ayrı WebGL açmamak için canvas ile çizilir.
import { useEffect, useRef } from 'react';

// [kaynakX, kaynakY, genişlik, yükseklik, hedefX, hedefY] — 16×32 ön görünüm
function frontParts(slim, legacy) {
  const arm = slim ? 3 : 4;
  const parts = [
    // taban katman
    [8, 8, 8, 8, 4, 0],            // kafa
    [20, 20, 8, 12, 4, 8],         // gövde
    [44, 20, arm, 12, 4 - arm, 8], // sağ kol (izleyicinin solu)
    [4, 20, 4, 12, 4, 20],         // sağ bacak
  ];
  if (legacy) {
    // 64×32 eski skinlerde sol kol/bacak yok → sağdakiler aynalanır
    parts.push([44, 20, arm, 12, 12, 8, true], [4, 20, 4, 12, 8, 20, true]);
  } else {
    parts.push([36, 52, arm, 12, 12, 8], [20, 52, 4, 12, 8, 20]);
  }
  // dış katmanlar
  parts.push([40, 8, 8, 8, 4, 0]);
  if (!legacy) {
    parts.push([20, 36, 8, 12, 4, 8], [44, 36, arm, 12, 4 - arm, 8], [52, 52, arm, 12, 12, 8], [4, 36, 4, 12, 4, 20], [4, 52, 4, 12, 8, 20]);
  }
  return parts;
}

export default function SkinPreview2D({ src, variant = 'classic', scale = 4, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !src) return undefined;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 16, 32);
      ctx.imageSmoothingEnabled = false;
      const legacy = img.naturalHeight === 32;
      for (const [sx, sy, w, h, dx, dy, mirror] of frontParts(variant === 'slim', legacy)) {
        if (mirror) {
          ctx.save();
          ctx.translate(dx + w, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
          ctx.restore();
        } else {
          ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h);
        }
      }
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src, variant]);

  return <canvas ref={ref} width={16} height={32} className={`skin-2d ${className}`} style={{ width: 16 * scale, height: 32 * scale }} />;
}

// Pelerin ön yüzü (64×32 dokuda 1,1 → 10×16)
export function CapePreview({ src, scale = 3 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !src) return undefined;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const k = img.naturalWidth / 64; // yüksek çözünürlüklü pelerinler
      ctx.clearRect(0, 0, 10, 16);
      ctx.drawImage(img, 1 * k, 1 * k, 10 * k, 16 * k, 0, 0, 10, 16);
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return <canvas ref={ref} width={10} height={16} className="skin-2d" style={{ width: 10 * scale, height: 16 * scale }} />;
}
