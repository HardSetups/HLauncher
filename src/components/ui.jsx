// Küçük, tekrar kullanılan arayüz parçaları: profil ikonu, anahtar, açılır menü.
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toImageSrc } from '../utils/portal.js';

// Profil ikonu: Modrinth ikonu varsa o; yoksa profil kimliğinden türetilen
// simetrik 5×5 piksel desen (Minecraft'a yakışan bir "identicon"). Aynı profil
// her yerde aynı görünür; iki profil neredeyse hiç aynı çıkmaz.
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function cellsFrom(bits, toneBits) {
  const cells = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (!((bits >>> (row * 3 + col)) & 1)) continue;
      const tone = (toneBits >>> (row * 3 + col)) & 1; // iki ton: derinlik hissi
      cells.push({ x: col, y: row, tone });
      if (col < 2) cells.push({ x: 4 - col, y: row, tone }); // aynala
    }
  }
  return cells;
}

function pixelPattern(seed) {
  const b = fnv1a(`${seed}#hl`);
  const hue = b % 360;
  // 3 benzersiz sütun × 5 satır = 15 bit. Çok boş/çok dolu desen okunmuyor:
  // okunur yoğunlukta (10-18 hücre) olan ilk tuzlu varyantı seç — deterministik.
  let cells = [];
  for (let salt = 0; salt < 12; salt++) {
    cells = cellsFrom(fnv1a(`${seed}:${salt}`), b >>> 9);
    if (cells.length >= 10 && cells.length <= 18) break;
  }
  return {
    cells,
    bg: `hsl(${hue} 26% 15%)`,
    fg: `hsl(${hue} 62% 64%)`,
    fg2: `hsl(${hue} 50% 48%)`,
  };
}

export function InstanceIcon({ instance, size = 40, fill = false, className = '' }) {
  const [failed, setFailed] = useState(null);
  // HardSetups ürün ikonları sunucudan gelir: ana süreç önbelleği üzerinden (izinli host denetimli)
  const url = instance?.origin === 'hardsetups' ? toImageSrc(instance.iconUrl) : instance?.iconUrl;
  const style = fill ? undefined : { width: size, height: size };
  const cls = `inst-icon${fill ? ' is-fill' : ''} ${className}`;
  if (url && failed !== url) {
    return (
      <span className={cls} style={style}>
        <img src={url} alt="" onError={() => setFailed(url)} />
      </span>
    );
  }
  const p = pixelPattern(instance?.id || instance?.name || '?');
  return (
    <span className={`${cls} inst-icon-px`} style={{ ...style, background: p.bg }} aria-hidden>
      <svg viewBox="-1 -1 7 7" preserveAspectRatio="xMidYMid meet" shapeRendering="crispEdges">
        {p.cells.map((c) => (
          <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width="1" height="1" fill={c.tone ? p.fg2 : p.fg} />
        ))}
      </svg>
    </span>
  );
}

export function Switch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

// ── Açılır katmanlar (Menu, VersionMenu) ─────────────────────────────────
// Panel tetikleyicinin içinde değil, uygulama kabuğuna (portal) sabit konumla çizilir:
// taşmayı kesen kapsayıcılar (overflow: hidden bantlar, kartlar, kaydırılan listeler,
// modal gövdesi) ve dönüşümlü (transform) sayfa animasyonları paneli kesemez. Aşağıda yer
// yoksa yukarı açılır, pencereden taşmaz; kaydırma/boyut değişince yeniden yerleşir.
const FLOAT_GAP = 6;
const FLOAT_MARGIN = 8;

// Portal kabı: App.jsx kabuğun içinde #hl-floating'i çizer (vurgu rengi değişkenleri .app-shell'de,
// panel onları miras alsın). Kabuk yoksa (ör. giriş ekranı) body.
// eslint-disable-next-line react-refresh/only-export-components
export const floatingHost = () => document.getElementById('hl-floating') || document.body;

/**
 * Açık paneli tetikleyiciye göre yerleştirir ve kapatma davranışını kurar (dışarı tıklama, Escape).
 * Konum doğrudan panelin stiline yazılır (her kaydırmada yeniden çizim olmasın).
 * align: 'start' (sol kenarlar hizalı) | 'end' (sağ kenarlar); matchWidth: panel tetikleyici kadar geniş;
 * maxHeight: panelin en fazla yüksekliği (yer yoksa küçülür, en az minHeight);
 * lockSide: açıldığı taraf (alt/üst) açık kaldıkça korunur — içinde arama yapılan listede panel
 * yazarken tetikleyicinin öbür yanına atlamasın (o tarafta yer tükenirse yine döner).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useFloating({ open, onClose, anchorRef, panelRef, align = 'start', matchWidth = false, maxHeight = 480, minHeight = 140, lockSide = false }) {
  const sideRef = useRef(null); // son yerleşimde yukarı mı açıldı (lockSide)
  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Üst sınır: üst barın altı (yukarı açılan panel sürükleme alanını ve pencere düğmelerini örtmesin)
    const topEdge = Math.max(0, document.querySelector('.app-main')?.getBoundingClientRect().top ?? 0) + FLOAT_MARGIN;
    // Tetikleyici kaydırmayla görünür alandan çıktıysa panel boşlukta asılı kalmasın: kapan
    if (r.bottom < topEdge - FLOAT_MARGIN || r.top > vh) { onClose(); return; }
    if (matchWidth) panel.style.width = `${Math.min(r.width, vw - 2 * FLOAT_MARGIN)}px`;
    const pw = panel.offsetWidth;
    const ph = panel.scrollHeight;
    const below = vh - r.bottom - FLOAT_GAP - FLOAT_MARGIN;
    const above = r.top - FLOAT_GAP - topEdge;
    // Panelin sığması gereken boy (uzun listelerde üst sınır): aşağıya sığmıyorsa ve yukarıda daha çok yer varsa yukarı
    let up = Math.min(ph, maxHeight) > below && above > below;
    if (lockSide && sideRef.current !== null) {
      const kept = sideRef.current;
      const space = kept ? above : below;
      up = space >= Math.min(ph, minHeight) || space >= (kept ? below : above) ? kept : !kept;
    }
    sideRef.current = up;
    const limit = Math.max(minHeight, Math.min(up ? above : below, maxHeight));
    const left = Math.min(Math.max(FLOAT_MARGIN, align === 'start' ? r.left : r.right - pw), vw - pw - FLOAT_MARGIN);
    const top = up ? Math.max(topEdge, r.top - FLOAT_GAP - Math.min(ph, limit)) : r.bottom + FLOAT_GAP;
    Object.assign(panel.style, {
      top: `${top}px`, left: `${left}px`, maxHeight: `${limit}px`, transformOrigin: up ? 'bottom' : 'top', visibility: 'visible',
    });
  }, [anchorRef, panelRef, align, matchWidth, maxHeight, minHeight, lockSide, onClose]);

  useLayoutEffect(() => {
    if (open) place();
    else sideRef.current = null;
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const inside = (target) => anchorRef.current?.contains(target) || panelRef.current?.contains(target);
    const onDown = (e) => { if (!inside(e.target)) onClose(); };
    // Escape yalnızca açılır katmanı kapatır: altındaki modal (window dinleyicisi) kapanmasın
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true); // herhangi bir kapsayıcı kaydırılınca
    // İçerik sonradan yüklenirse (ör. bildirim listesi) ya da tetikleyici büyürse: yeniden yerleş
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place()) : null;
    if (observer && panelRef.current) observer.observe(panelRef.current);
    if (observer && anchorRef.current) observer.observe(anchorRef.current);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
      observer?.disconnect();
    };
  }, [open, onClose, place, anchorRef, panelRef]);
}

/**
 * Açılır menü. trigger: (props) => düğme; items: [{ label, icon, onSelect, danger, disabled }]
 * veya children (serbest içerik). align: 'start' | 'end'.
 */
export function Menu({ trigger, items, children, align = 'end', width }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useFloating({ open, onClose: close, anchorRef: rootRef, panelRef, align });

  const toggle = () => setOpen((v) => !v);

  return (
    // Tıklamalar menünün içinde kalır: tıklanabilir bir satırın içindeyken satırı tetiklemesin.
    // React portal olayları React ağacında kabarır; bu yüzden panelden gelenler de burada durur.
    <div className="menu" ref={rootRef} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {trigger({ open, toggle })}
      {createPortal(
      <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          className={`menu-panel menu-${align} is-floating`}
          role="menu"
          style={width ? { width } : undefined} /* konum ve görünürlük: place() */
          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {items && items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu-item${item.danger ? ' is-danger' : ''}`}
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onSelect(); }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </motion.div>
      )}
      </AnimatePresence>,
      floatingHost(),
      )}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {text && <p className="empty-text">{text}</p>}
      {action}
    </div>
  );
}
