// Sürüm (+ isteğe bağlı loader) seçici: açılır panel, aranabilir sürüm listesi.
// hideLoaders → yalnızca sürüm; allowLatest → "Her zaman en yeni" (null) seçeneği.
import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, Check } from 'lucide-react';
import { useI18n } from '../i18n.jsx';

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
  // Panel yerleşimi: yer olan tarafa açılır, yüksekliği sığacak kadar
  const [placement, setPlacement] = useState({ up: false, maxHeight: 320 });
  const rootRef = useRef(null);

  const toggle = () => {
    if (!open && rootRef.current) {
      // Taşanı kırpan en yakın kaydırma alanına göre ölç (yoksa pencere)
      const r = rootRef.current.getBoundingClientRect();
      const box = rootRef.current.closest('.page-scroll, .modal')?.getBoundingClientRect() || { top: 0, bottom: window.innerHeight };
      const bottom = Math.min(box.bottom, window.innerHeight);
      const below = bottom - r.bottom - 10;
      const above = r.top - Math.max(box.top, 0) - 10;
      const up = below < 280 && above > below;
      setPlacement({ up, maxHeight: Math.max(200, Math.min(340, up ? above : below)) });
    }
    setOpen((v) => !v);
  };

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

      <AnimatePresence>
        {open && (
          <motion.div
            className={`vmenu-panel${placement.up ? ' is-up' : ''}${align === 'end' ? ' is-end' : ''}${hideLoaders ? ' is-single' : ''}`}
            style={{ maxHeight: placement.maxHeight }}
            role="dialog"
            aria-label={t('dash.version.label')}
            initial={{ opacity: 0, y: placement.up ? 6 : -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: placement.up ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
          >
            {!hideLoaders && (
              <div className="vmenu-loaders">
                <span className="vmenu-heading">Loader</span>
                {LOADERS.map((l) => (
                  <button
                    key={l.id}
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
                  <button className={`vmenu-item vmenu-item-latest${followsLatest ? ' is-selected' : ''}`} onClick={() => choose(null)}>
                    <span>{t('vp.alwaysLatestItem')} <span className="muted">· {latestId}</span></span>
                    {followsLatest && <Check size={14} />}
                  </button>
                )}
                {versionManifestError && <p className="vmenu-empty">{t('vp.error')}</p>}
                {!versionManifestError && filtered.length === 0 && <p className="vmenu-empty">{versionManifestLoading ? t('vp.loading') : t('vp.none')}</p>}
                {filtered.map((v) => {
                  const selected = !followsLatest && selectedVersion === v.id;
                  return (
                    <button key={v.id} className={`vmenu-item${selected ? ' is-selected' : ''}`} onClick={() => choose(v.id)}>
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
      </AnimatePresence>
    </div>
  );
}

export default VersionMenu;
