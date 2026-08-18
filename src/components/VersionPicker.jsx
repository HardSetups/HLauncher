import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, Check } from 'lucide-react';
import { contrastText } from '../utils/color';
import { useI18n } from '../i18n.jsx';

const LOADERS = [
  { id: 'release', label: 'Release' },
  { id: 'optifine', label: 'OptiFine' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'quilt', label: 'Quilt' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge', experimental: true },
];

function VersionPicker({ accent, loaderType, setLoaderType, versionManifest, versionManifestLoading, versionManifestError, selectedVersion, setSelectedVersion }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  // Dışarı tıklanınca kapat
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? versionManifest.filter((v) => v.id.includes(q)) : versionManifest;
  }, [versionManifest, query]);

  const latestId = versionManifest[0]?.id;

  const dropdownLabel = versionManifestLoading
    ? t('vp.loading')
    : versionManifestError
      ? t('vp.error')
      : (selectedVersion || t('vp.select'));

  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch', flexWrap: 'wrap' }}>

      {/* Loader segmented control */}
      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '14px', padding: '4px', border: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
        {LOADERS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLoaderType(l.id)}
            title={l.experimental ? t('vp.experimental') : ''}
            style={{
              position: 'relative', background: 'none', border: 'none',
              borderRadius: '10px', padding: '10px 14px',
              fontWeight: '700', fontSize: '12px', cursor: 'pointer',
              color: loaderType === l.id ? contrastText(accent) : 'rgba(255,255,255,0.7)',
            }}
          >
            {loaderType === l.id && (
              <motion.div
                layoutId="loader-pill"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                style={{ position: 'absolute', inset: 0, background: accent, borderRadius: '10px', zIndex: 0 }}
              />
            )}
            <span style={{ position: 'relative', zIndex: 1 }}>
              {l.label}
              {l.experimental && <sup style={{ fontSize: '8px', marginLeft: '2px' }}>β</sup>}
            </span>
          </button>
        ))}
      </div>

      {/* Sürüm dropdown */}
      <div ref={rootRef} style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
        <button
          onClick={() => !versionManifestLoading && setOpen((v) => !v)}
          disabled={versionManifestLoading || !!versionManifestError}
          style={{
            width: '100%', height: '100%', minHeight: '46px',
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${open ? accent : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '14px', padding: '0 16px', color: '#fff', fontSize: '15px', fontWeight: '600',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
            transition: 'border-color 0.2s',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {dropdownLabel}
            {selectedVersion && selectedVersion === latestId && (
              <span style={{ fontSize: '10px', fontWeight: '800', background: `${accent}22`, color: accent, padding: '3px 8px', borderRadius: '10px', letterSpacing: '0.5px' }}>{t('vp.latest')}</span>
            )}
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} style={{ display: 'flex' }}>
            <ChevronDown size={18} color="rgba(255,255,255,0.5)" />
          </motion.span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 100,
                background: '#12121c', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <Search size={15} color="rgba(255,255,255,0.4)" />
                <input
                  autoFocus
                  type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('vp.search')}
                  style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: '14px', outline: 'none' }}
                />
              </div>
              <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '6px' }}>
                {filtered.length === 0 && (
                  <p style={{ padding: '14px', fontSize: '13px', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>{t('vp.none')}</p>
                )}
                {filtered.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => { setSelectedVersion(v.id); setOpen(false); setQuery(''); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: selectedVersion === v.id ? `${accent}18` : 'none',
                      border: 'none', borderRadius: '10px', padding: '10px 12px',
                      color: selectedVersion === v.id ? accent : 'rgba(255,255,255,0.85)',
                      fontSize: '14px', fontWeight: selectedVersion === v.id ? '700' : '500', cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {v.id}
                      {v.id === latestId && (
                        <span style={{ fontSize: '9px', fontWeight: '800', background: `${accent}22`, color: accent, padding: '2px 6px', borderRadius: '8px' }}>{t('vp.latest')}</span>
                      )}
                    </span>
                    {selectedVersion === v.id && <Check size={15} />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default VersionPicker;
