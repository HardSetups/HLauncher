// HardSetups kütüphanesi: lisanslı ürünler (hesap) + anahtarla kurulanlar.
// Kur / Oyna / Güncelle / Onar / Kaldır. Kurulumlar görev olarak yürür (indirme paneli),
// sayfadan çıkınca kaybolmaz. Ürün kendi yönetilen örneğinde, ayrı klasörde yaşar.
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Download, RefreshCw, KeyRound, MoreHorizontal, Wrench, FolderOpen, Trash2, Settings2, Loader2, CloudOff, AlertTriangle, ExternalLink } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { useTasks } from '../tasks.jsx';
import { InstanceIcon, Menu, EmptyState } from './ui.jsx';
import { IconPlay, IconStop, IconLibrary } from './icons.jsx';
import Modal from './Modal.jsx';
import HardSetupsCard from './HardSetupsCard.jsx';
import { portalErrorText, imgSrc } from '../utils/portal.js';

// Kurulum hatası → kullanıcıya gösterilecek metin + (varsa) yapılacak eylem (sözleşme §7.10, §11)
function describeInstallError(t, error) {
  const code = error?.code;
  const d = error?.details || {};
  const withSupport = (text) => (error?.requestId ? `${text}\n${t('hs.supportCode', { code: error.requestId })}` : text);
  switch (code) {
    case 'LICENSE_REQUIRED': return { text: withSupport(t('hs.err.licenseRequired')), action: d.storeUrl ? { url: d.storeUrl, label: t('hs.buy') } : { kind: 'store', label: t('hs.buy') } };
    case 'CONFLICT':
      return { text: withSupport(d.reason === 'buildNotReady' ? t('hs.err.buildNotReady') : d.reason === 'archiveLayout' ? t('hs.err.archiveLayout') : (error.message || t('hs.error.generic'))) };
    case 'LICENSE_SUSPENDED': return { text: withSupport(t('hs.err.suspended')), action: { kind: 'support', label: t('hs.support') } };
    case 'LICENSE_REVOKED': return { text: withSupport(t('hs.err.revoked')), action: { kind: 'support', label: t('hs.support') } };
    case 'LICENSE_ACTIVATION_LIMIT':
      return { text: withSupport(t('hs.err.activationLimit', { used: d.used ?? '?', limit: d.limit ?? '?' })), action: { kind: 'devices', label: t('hs.manageDevices') } };
    case 'NOT_FOUND': {
      const byReason = { noPublishedVersion: 'hs.err.noVersion', notLauncherProduct: 'hs.err.notLauncherProduct', expiredNoVersions: 'hs.err.expiredNoVersions' }[d.reason];
      return { text: withSupport(byReason ? t(byReason) : (error.message || t('hs.error.generic'))) };
    }
    case 'LICENSE_NOT_FOUND': return { text: withSupport(t('hs.err.keyNotFound')) };
    case 'VALIDATION_FAILED': return { text: withSupport(d.reason === 'PRODUCT_MISMATCH' ? t('hs.err.productMismatch') : (error.message || t('hs.error.generic'))) };
    case 'UNSUPPORTED_PRODUCT': return { text: t('hs.err.unsupported') };
    case 'EGAMERUNNING': return { text: t('hs.err.gameRunning') };
    default: return { text: portalErrorText(t, error) };
  }
}

function statusLine(t, item) {
  if (item.status && !['ACTIVE', 'KEY'].includes(item.status)) return { tone: 'warn', text: t(`hs.status.${item.status}`, {}) || item.status };
  if (!item.installable && item.reason) return { tone: 'muted', text: t(`hs.reason.${item.reason}`) };
  if (item.updateAvailable) return { tone: 'accent', text: t('hs.updateAvailable', { v: item.latestVersion?.version || '' }) };
  if (item.instanceId) return { tone: 'ok', text: t('hs.installedV', { v: item.installedVersion || '' }) };
  return { tone: 'muted', text: item.latestVersion?.version ? t('hs.notInstalledV', { v: item.latestVersion.version }) : t('hs.notInstalled') };
}

export default function LibraryPage({ portal, instances, launch, onPlay, onStop, onOpenInstance, onInstancesRefresh, onError, onNotice }) {
  const { t } = useI18n();
  const { tasks, runTask } = useTasks();
  const api = window.electronAPI;
  const [lib, setLib] = useState({ items: [], offline: false, loaded: false });
  const [loading, setLoading] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [uninstall, setUninstall] = useState(null); // { item, backup }
  const [problem, setProblem] = useState(null);     // { text, action }

  const load = useCallback(async (refresh = true) => {
    setLoading(true);
    try {
      const res = await api.portalLibrary({ refresh });
      if (res.ok) setLib({ items: res.items, offline: res.offline, loaded: true, error: res.error || null });
      else onError(portalErrorText(t, res.error));
    } catch (err) {
      onError(String(err?.message || err));
    } finally { setLoading(false); }
  }, [api, onError, t]);

  const signedIn = !!portal?.signedIn;
  useEffect(() => { if (portal && !portal.outdated) load(true); }, [load, signedIn, portal?.outdated]); // eslint-disable-line react-hooks/exhaustive-deps

  const busySlugs = new Set(tasks.filter((x) => x.status === 'running' && x.kind === 'hs').map((x) => x.slug));

  // Görev: hata nesnesi panelde metin olarak görünür; ayrıntılı açıklama + eylem kutusu açılır
  const runPortalTask = async (meta, call) => {
    let lastError = null;
    const res = await runTask({ kind: 'hs', ...meta }, async (taskId) => {
      const r = await call(taskId);
      if (!r?.ok) { lastError = r?.error; return { ok: false, error: describeInstallError(t, r?.error).text.split('\n')[0] }; }
      return r;
    });
    if (res?.ok) {
      await Promise.all([load(false), onInstancesRefresh()]);
      if (res.movedAside?.length) onNotice(t('hs.movedAside', { n: res.movedAside.length }));
    } else if (lastError) {
      setProblem(describeInstallError(t, lastError));
    }
    return res;
  };

  const install = (item, action) => runPortalTask(
    { slug: item.product.slug, title: item.product.name, subtitle: t(`hs.action.${action}`), iconUrl: imgSrc(item.product.iconUrl, portal?.imageHosts) },
    (taskId) => api.portalInstall(item.product.slug, action, taskId),
  );

  const installWithKey = async () => {
    const key = licenseKey.trim();
    if (!key) return;
    setKeyOpen(false);
    const res = await runPortalTask({ slug: `key-${Date.now()}`, title: t('hs.key.task'), subtitle: t('hs.action.INSTALL') }, (taskId) => api.portalInstallKey(key, taskId));
    if (res?.ok) setLicenseKey('');
  };

  const confirmUninstall = async () => {
    const { item, backup } = uninstall;
    setUninstall(null);
    const res = await api.portalUninstall(item.product.slug, { backupWorlds: backup });
    if (!res.ok) { setProblem(describeInstallError(t, res.error)); return; }
    await Promise.all([load(false), onInstancesRefresh()]);
    onNotice(res.backupPath ? t('hs.uninstalled.backup') : t('hs.uninstalled'));
  };

  const runProblemAction = () => {
    const action = problem?.action;
    setProblem(null);
    if (action?.url) api.portalOpenUrl(action.url);
    else if (action?.kind) api.portalOpenLink(action.kind);
  };

  if (!portal) return <div className="page-scroll hs-lib"><Loader2 className="spin" /></div>;

  const items = lib.items;
  return (
    <div className="page-scroll hs-lib">
      <header className="page-head">
        <div>
          <h1>{t('hs.lib.title')}</h1>
          <p className="page-sub">{t('hs.lib.sub')}</p>
        </div>
        <div className="page-head-actions">
          <button className="btn-secondary" onClick={() => setKeyOpen(true)} disabled={!!portal.outdated}><KeyRound size={15} /> {t('hs.key.btn')}</button>
          {signedIn && (
            <button className="icon-btn icon-btn-framed" onClick={() => load(true)} disabled={loading} aria-label={t('common.refresh')} title={t('common.refresh')}>
              <RefreshCw size={16} className={loading ? 'spin' : undefined} />
            </button>
          )}
        </div>
      </header>

      {(!signedIn || portal.outdated) && <div className="hs-lib-connect"><HardSetupsCard portal={portal} onError={onError} /></div>}

      {lib.offline && (
        <div className="banner is-info"><CloudOff size={16} /><span>{t('hs.lib.offline')}</span></div>
      )}

      {lib.loaded && items.length === 0 && signedIn && !portal.outdated && (
        <EmptyState icon={<IconLibrary size={26} />} title={t('hs.lib.empty.title')} text={t('hs.lib.empty.text')}
          action={<button className="btn-secondary" onClick={() => api.portalOpenLink('store')}><ExternalLink size={15} /> {t('hs.lib.store')}</button>} />
      )}
      {!lib.loaded && signedIn && !portal.outdated && (
        <div className="hs-grid" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="hs-item is-skeleton" />)}
        </div>
      )}

      {items.length > 0 && (
        <motion.div className="hs-grid" layout>
          {items.map((item) => {
            const inst = item.instanceId ? instances.find((i) => i.id === item.instanceId) : null;
            const slug = item.product.slug;
            const busy = busySlugs.has(slug);
            const running = inst && launch.runningId === inst.id;
            const launching = inst && launch.launchingId === inst.id;
            const otherGame = !!(launch.launchingId || launch.runningId) && !running && !launching;
            const status = statusLine(t, item);
            const canInstall = item.installable && ['ACTIVE', 'KEY'].includes(item.status);
            const icon = { id: slug, iconUrl: imgSrc(item.product.iconUrl, portal.imageHosts) };
            return (
              <motion.article key={slug} layout className={`hs-item${inst ? ' is-installed' : ''}`}>
                <div className="hs-item-head">
                  <InstanceIcon instance={icon} size={52} />
                  <div className="hs-item-title">
                    <h3 className="ellipsis" title={item.product.name}>{item.product.name}</h3>
                    <span className={`hs-item-status is-${status.tone}`}>{status.text}</span>
                    {item.source === 'licenseKey' && <span className="hs-badge">{t('hs.key.badge')}</span>}
                  </div>
                </div>
                <div className="hs-item-actions">
                  {busy ? (
                    <button className="btn-secondary" disabled><Loader2 size={15} className="spin" /> {t('hs.working')}</button>
                  ) : inst ? (
                    <button
                      className={`btn-play${running ? ' is-running' : ''}`}
                      onClick={running ? onStop : () => onPlay(inst)}
                      disabled={launching || otherGame || !!portal.outdated}
                      title={portal.outdated ? t('hs.locked', { min: portal.outdated.minVersion || '' }) : otherGame ? t('play.busyOther') : undefined}
                    >
                      {launching ? <Loader2 size={16} className="spin" /> : running ? <IconStop size={15} /> : <IconPlay size={16} />}
                      <span>{running ? t('play.stop') : t('play.now')}</span>
                    </button>
                  ) : (
                    <button className="btn-primary" onClick={() => install(item, 'INSTALL')} disabled={!canInstall || !!portal.outdated || item.source === 'licenseKey'}>
                      <Download size={15} /> {t('hs.install')}
                    </button>
                  )}
                  {inst && item.updateAvailable && !busy && (
                    <button className="btn-secondary" onClick={() => install(item, 'UPDATE')} disabled={running || launching}>
                      <RefreshCw size={15} /> {t('hs.update')}
                    </button>
                  )}
                  {inst && (
                    <Menu
                      align="end"
                      trigger={({ toggle, open }) => (
                        <button className="icon-btn icon-btn-framed" onClick={toggle} aria-expanded={open} aria-label={t('common.more')}><MoreHorizontal size={16} /></button>
                      )}
                      items={[
                        ...(item.source === 'account' ? [{ label: t('hs.repair'), icon: <Wrench size={15} />, disabled: busy || running || launching, onSelect: () => install(item, 'REPAIR') }] : []),
                        { label: t('prof.openFolder'), icon: <FolderOpen size={15} />, onSelect: () => api.openInstanceDir(inst.id) },
                        { label: t('inst.settings'), icon: <Settings2 size={15} />, onSelect: () => onOpenInstance(inst.id, 'settings') },
                        { label: t('hs.uninstall'), icon: <Trash2 size={15} />, danger: true, disabled: busy || running || launching, onSelect: () => setUninstall({ item, backup: true }) },
                      ]}
                    />
                  )}
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      )}

      {/* Lisans anahtarıyla kurulum (§11) */}
      <Modal
        open={keyOpen}
        onClose={() => setKeyOpen(false)}
        icon={<KeyRound size={18} />}
        title={t('hs.key.title')}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setKeyOpen(false)}>{t('common.cancel')}</button>
            <button className="btn-primary" onClick={installWithKey} disabled={!licenseKey.trim()}><Download size={15} /> {t('hs.install')}</button>
          </>
        }
      >
        <p className="modal-text">{t('hs.key.text')}</p>
        <form onSubmit={(e) => { e.preventDefault(); installWithKey(); }}>
          <input
            className="hs-key-input"
            autoFocus
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            maxLength={64}
            spellCheck={false}
            autoComplete="off"
            aria-label={t('hs.key.title')}
          />
        </form>
      </Modal>

      {/* Kaldırma (§7.7) */}
      <Modal
        open={!!uninstall}
        onClose={() => setUninstall(null)}
        icon={<Trash2 size={18} />}
        tone="danger"
        title={t('hs.uninstall.title', { name: uninstall?.item?.product?.name || '' })}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setUninstall(null)}>{t('common.cancel')}</button>
            <button className="btn-danger" onClick={confirmUninstall}>{t('hs.uninstall')}</button>
          </>
        }
      >
        <p className="modal-text">{t('hs.uninstall.text')}</p>
        <label className="check-row">
          <input type="checkbox" checked={!!uninstall?.backup} onChange={(e) => setUninstall((u) => ({ ...u, backup: e.target.checked }))} />
          <span>{t('hs.uninstall.backup')}</span>
        </label>
      </Modal>

      {/* Kurulum hatası + eylem (Satın al / Cihazları yönet / Destek) */}
      <Modal
        open={!!problem}
        onClose={() => setProblem(null)}
        icon={<AlertTriangle size={18} />}
        tone="danger"
        title={t('hs.err.title')}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setProblem(null)}>{t('common.ok')}</button>
            {problem?.action && <button className="btn-primary" onClick={runProblemAction}><ExternalLink size={15} /> {problem.action.label}</button>}
          </>
        }
      >
        <p className="modal-text" style={{ whiteSpace: 'pre-wrap' }}>{problem?.text}</p>
      </Modal>
    </div>
  );
}
