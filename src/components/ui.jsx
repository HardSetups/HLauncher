// Küçük, tekrar kullanılan arayüz parçaları: profil ikonu, anahtar, açılır menü.
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const url = instance?.iconUrl;
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

/**
 * Açılır menü. trigger: (props) => düğme; items: [{ label, icon, onSelect, danger, disabled }]
 * veya children (serbest içerik). align: 'start' | 'end'.
 */
export function Menu({ trigger, items, children, align = 'end', width }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    // Tıklamalar menünün içinde kalır: tıklanabilir bir satırın içindeyken satırı tetiklemesin
    <div className="menu" ref={rootRef} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <AnimatePresence>
      {open && (
        <motion.div
          className={`menu-panel menu-${align}`}
          role="menu"
          style={width ? { width } : undefined}
          initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.12 }}
        >
          {items && items.map((item) => (
            <button
              key={item.label}
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
      </AnimatePresence>
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
