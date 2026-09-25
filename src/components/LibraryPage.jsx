// HardSetups kütüphanesi: lisanslı ürünler (hesap) + anahtarla kurulanlar.
// Kur / Oyna / Güncelle / Onar / Kaldır. Kurulumlar görev olarak yürür (indirme paneli),
// sayfadan çıkınca kaybolmaz. Ürün kendi yönetilen örneğinde, ayrı klasörde yaşar.
// Üstte özet (ürün / kurulu / güncelleme / eşitleme); kütüphane boşsa katalogdan
// sahip olunmayan ürünler önerilir (gerçek katalog verisi, örnek içerik yok).
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Download, RefreshCw, KeyRound, MoreHorizontal, Wrench, FolderOpen, Trash2, Settings2, Loader2, CloudOff, AlertTriangle,
  ExternalLink, FlaskConical, HardDrive, ShieldCheck, Clock, Compass, Gamepad2, History,
} from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { useTasks } from '../tasks.jsx';
import { InstanceIcon, Menu } from './ui.jsx';
import { IconPlay, IconStop, IconLibrary } from './icons.jsx';
import Modal from './Modal.jsx';
import HardSetupsCard from './HardSetupsCard.jsx';
import { CoverArt, ProductShelf } from './ProductCard.jsx';
import { portalErrorText, imgSrc } from '../utils/portal.js';
import { relativeTime, LOADER_LABELS } from '../utils/format.js';

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

/** Lisans satırı: bitiş tarihi, süresiz ya da anahtarın son hanesi (yalnızca sunucunun verdiği). */
function licenseLine(t, item, lang) {
  if (item.source === 'licenseKey') return t('hub.lib.viaKey');
  if (item.expiresAt) {
    const when = relativeTime(Date.parse(item.expiresAt), lang);
    return when ? t('hub.lib.expires', { when }) : null;
  }
  if (item.status === 'ACTIVE') return item.keyLast4 ? t('hub.lib.lifetimeKey', { last4: item.keyLast4 }) : t('hub.lib.lifetime');
  return null;
}

export default function LibraryPage({
  portal, instances, launch, onPlay, onStop, onOpenInstance, onInstancesRefresh, onError, onNotice, onOpenProduct = null,
  embedded = false, autoInstallSlug = null, onAutoInstallDone = () => {},
}) {
  const { t, lang } = useI18n();
  const { tasks, runTask } = useTasks();
  const api = window.electronAPI;
  const [lib, setLib] = useState({ items: [], offline: false, loaded: false, fetchedAt: null });
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [uninstall, setUninstall] = useState(null); // { item, backup }
  const [problem, setProblem] = useState(null);     // { text, action }

  const load = useCallback(async (refresh = true) => {
    setLoading(true);
    try {
      const res = await api.portalLibrary({ refresh });
      if (res.ok) setLib({ items: res.items, offline: res.offline, loaded: true, error: res.error || null, fetchedAt: res.fetchedAt || null });
      else onError(portalErrorText(t, res.error));
    } catch (err) {
      onError(String(err?.message || err));
    } finally { setLoading(false); }
  }, [api, onError, t]);

  const signedIn = !!portal?.signedIn;
  useEffect(() => { if (portal && !portal.outdated) load(true); }, [load, signedIn, portal?.outdated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Öneriler için katalog (§5); alınamazsa öneri bölümü hiç görünmez.
  // Bağımlılık fonksiyonun kendisi değil varlığı: App her çizimde yeni ok fonksiyonu verir
  const canSuggest = !!onOpenProduct;
  const portalReady = !!portal && !portal.outdated;
  useEffect(() => {
    if (!portalReady || !canSuggest) return undefined;
    let cancelled = false;
    api.portalProducts()
      .then((res) => { if (!cancelled && res?.ok) setCatalog(res.products); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [api, signedIn, portalReady, canSuggest]);

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

  // Satın almadan sonra "Şimdi kur": ürün kütüphanede görünür görünmez bir kez kurulur
  useEffect(() => {
    if (!autoInstallSlug || !lib.loaded) return;
    const item = lib.items.find((i) => i.product.slug === autoInstallSlug);
    onAutoInstallDone();
    if (item && !item.instanceId && item.installable) install(item, 'INSTALL');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoInstallSlug, lib.loaded]);

  const runProblemAction = () => {
    const action = problem?.action;
    setProblem(null);
    if (action?.url) api.portalOpenUrl(action.url);
    else if (action?.kind) api.portalOpenLink(action.kind);
  };

  if (!portal) return <div className={embedded ? 'hs-lib' : 'page-scroll hs-lib'}><Loader2 className="spin" /></div>;

  const items = lib.items;
  const hosts = portal.imageHosts;
  const ready = signedIn && !portal.outdated;
  const installedCount = items.filter((i) => i.instanceId).length;
  const updateCount = items.filter((i) => i.updateAvailable).length;
  const emptyLibrary = lib.loaded && items.length === 0 && ready;
  // Öneriler: katalogda olup kütüphanede olmayan ürünler
  const ownedSlugs = new Set(items.map((i) => i.product.slug));
  const suggestions = onOpenProduct ? catalog.filter((p) => !p.owned && !ownedSlugs.has(p.slug)) : [];
  const synced = lib.fetchedAt ? relativeTime(lib.fetchedAt, lang) : null;
  const keyButton = (
    <button className="btn-secondary" onClick={() => setKeyOpen(true)} disabled={!!portal.outdated}><KeyRound size={15} /> {t('hs.key.btn')}</button>
  );

  return (
    <div className={embedded ? 'hs-lib' : 'page-scroll hs-lib'}>
      <header className={embedded ? 'hs-lib-toolbar' : 'page-head'}>
        <div className="hs-lib-intro">
          {!embedded && <h1>{t('hs.lib.title')}</h1>}
          {items.length > 0 ? (
            <div className="hub-stats">
              <span className="hub-stat"><b>{items.length}</b><span>{t('hub.lib.stat.products')}</span></span>
              <span className="hub-stat"><b>{installedCount}</b><span>{t('hub.lib.stat.installed')}</span></span>
              {updateCount > 0 && <span className="hub-stat is-accent"><b>{updateCount}</b><span>{t('hub.lib.stat.updates')}</span></span>}
              {lib.offline
                ? <span className="hub-sync is-offline"><CloudOff size={13} /> {t('hub.lib.offlineShort')}</span>
                : synced && <span className="hub-sync"><Clock size={13} /> {t('hub.lib.synced', { when: synced })}</span>}
            </div>
          ) : (
            <p className="page-sub">{t('hs.lib.sub')}</p>
          )}
        </div>
        <div className="page-head-actions">
          {!emptyLibrary && keyButton}
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

      {emptyLibrary && (
        <div className="hub-empty is-library">
          <span className="hub-empty-icon"><IconLibrary size={26} /></span>
          <b className="hub-empty-title">{t('hub.lib.empty.title')}</b>
          <p className="hub-empty-text">{t('hub.lib.empty.text')}</p>
          <span className="hub-empty-actions">
            {keyButton}
            <button className="btn-ghost" onClick={() => api.portalOpenLink('store')}>{t('hs.lib.store')} <ExternalLink size={13} /></button>
          </span>
        </div>
      )}
      {!lib.loaded && ready && (
        <div className="hs-grid" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="hs-item is-skeleton" />)}
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
            const iconSrc = imgSrc(item.product.iconUrl, hosts);
            const icon = { id: slug, iconUrl: iconSrc };
            const beta = item.latestVersion?.channel === 'BETA';
            const license = licenseLine(t, item, lang);
            return (
              <motion.article key={slug} layout className={`hs-item${inst ? ' is-installed' : ''}${item.updateAvailable ? ' has-update' : ''}`}>
                <CoverArt src={imgSrc(item.product.coverUrl, hosts)} seed={slug} icon={iconSrc} iconSize={56} className="hs-item-cover">
                  {(beta || item.source === 'licenseKey') && (
                    <span className="badges">
                      {beta && <span className="badge is-beta" title={t('hub.lib.betaHint')}><FlaskConical size={11} /> {t('hub.lib.beta')}</span>}
                      {item.source === 'licenseKey' && <span className="badge is-key"><KeyRound size={11} /> {t('hs.key.badge')}</span>}
                    </span>
                  )}
                </CoverArt>
                <div className="hs-item-body">
                  <div className="hs-item-head">
                    <InstanceIcon instance={icon} size={44} />
                    <div className="hs-item-title">
                      <h3 className="ellipsis" title={item.product.name}>{item.product.name}</h3>
                      <span className={`hs-item-status is-${status.tone}`}><span className="hs-dot" aria-hidden="true" />{status.text}</span>
                    </div>
                  </div>
                  {/* Durum satırında olmayan gerçek bilgiler: oyun sürümü, son oynama, lisans */}
                  <ul className="hs-item-meta">
                    {inst?.mcVersion && <li><Gamepad2 size={13} /> Minecraft {inst.mcVersion}{LOADER_LABELS[inst.loader] && inst.loader !== 'release' ? ` · ${LOADER_LABELS[inst.loader]}` : ''}</li>}
                    {item.updateAvailable && item.installedVersion && <li><HardDrive size={13} /> {t('hub.lib.installedV', { v: item.installedVersion })}</li>}
                    {inst?.lastPlayed && <li><History size={13} /> {t('hub.lib.lastPlayed', { when: relativeTime(inst.lastPlayed, lang) })}</li>}
                    {license && <li><ShieldCheck size={13} /> {license}</li>}
                  </ul>
                  <div className="hs-item-actions">
                    {busy ? (
                      <button className="btn-secondary hs-main-btn" disabled><Loader2 size={15} className="spin" /> {t('hs.working')}</button>
                    ) : inst ? (
                      <button
                        className={`btn-play hs-main-btn${running ? ' is-running' : ''}`}
                        onClick={running ? onStop : () => onPlay(inst)}
                        disabled={launching || otherGame || !!portal.outdated}
                        title={portal.outdated ? t('hs.locked', { min: portal.outdated.minVersion || '' }) : otherGame ? t('play.busyOther') : undefined}
                      >
                        {launching ? <Loader2 size={16} className="spin" /> : running ? <IconStop size={15} /> : <IconPlay size={16} />}
                        <span>{running ? t('play.stop') : t('play.now')}</span>
                      </button>
                    ) : (
                      <button className="btn-primary hs-main-btn" onClick={() => install(item, 'INSTALL')} disabled={!canInstall || !!portal.outdated || item.source === 'licenseKey'}>
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
                          <button className="icon-btn icon-btn-framed" onClick={toggle} aria-expanded={open} aria-label={t('common.more')} title={t('common.more')}><MoreHorizontal size={16} /></button>
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
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      )}

      {suggestions.length > 0 && (lib.loaded || !ready) && (
        <section className="feed-section hub-suggest">
          <header className="feed-head">
            <h2 className="feed-title"><Compass size={16} />{items.length ? t('hub.lib.more') : t('hub.lib.suggest')}</h2>
            {!emptyLibrary && <button type="button" className="link-btn" onClick={() => api.portalOpenLink('store')}>{t('hs.lib.store')} <ExternalLink size={12} /></button>}
          </header>
          <ProductShelf products={suggestions} imageHosts={hosts} onOpen={onOpenProduct} />
        </section>
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
