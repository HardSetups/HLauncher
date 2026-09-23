// Döndürülebilir 3D skin görüntüleyici (skinview3d). Tek WebGL örneği kurulur;
// skin, model, pelerin ve animasyon değişince yeniden oluşturulmadan güncellenir.
// WebGL yoksa veya skin yüklenemezse 2D görsele düşer — launcher bozulmaz.
import { useEffect, useRef, useState } from 'react';
import { SkinViewer, IdleAnimation, WalkingAnimation, RunningAnimation, WaveAnimation, CrouchAnimation } from 'skinview3d';

const ANIMATIONS = {
  idle: () => new IdleAnimation(),
  walk: () => new WalkingAnimation(),
  run: () => new RunningAnimation(),
  wave: () => new WaveAnimation(),
  crouch: () => new CrouchAnimation(),
};

function accountSkinUrl(account) {
  if (account?.type === 'microsoft' && account.uuid) {
    return `https://crafatar.com/skins/${encodeURIComponent(account.uuid)}`;
  }
  return `https://minotar.net/skin/${encodeURIComponent(account?.name || 'Steve')}`;
}

function bustUrlFor(account) {
  return `https://minotar.net/armor/bust/${encodeURIComponent(account?.name || 'Steve')}/120.png`;
}

/**
 * skin: data URL / https URL (verilmezse hesaptan türetilir)
 * variant: 'classic' | 'slim' | undefined (otomatik algıla)
 * cape: data URL | null
 */
function SkinViewer3D({ account, skin, variant, cape = null, animation = 'idle', rotate = true, width = 140, height = 200, zoom = 0.9 }) {
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const skinUrl = skin || accountSkinUrl(account);

  // Görüntüleyici bir kez kurulur
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let viewer;
    try {
      viewer = new SkinViewer({ canvas, width, height, zoom });
      if (viewer.controls) {
        viewer.controls.enableZoom = false;
        viewer.controls.enablePan = false;
      }
    } catch {
      queueMicrotask(() => setFailed(true)); // WebGL yok (nadir sürücü/VM durumu)
      return undefined;
    }
    viewerRef.current = viewer;
    return () => {
      viewerRef.current = null;
      viewer.dispose();
    };
  // Boyut değişimi aşağıdaki efektte; bu yalnızca kurulum
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { viewerRef.current?.setSize(width, height); }, [width, height]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let stale = false;
    Promise.resolve(viewer.loadSkin(skinUrl, { model: variant === 'slim' ? 'slim' : variant === 'classic' ? 'default' : 'auto-detect' }))
      .catch(() => { if (!stale && !skin) setFailed(true); });
    return () => { stale = true; };
  }, [skinUrl, variant, skin]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (cape) Promise.resolve(viewer.loadCape(cape)).catch(() => viewer.resetCape());
    else viewer.resetCape();
  }, [cape]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.animation = (ANIMATIONS[animation] || ANIMATIONS.idle)();
  }, [animation]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.autoRotate = rotate;
    viewer.autoRotateSpeed = 0.6;
  }, [rotate]);

  if (failed) {
    return <img src={bustUrlFor(account)} alt="Skin" style={{ width: Math.min(width, 140), imageRendering: 'pixelated' }} />;
  }

  return <canvas ref={canvasRef} className="skin-canvas" style={{ width, height }} />;
}

export default SkinViewer3D;
