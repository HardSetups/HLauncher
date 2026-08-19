import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, Download, Trash2, Zap, Package, Loader2, RefreshCw, ArrowUpCircle } from 'lucide-react';
import { contrastText } from '../utils/color';
import { useI18n } from '../i18n.jsx';

const MODDED_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];

function formatSize(bytes) {
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ModsPanel({ instance, accent, latestVersionId, onError, onNotice, onProfilesRefresh }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState(null); // proje id
  const [busyAction, setBusyAction] = useState(null); // 'perf' | 'mrpack'
  const [installedMods, setInstalledMods] = useState([]);
  const [progressMsg, setProgressMsg] = useState(null);
  const [updates, setUpdates] = useState(null); // null = denetlenmedi
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatingFile, setUpdatingFile] = useState(null); // dosya adı | 'all'
  const searchTimer = useRef(null);

  const canMod = instance && MODDED_LOADERS.includes(instance.loader);
  const mcVersion = instance?.mcVersion || latestVersionId || null;

  const refreshInstalled = useCallback(() => {
    if (!instance) return;
    window.electronAPI.listMods(instance.id).then(setInstalledMods).catch(() => setInstalledMods([]));
  }, [instance]);

  useEffect(() => { refreshInstalled(); }, [refreshInstalled]);

  // Mod kurulum ilerleme mesajları ({key, params} olarak gelir, render'da çevrilir)
  useEffect(() => {
    window.electronAPI.onModProgress((p) => setProgressMsg(p));
  }, []);

  const runSearch = useCallback((q) => {
    if (!canMod || !mcVersion) return;
    setSearching(true);
    window.electronAPI.searchMods({ query: q, mcVersion, loader: instance.loader, limit: 20 })
      .then((res) => setResults(res.hits || []))
      .catch((err) => onError(err.message))
      .finally(() => setSearching(false));
  }, [canMod, mcVersion, instance, onError]);

  // İlk açılışta popüler modları getir; yazarken 400ms debounce ile ara
  useEffect(() => {
    if (!canMod || !mcVersion) return;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(query.trim()), query ? 400 : 0);
    return () => clearTimeout(searchTimer.current);
  }, [query, canMod, mcVersion, runSearch]);

  const handleInstall = async (mod) => {
    setInstalling(mod.id);
    setProgressMsg(null);
    try {
      const res = await window.electronAPI.installMod(instance.id, mod.id);
      if (!res.ok) { onError(res.error); return; }
      onNotice(t('mods.installedOk', { name: mod.title, count: res.installed.length }));
      refreshInstalled();
    } finally {
      setInstalling(null);
      setProgressMsg(null);
    }
  };

  const handlePerfPreset = async () => {
    setBusyAction('perf');
    setProgressMsg(null);
    try {
      const res = await window.electronAPI.installPerformancePreset(instance.id);
      if (!res.ok) { onError(res.error); return; }
      const skipped = res.skipped.length ? t('mods.perf.skippedSuffix', { count: res.skipped.length }) : '';
      onNotice(t('mods.perf.done', { count: res.installed.length, skipped }));
      refreshInstalled();
    } finally {
      setBusyAction(null);
      setProgressMsg(null);
    }
  };

  const handleMrpack = async () => {
    setBusyAction('mrpack');
    setProgressMsg(null);
    try {
      const res = await window.electronAPI.importMrpack();
      if (res.canceled) return;
      if (!res.ok) { onError(res.error); return; }
      onNotice(t('mods.mrpack.done', { name: res.name, count: res.fileCount }));
      onProfilesRefresh();
    } finally {
      setBusyAction(null);
      setProgressMsg(null);
    }
  };

  const handleRemove = async (fileName) => {
    await window.electronAPI.removeMod(instance.id, fileName);
    setUpdates((prev) => prev?.filter((u) => u.oldFile !== fileName) ?? null);
    refreshInstalled();
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const res = await window.electronAPI.checkModUpdates(instance.id);
      if (!res.ok) { onError(res.error); return; }
      setUpdates(res.updates);
      if (!res.updates.length) onNotice(t('mods.upToDate', { count: res.checked }));
    } finally {
      setCheckingUpdates(false);
    }
  };

  const applyOneUpdate = async (update) => {
    const res = await window.electronAPI.applyModUpdate(instance.id, update);
    if (!res.ok) { onError(res.error); return false; }
    setUpdates((prev) => prev?.filter((u) => u.oldFile !== update.oldFile) ?? null);
    return true;
  };

  const handleUpdateOne = async (update) => {
    setUpdatingFile(update.oldFile);
    try {
      if (await applyOneUpdate(update)) onNotice(t('mods.updated', { file: update.filename }));
      refreshInstalled();
    } finally {
      setUpdatingFile(null);
    }
  };

  const handleUpdateAll = async () => {
    setUpdatingFile('all');
    try {
      let done = 0;
      for (const update of updates || []) {
        if (await applyOneUpdate(update)) done++;
      }
      refreshInstalled();
      onNotice(t('mods.updatedAll', { count: done }));
    } finally {
      setUpdatingFile(null);
    }
  };

  const numberFmt = new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <h2 style={{ fontSize: '40px', fontWeight: '800', marginBottom: '8px' }}>{t('mods.title')}</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>{t('mods.subtitle')}</p>
      {instance && (
        <p style={{ fontSize: '13px', color: accent, fontWeight: '600', marginBottom: '20px' }}>
          {t('mods.activeProfile', { name: instance.name, version: mcVersion || '—', loader: instance.loader })}
        </p>
      )}

      {/* Hızlı aksiyonlar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={handlePerfPreset}
          disabled={!canMod || !['fabric', 'quilt'].includes(instance?.loader) || busyAction !== null}
          title={t('mods.perf.desc')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px',
            background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: '12px', fontWeight: '700', fontSize: '13px',
            opacity: (!canMod || !['fabric', 'quilt'].includes(instance?.loader)) ? 0.4 : 1,
          }}
        >
          {busyAction === 'perf' ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
          {t('mods.perf')}
        </button>
        <button
          onClick={handleMrpack}
          disabled={busyAction !== null}
          title={t('mods.mrpack.desc')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px',
            background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: '12px', fontWeight: '700', fontSize: '13px',
          }}
        >
          {busyAction === 'mrpack' ? <Loader2 size={16} className="spin" /> : <Package size={16} />}
          {t('mods.mrpack')}
        </button>
        {progressMsg && (
          <span style={{ alignSelf: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
            {progressMsg.key ? t(progressMsg.key, progressMsg.params) : (progressMsg.message || '')}
          </span>
        )}
      </div>

      {!canMod ? (
        <div className="glass-panel" style={{ padding: '28px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
          {t('mods.needLoader')}
        </div>
      ) : !mcVersion ? (
        <div className="glass-panel" style={{ padding: '28px', color: 'rgba(255,255,255,0.6)' }}>
          {t('mods.needVersion')}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '20px', flex: 1, overflow: 'hidden' }}>
          {/* Arama + sonuçlar */}
          <div style={{ flex: 1.4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '0 16px', marginBottom: '14px' }}>
              <Search size={16} color="rgba(255,255,255,0.4)" />
              <input
                type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={t('mods.search.placeholder')}
                style={{ flex: 1, background: 'none', border: 'none', padding: '14px 0', fontSize: '14px' }}
              />
              {searching && <Loader2 size={16} className="spin" color="rgba(255,255,255,0.4)" />}
            </div>

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px' }}>
              {results.map((mod) => (
                <motion.div
                  key={mod.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '14px' }}
                >
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {mod.iconUrl ? <img src={mod.iconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={20} color="rgba(255,255,255,0.3)" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ fontSize: '15px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mod.title}</h4>
                    <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mod.description}</p>
                    <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>
                      {t('mods.downloads', { count: numberFmt.format(mod.downloads) })}
                    </p>
                  </div>
                  <button
                    onClick={() => handleInstall(mod)}
                    disabled={installing !== null}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
                      background: accent, color: contrastText(accent), borderRadius: '10px',
                      fontWeight: '700', fontSize: '13px', flexShrink: 0,
                    }}
                  >
                    {installing === mod.id ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                    {installing === mod.id ? t('mods.installing') : t('mods.install')}
                  </button>
                </motion.div>
              ))}
              {!searching && results.length === 0 && (
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>{t('vp.none')}</p>
              )}
            </div>
          </div>

          {/* Kurulu modlar */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '900', color: 'rgba(255,255,255,0.4)', letterSpacing: '1px' }}>
                {t('mods.installed', { count: installedMods.length })}
              </h3>
              {installedMods.length > 0 && (
                <button
                  onClick={handleCheckUpdates}
                  disabled={checkingUpdates || updatingFile !== null}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '7px 12px', borderRadius: '10px', fontWeight: '700', fontSize: '11px' }}
                >
                  {checkingUpdates ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
                  {checkingUpdates ? t('mods.checkingUpdates') : t('mods.checkUpdates')}
                </button>
              )}
            </div>

            {updates && updates.length > 0 && (
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '14px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: '#10b981' }}>
                    {t('mods.updatesFound', { count: updates.length })}
                  </span>
                  {updates.length > 1 && (
                    <button
                      onClick={handleUpdateAll}
                      disabled={updatingFile !== null}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#10b981', color: '#04140d', padding: '6px 12px', borderRadius: '8px', fontWeight: '800', fontSize: '11px' }}
                    >
                      {updatingFile === 'all' ? <Loader2 size={12} className="spin" /> : <ArrowUpCircle size={12} />}
                      {t('mods.updateAll')}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {updates.map((u) => (
                    <div key={u.oldFile} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ flex: 1, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${u.oldFile} → ${u.filename}`}>
                        {u.oldFile}
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}> {u.currentVersion} → </span>
                        <span style={{ color: '#10b981', fontWeight: '700' }}>{u.latestVersion}</span>
                      </span>
                      <button
                        onClick={() => handleUpdateOne(u)}
                        disabled={updatingFile !== null}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '5px 10px', borderRadius: '8px', fontWeight: '700', fontSize: '11px', flexShrink: 0 }}
                      >
                        {updatingFile === u.oldFile ? <Loader2 size={12} className="spin" /> : <ArrowUpCircle size={12} />}
                        {t('mods.update')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {installedMods.length === 0 && (
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>{t('mods.empty')}</p>
              )}
              {installedMods.map((mod) => (
                <div key={mod.file} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '10px 14px' }}>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mod.file}</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{formatSize(mod.sizeBytes)}</span>
                  <button
                    onClick={() => handleRemove(mod.file)}
                    title={t('mods.remove')}
                    style={{ background: 'none', color: 'rgba(255,255,255,0.3)', padding: '6px', flexShrink: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ModsPanel;
