// Bir profilin tek türdeki içeriği (mod / kaynak paketi / shader): listele,
// aç/kapat, sil, güncelle. Modrinth'te bilinen dosyalar ad + ikon + sürümle görünür.
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Trash2, RefreshCw, ArrowUpCircle, FolderOpen, MoreHorizontal, Zap, Loader2, Package } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { Switch, Menu, EmptyState } from './ui.jsx';
import Modal from './Modal.jsx';
import { formatSize, MODDED_LOADERS } from '../utils/format.js';
import { useTasks } from '../tasks.jsx';

const FILTERS = ['all', 'enabled', 'disabled', 'updates'];

export default function ContentList({ instance, type, onError, onNotice, onAdd, onCountChange, onOpenSettings }) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [busyFile, setBusyFile] = useState(null);
  const [updates, setUpdates] = useState(null); // null = denetlenmedi; { [file]: update }
  const [checking, setChecking] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(null);
  const { tasks, runTask } = useTasks();
  const presetBusy = tasks.some((x) => x.kind === 'preset' && x.instanceId === instance.id && x.status === 'running');

  const api = window.electronAPI;
  // Her değişiklikte artar; yavaş gelen meta yanıtı daha yeni bir değişikliği ezmesin
  const mutation = useRef(0);
  const surface = useCallback((err) => onError(String(err?.message || err)), [onError]);
  const modsUnsupported = type === 'mod' && !MODDED_LOADERS.includes(instance.loader);

  // İki aşama: yerel dosyalar anında (ağsız), ardından Modrinth ad/ikon/sürümü.
  // Büyük modpack'lerde liste iskelet ekranda beklemez.
  const refresh = useCallback(async () => {
    const stamp = mutation.current;
    try {
      const local = await api.listContent(instance.id, type, { meta: false });
      if (local.ok) {
        setItems((prev) => {
          // Önceki meta bilgisini koru (yenilemede ikonlar yanıp sönmesin)
          const known = Object.fromEntries(prev.map((i) => [i.name, i]));
          return local.items.map((i) => ({ ...known[i.name], ...i }));
        });
        setLoading(false);
        onCountChange?.(type, local.items.length);
      }
      const res = await api.listContent(instance.id, type);
      if (!res.ok) { onError(res.error); return; }
      if (stamp !== mutation.current) {
        // Arada aç/kapat/sil oldu: yerel durumu koru, yalnızca meta alanlarını ekle
        const meta = Object.fromEntries(res.items.map((i) => [i.name, i]));
        setItems((prev) => prev.map((i) => {
          const m = meta[i.name];
          return m ? { ...i, title: m.title, iconUrl: m.iconUrl, version: m.version, projectId: m.projectId } : i;
        }));
        return;
      }
      setItems(res.items);
      onCountChange?.(type, res.items.length);
    } catch (err) {
      surface(err);
    } finally {
      setLoading(false);
    }
  }, [api, instance.id, type, onError, onCountChange, surface]);

  // Üst bileşen profil/tür başına key verir → durum her seferinde sıfırdan başlar.
  // (refresh'in bağımlılıkları kararlı olmalı; yoksa sürekli yeniden yükler.)
  useEffect(() => { refresh(); }, [refresh]);

  const toggle = async (item, enabled) => {
    mutation.current++;
    setBusyFile(item.file);
    // İyimser güncelleme: anahtar hemen döner, hata olursa geri alınır
    setItems((prev) => prev.map((i) => (i.file === item.file ? { ...i, enabled } : i)));
    try {
      const res = await api.toggleContent(instance.id, type, item.file, enabled);
      if (!res.ok) throw new Error(res.error);
      setItems((prev) => prev.map((i) => (i.file === item.file ? { ...i, file: res.file, enabled } : i)));
      if (updates?.[item.file]) {
        setUpdates((prev) => {
          const next = { ...prev, [res.file]: { ...prev[item.file], oldFile: res.file } };
          delete next[item.file];
          return next;
        });
      }
    } catch (err) {
      setItems((prev) => prev.map((i) => (i.file === item.file ? { ...i, enabled: !enabled } : i)));
      surface(err);
    } finally {
      setBusyFile(null);
    }
  };

  const confirmRemove = async () => {
    const item = pendingRemove;
    setPendingRemove(null);
    if (!item) return;
    mutation.current++;
    try {
      const res = await api.removeContent(instance.id, type, item.file);
      if (!res.ok) throw new Error(res.error);
      setItems((prev) => {
        const next = prev.filter((i) => i.file !== item.file);
        onCountChange?.(type, next.length);
        return next;
      });
    } catch (err) {
      surface(err);
    }
  };

  const checkUpdates = async () => {
    setChecking(true);
    try {
      const res = await api.checkContentUpdates(instance.id, type);
      if (!res.ok) { onError(res.error); return; }
      setUpdates(Object.fromEntries(res.updates.map((u) => [u.oldFile, u])));
      if (res.updates.length) setFilter('updates');
      else onNotice(t('content.upToDate', { count: res.checked }));
    } catch (err) {
      surface(err);
    } finally {
      setChecking(false);
    }
  };

  const applyUpdate = async (update) => {
    const res = await api.applyContentUpdate(instance.id, type, update);
    if (!res.ok) { onError(res.error); return false; }
    setUpdates((prev) => {
      const next = { ...prev };
      delete next[update.oldFile];
      return next;
    });
    return true;
  };

  const updateOne = async (item) => {
    setBusyFile(item.file);
    try {
      await applyUpdate(updates[item.file]);
      await refresh();
    } catch (err) {
      surface(err);
    } finally {
      setBusyFile(null);
    }
  };

  const updateAll = async () => {
    setUpdatingAll(true);
    try {
      let done = 0;
      for (const u of Object.values(updates || {})) {
        if (await applyUpdate(u)) done++;
      }
      await refresh();
      onNotice(t('content.updatedAll', { count: done }));
    } catch (err) {
      surface(err);
    } finally {
      setUpdatingAll(false);
    }
  };

  // Uzun sürer → görev olarak (indirme panelinde görünür, sayfadan çıkınca da sürer)
  const installPreset = async () => {
    const res = await runTask(
      { kind: 'preset', title: t('mods.perf'), subtitle: instance.name, instanceId: instance.id },
      (taskId) => api.installPerformancePreset(instance.id, taskId),
    );
    if (res?.ok) refresh();
  };

  if (modsUnsupported) {
    return (
      <EmptyState
        icon={<Package size={28} />}
        title={t('content.needLoader.title')}
        text={t('content.needLoader.text')}
        action={<button className="btn-secondary" onClick={onOpenSettings}>{t('content.needLoader.action')}</button>}
      />
    );
  }

  const updateCount = updates ? Object.keys(updates).length : 0;
  const q = query.trim().toLocaleLowerCase('tr-TR');
  const visible = items.filter((i) => {
    if (filter === 'enabled' && !i.enabled) return false;
    if (filter === 'disabled' && i.enabled) return false;
    if (filter === 'updates' && !updates?.[i.file]) return false;
    if (!q) return true;
    return (i.title || '').toLocaleLowerCase('tr-TR').includes(q) || i.name.toLocaleLowerCase('tr-TR').includes(q);
  });
  const disabledCount = items.filter((i) => !i.enabled).length;

  return (
    <div className="content">
      <div className="toolbar">
        <label className="search-field">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(`content.search.${type}`)} />
        </label>
        <div className="seg" role="tablist" aria-label={t('content.filter')}>
          {FILTERS.filter((f) => f !== 'updates' || updateCount).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={`seg-btn${filter === f ? ' is-active' : ''}`} onClick={() => setFilter(f)}>
              {t(`content.filter.${f}`)}
              {f === 'disabled' && disabledCount > 0 && <span className="seg-count">{disabledCount}</span>}
              {f === 'updates' && <span className="seg-count is-accent">{updateCount}</span>}
            </button>
          ))}
        </div>
        <div className="toolbar-end">
          {updateCount > 1 && (
            <button className="btn-secondary" onClick={updateAll} disabled={updatingAll}>
              {updatingAll ? <Loader2 size={15} className="spin" /> : <ArrowUpCircle size={15} />} {t('content.updateAll')}
            </button>
          )}
          <button className="btn-secondary" onClick={checkUpdates} disabled={checking || !items.length} title={t('content.checkUpdates')}>
            {checking ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
            <span className="hide-narrow">{t('content.checkUpdates')}</span>
          </button>
          <Menu
            trigger={({ toggle: open, open: isOpen }) => (
              <button className="icon-btn icon-btn-framed" aria-label={t('common.more')} aria-expanded={isOpen} onClick={open}>
                <MoreHorizontal size={17} />
              </button>
            )}
            items={[
              { label: t('content.openFolder'), icon: <FolderOpen size={15} />, onSelect: () => api.openContentDir(instance.id, type) },
              ...(type === 'mod' && ['fabric', 'quilt'].includes(instance.loader)
                ? [{ label: t('mods.perf'), icon: presetBusy ? <Loader2 size={15} className="spin" /> : <Zap size={15} />, onSelect: installPreset, disabled: presetBusy }]
                : []),
            ]}
          />
          <button className="btn-primary" onClick={onAdd}><Plus size={16} /> {t(`content.add.${type}`)}</button>
        </div>
      </div>

      {loading ? (
        <div className="list-skeleton">{[0, 1, 2].map((i) => <div key={i} className="skeleton-row" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Package size={28} />}
          title={t(`content.empty.${type}`)}
          text={t('content.empty.text')}
          action={<button className="btn-primary" onClick={onAdd}><Plus size={16} /> {t(`content.add.${type}`)}</button>}
        />
      ) : (
        <div className="table" role="table">
          <div className="table-head" role="row">
            <span role="columnheader">{t('content.col.name')}</span>
            <span role="columnheader">{t('content.col.version')}</span>
            <span role="columnheader" className="col-right">{t('content.col.actions')}</span>
          </div>
          {visible.length === 0 && <p className="table-empty">{t('content.noMatch')}</p>}
          <AnimatePresence initial={false}>
          {visible.map((item) => {
            const update = updates?.[item.file];
            const busy = busyFile === item.file;
            return (
              // Anahtar kalıcı ad: aç/kapat dosyayı yeniden adlandırır, satır yeniden oluşmasın
              <motion.div
                key={item.name}
                className={`table-row${item.enabled ? '' : ' is-disabled'}`}
                role="row"
                exit={{ opacity: 0, height: 0, minHeight: 0 }}
                transition={{ duration: 0.18 }}
              >
                <div className="cell-name" role="cell">
                  <span className="item-icon">
                    {item.iconUrl ? <img src={item.iconUrl} alt="" loading="lazy" /> : <Package size={16} />}
                  </span>
                  <span className="item-text">
                    <span className="item-title ellipsis">{item.title || item.name.replace(/\.(jar|zip)$/i, '')}</span>
                    <span className="item-file ellipsis" title={item.file}>{item.name}{item.sizeBytes ? ` · ${formatSize(item.sizeBytes)}` : ''}</span>
                  </span>
                </div>
                <div className="cell-version ellipsis" role="cell">
                  {item.version || <span className="muted">{t('content.unknownVersion')}</span>}
                  {update && <span className="update-hint">→ {update.latestVersion}</span>}
                </div>
                <div className="cell-actions" role="cell">
                  {update && (
                    <button className="icon-btn is-accent" onClick={() => updateOne(item)} disabled={busy || updatingAll} title={t('content.updateTo', { version: update.latestVersion })} aria-label={t('content.updateTo', { version: update.latestVersion })}>
                      {busy ? <Loader2 size={16} className="spin" /> : <ArrowUpCircle size={16} />}
                    </button>
                  )}
                  <Switch
                    checked={item.enabled}
                    disabled={busy}
                    onChange={(v) => toggle(item, v)}
                    label={item.enabled ? t('content.disable') : t('content.enable')}
                  />
                  <button className="icon-btn icon-btn-danger" onClick={() => setPendingRemove(item)} disabled={busy} title={t('content.remove')} aria-label={t('content.remove')}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      )}

      <Modal
        open={!!pendingRemove}
        onClose={() => setPendingRemove(null)}
        title={t('content.removeTitle')}
        accentColor="#ef4444"
        footer={
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setPendingRemove(null)}>{t('common.cancel')}</button>
            <button className="btn-danger" onClick={confirmRemove} autoFocus>{t('common.delete')}</button>
          </div>
        }
      >
        <p className="modal-text">{pendingRemove ? t('content.removeConfirm', { name: pendingRemove.title || pendingRemove.name }) : ''}</p>
      </Modal>
    </div>
  );
}
