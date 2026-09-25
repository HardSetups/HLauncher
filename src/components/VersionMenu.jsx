// Sürüm (+ isteğe bağlı loader) seçici: açılır panel, aranabilir sürüm listesi.
// hideLoaders → yalnızca sürüm; allowLatest → "Her zaman en yeni" (null) seçeneği.
// Panel Menu gibi kabuğa portal ile sabit konumla çizilir (ui.jsx useFloating): modal gövdesi ya da
// kaydırılan sayfa onu kesmez; yer olan tarafa açılır, kaydırınca tetikleyiciyle birlikte gider.
import { useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, Check } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { useFloating, floatingHost } from './ui.jsx';

const LOADERS = [
  { id: 'release', label: 'Vanilla' },
  { id: 'optifine', label: 'OptiFine' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'quilt', label: 'Quilt' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge', experimental: true },
];

function VersionMenu({
  align = 'start', block = false, hideLoaders = false, allowLatest = false,
  loaderType, setLoaderType, versionManifest, versionManifestLoading, versionManifestError,
  selectedVersion, setSelectedVersion,
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  // Blok tetikleyicide panel tetikleyici kadar geniş (ör. profil ayarları, yeni profil)
  useFloating({ open, onClose: close, anchorRef: rootRef, panelRef, align, matchWidth: block, maxHeight: 340, minHeight: 200, lockSide: true });

  const toggle = () => setOpen((v) => !v);

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? versionManifest.filter((v) => v.id.includes(q)) : versionManifest;
  }, [versionManifest, query]);

  const latestId = versionManifest[0]?.id;
  const followsLatest = allowLatest && !selectedVersion;
  const loaderLabel = LOADERS.find((l) => l.id === loaderType)?.label || loaderType;
  const versionLabel = versionManifestLoading
    ? t('vp.loading')
    : versionManifestError ? t('vp.error')
      : followsLatest ? t('vp.alwaysLatest', { version: latestId || '' }) : (selectedVersion || t('vp.select'));

  const choose = (v) => { setSelectedVersion(v); setOpen(false); setQuery(''); };

  return (
    <div ref={rootRef} className={`vmenu${block ? ' is-block' : ''}`}>
      <button
        type="button"
        className={`vmenu-trigger${open ? ' is-open' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="vmenu-trigger-text">
          {!hideLoaders && <b>{loaderLabel}</b>} <span className={hideLoaders ? 'is-strong' : ''}>{versionLabel}</span>
          {!followsLatest && selectedVersion && selectedVersion === latestId && <span className="vmenu-latest">{t('vp.latestShort')}</span>}
        </span>
        <ChevronDown size={16} className={`vmenu-chevron${open ? ' is-open' : ''}`} />
      </button>

      {createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            className={`vmenu-panel is-floating${hideLoaders ? ' is-single' : ''}`}
            role="dialog"
            aria-label={t('dash.version.label')}
            /* konum, yükseklik ve görünürlük: useFloating */
            initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {!hideLoaders && (
              <div className="vmenu-loaders">
                <span className="vmenu-heading">Loader</span>
                {LOADERS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`vmenu-item${loaderType === l.id ? ' is-selected' : ''}`}
                    onClick={() => setLoaderType(l.id)}
                    title={l.experimental ? t('vp.experimental') : undefined}
                  >
                    <span>{l.label}{l.experimental && <sup className="vmenu-beta">β</sup>}</span>
                    {loaderType === l.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}

            <div className="vmenu-versions">
              <label className="vmenu-search">
                <Search size={14} />
                <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('vp.search')} />
              </label>
              <div className="vmenu-list">
                {allowLatest && !query && (
                  <button type="button" className={`vmenu-item vmenu-item-latest${followsLatest ? ' is-selected' : ''}`} onClick={() => choose(null)}>
                    <span>{t('vp.alwaysLatestItem')} <span className="muted">· {latestId}</span></span>
                    {followsLatest && <Check size={14} />}
                  </button>
                )}
                {versionManifestError && <p className="vmenu-empty">{t('vp.error')}</p>}
                {!versionManifestError && filtered.length === 0 && <p className="vmenu-empty">{versionManifestLoading ? t('vp.loading') : t('vp.none')}</p>}
                {filtered.map((v) => {
                  const selected = !followsLatest && selectedVersion === v.id;
                  return (
                    <button key={v.id} type="button" className={`vmenu-item${selected ? ' is-selected' : ''}`} onClick={() => choose(v.id)}>
                      <span>
                        {v.id}
                        {v.id === latestId && <span className="vmenu-latest">{t('vp.latestShort')}</span>}
                      </span>
                      {selected && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      floatingHost(),
      )}
    </div>
  );
}

export default VersionMenu;
