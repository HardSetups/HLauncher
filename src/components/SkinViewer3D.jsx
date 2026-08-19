// Döndürülebilir 3D skin görüntüleyici (skinview3d). WebGL yoksa veya skin
// yüklenemezse 2D bust görseline düşer — launcher asla bu yüzden bozulmaz.
import { useEffect, useRef, useState } from 'react';
import { SkinViewer, IdleAnimation } from 'skinview3d';

function skinUrlFor(account) {
  if (account?.type === 'microsoft' && account.uuid) {
    return `https://crafatar.com/skins/${encodeURIComponent(account.uuid)}`;
  }
  return `https://minotar.net/skin/${encodeURIComponent(account?.name || 'Steve')}`;
}

function bustUrlFor(account) {
  return `https://minotar.net/armor/bust/${encodeURIComponent(account?.name || 'Steve')}/120.png`;
}

function SkinViewer3D({ account, width = 140, height = 200 }) {
  const canvasRef = useRef(null);
  // Hangi URL'in başarısız olduğunu tutar; URL değişince otomatik sıfırlanır
  // (effect içinde senkron setState gerekmez).
  const [failedUrl, setFailedUrl] = useState(null);
  const skinUrl = skinUrlFor(account);
  const failed = failedUrl === skinUrl;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let viewer;
    try {
      viewer = new SkinViewer({ canvas, width, height });
      viewer.animation = new IdleAnimation();
      viewer.autoRotate = true;
      viewer.autoRotateSpeed = 0.5;
      if (viewer.controls) {
        viewer.controls.enableZoom = false;
        viewer.controls.enablePan = false;
      }
    } catch {
      // WebGL kullanılamıyor (nadir sürücü/VM durumları)
      queueMicrotask(() => setFailedUrl(skinUrl));
      return undefined;
    }

    let disposed = false;
    Promise.resolve(viewer.loadSkin(skinUrl))
      .catch(() => { if (!disposed) setFailedUrl(skinUrl); });

    return () => {
      disposed = true;
      viewer.dispose();
    };
  }, [skinUrl, width, height, failed]);

  if (failed) {
    return (
      <img
        src={bustUrlFor(account)}
        alt="Skin"
        style={{ width: `${Math.min(width, 120)}px`, filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))' }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px`, cursor: 'grab', touchAction: 'none' }}
    />
  );
}

export default SkinViewer3D;
