import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Trash2, Wrench, ArrowUpCircle } from 'lucide-react';
import Rail from './components/Rail';
import TopBar from './components/TopBar';
import HomePage from './components/HomePage';
import InstancePage from './components/InstancePage';
import BrowsePage from './components/BrowsePage';
import ServersPage from './components/ServersPage';
import SettingsPage from './components/SettingsPage';
import AccountPage from './components/AccountPage';
import PortalPage from './components/PortalPage';
import ProductView from './components/ProductView';
import DownloadBar from './components/DownloadBar';
import UpdateModal from './components/UpdateModal';
import CreateInstanceModal from './components/CreateInstanceModal';
import Modal from './components/Modal';
import Onboarding from './components/Onboarding';
import { contrastText } from './utils/color';
import { I18nProvider, useI18n } from './i18n.jsx';
import { TaskProvider, useTasks } from './tasks.jsx';

const MAX_SERVERS = 20;
const PROGRESS_KEYS = { assets: 'progress.assets', classes: 'progress.classes', libraries: 'progress.libraries', natives: 'progress.natives' };

function App() {
  const { t, setLang } = useI18n();
  const { tasks, runTask } = useTasks();
  const api = window.electronAPI;

  // ── Boot verisi (main süreçteki store'dan) ────────────────────────────────
  const [settings, setSettingsState] = useState(null);
  const [servers, setServersState] = useState([]);
  const [account, setAccount] = useState(null);
  const [instances, setInstances] = useState([]);
  const [systemInfo, setSystemInfo] = useState({ totalMemGb: 16, appVersion: '', logsDir: '' });

  // ── Gezinme ───────────────────────────────────────────────────────────────
  // view: { page: 'home' | 'instance' | 'browse' | 'servers' | 'settings' | 'account', id?, tab?, instanceId?, type? }
  const [view, setView] = useState({ page: 'home' });
  const navigate = useCallback((next) => setView(next), []);
  const openInstance = useCallback((id, tab = 'mod') => setView({ page: 'instance', id, tab }), []);

  // ── Oyun durumu ───────────────────────────────────────────────────────────
  // launchingId: hazırlanan profil; runningId: açık oyunun profili (aynı anda tek oyun)
  const [launch, setLaunch] = useState({ launchingId: null, runningId: null, serverAddress: null });
  const launchRef = useRef(launch);
  useEffect(() => { launchRef.current = launch; }, [launch]);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [installStatus, setInstallStatus] = useState(null);

  const [errorMessage, setErrorMessage] = useState(null);
  const [notice, setNotice] = useState(null);
  const [serverStatuses, setServerStatuses] = useState({});
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const [news, setNews] = useState([]);
  // HardSetups hesabı özeti (token içermez): { signedIn, user, wallet, maintenance, outdated, ... }
  const [portal, setPortal] = useState(null);
  const [updaterStatus, setUpdaterStatus] = useState({ state: 'idle' });
  const [updateOpen, setUpdateOpen] = useState(false);
  const promptedVersion = useRef(null);
  const [versionManifest, setVersionManifest] = useState([]);
  const [versionManifestLoading, setVersionManifestLoading] = useState(true);
  const [versionManifestError, setVersionManifestError] = useState(null);

  // ── Ayar yazımı (debounce ile main sürece) ────────────────────────────────
  const pendingPatch = useRef({});
  const patchTimer = useRef(null);
  const updateSetting = useCallback((key, value) => {
    setSettingsState((prev) => ({ ...prev, [key]: value }));
    pendingPatch.current[key] = value;
    clearTimeout(patchTimer.current);
    patchTimer.current = setTimeout(() => {
      const patch = pendingPatch.current;
      pendingPatch.current = {};
      window.electronAPI.patchSettings(patch);
    }, 400);
  }, []);

  const saveServers = useCallback((next) => {
    setServersState(next);
    window.electronAPI.setServers(next);
  }, []);

  const refreshInstances = useCallback(() => window.electronAPI.listInstances().then(setInstances), []);
  const surfaceError = useCallback((err) => setErrorMessage(String(err?.message || err)), []);

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([api.getStoreData(), api.getSystemInfo(), api.listInstances()]).then(([store, sys, insts]) => {
      setServersState(store.servers || []);
      setAccount(store.account);
      setSystemInfo(sys);
      setInstances(insts);
      setLang(store.settings.language || 'tr');

      // Eski sürümden (localStorage) tek seferlik migrasyon
      const legacyName = localStorage.getItem('thc_username');
      if (!store.settings.onboarded && legacyName) {
        const patch = { onboarded: true };
        const accent = localStorage.getItem('thc_accent');
        if (accent) patch.accent = accent;
        api.patchSettings(patch);
        api.loginOffline(legacyName).then((res) => { if (res.ok) setAccount(res.account); });
        try {
          const legacyServers = JSON.parse(localStorage.getItem('thc_servers') || '[]')
            .slice(0, MAX_SERVERS)
            .map((s) => ({ ...s, favorite: false, manifestUrl: '' }));
          if (legacyServers.length) {
            setServersState(legacyServers);
            api.setServers(legacyServers);
          }
        } catch { /* eski liste bozuksa atla */ }
        ['thc_username', 'thc_servers', 'thc_accent', 'thc_bg', 'thc_loader_type', 'thc_selected_version', 'thc_connect_address'].forEach((k) => localStorage.removeItem(k));
        setSettingsState({ ...store.settings, ...patch });
      } else {
        setSettingsState(store.settings);
      }
    }).catch((err) => {
      setSettingsState({ language: 'tr', accent: '#ff6a3d', ram: 4, fullscreen: false, javaPath: '', jvmPreset: 'balanced', customJvmArgs: '', checkUpdates: true, onboarded: true });
      surfaceError(err);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dinleyiciler bir kez kaydedilir; güncel dili ref üzerinden okurlar
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  // ── IPC dinleyicileri (bir kez) ───────────────────────────────────────────
  useEffect(() => {
    const clearLaunch = () => {
      setLaunch({ launchingId: null, runningId: null, serverAddress: null });
      setProgress(0);
      setInstallStatus(null);
    };
    const unsubs = [
      api.onLaunchProgress((data) => {
        setProgress(Math.floor(((data.task || 0) / (data.total || 100)) * 100));
        setProgressLabel(PROGRESS_KEYS[data.type] || 'progress.preparing');
      }),
      api.onLaunchFinished(() => {
        setLaunch((prev) => ({ ...prev, launchingId: null, runningId: prev.launchingId }));
        setProgress(100);
        refreshInstances(); // son oynama zamanı güncellensin
        api.hideLauncher();
      }),
      api.onLaunchError((err) => {
        clearLaunch();
        setErrorMessage(typeof err === 'string' ? err : (err?.error || err?.message || tRef.current('err.unknown')));
      }),
      api.onGameClosed(() => {
        clearLaunch();
        api.showLauncher();
      }),
      api.onGameCrashed((data) => setErrorMessage(tRef.current('game.crashed', { code: data?.code ?? '?' }))),
      api.onJavaStatus((data) => {
        setInstallStatus(data);
        if (data.type === 'done') setTimeout(() => setInstallStatus(null), 1200);
      }),
      api.onUpdaterStatus(setUpdaterStatus),
      api.onPortalState(setPortal),
      // Panelden iptal / güvenlik nedeniyle kapanan oturum kullanıcıya söylenir
      api.onPortalSession((e) => {
        if (!e.signedIn && e.reason && e.reason !== 'logout') setNotice(tRef.current('hs.revoked'));
      }),
    ];
    api.getUpdaterStatus().then(setUpdaterStatus).catch(() => {});
    api.portalState().then((res) => { if (res.ok) setPortal(res.state); }).catch(() => {});
    return () => unsubs.forEach((off) => off?.());
  }, [api, refreshInstances]);

  // Güncelleme indirildiğinde her sürüm için bir kez sor; oyun açıksa üst bardaki düğme bekler
  useEffect(() => {
    if (updaterStatus.state !== 'ready' || promptedVersion.current === updaterStatus.version) return;
    if (launchRef.current.launchingId || launchRef.current.runningId) return;
    promptedVersion.current = updaterStatus.version;
    setUpdateOpen(true);
  }, [updaterStatus]);

  // ── Sürüm listesi + haberler ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    api.getVersionManifest()
      .then((res) => {
        if (cancelled) return;
        setVersionManifestLoading(false);
        if (res.error || !res.versions?.length) { setVersionManifestError(res.error || tRef.current('vp.error')); return; }
        setVersionManifest(res.versions);
      })
      .catch((err) => {
        if (cancelled) return;
        setVersionManifestLoading(false);
        setVersionManifestError(err.message);
      });
    api.getNews().then((n) => { if (!cancelled) setNews(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, [api]);

  // ── Canlı sunucu durumu (mcstatus.io, 30sn) ───────────────────────────────
  // Yalnızca id/adres kümesi değişince yeniden kurulur.
  const pollKey = servers.map((s) => `${s.id}|${s.address}`).join(',');
  useEffect(() => {
    let cancelled = false;
    const polled = pollKey ? pollKey.split(',').map((p) => {
      const [id, ...rest] = p.split('|');
      return { id, address: rest.join('|') };
    }) : [];

    setServerStatuses((prev) => {
      const next = {};
      for (const s of polled) next[s.id] = prev[s.id] || { state: 'loading' };
      return next;
    });

    const fetchStatus = async (server) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(server.address)}`, { signal: controller.signal });
        clearTimeout(timer);
        const data = await res.json();
        if (cancelled) return;
        setServerStatuses((prev) => ({
          ...prev,
          [server.id]: {
            state: data.online ? 'online' : 'offline',
            players: data.players ? { online: data.players.online, max: data.players.max } : null,
            motd: data.motd?.clean || null,
            icon: data.icon || null,
            version: data.version?.name_clean || null,
          },
        }));
      } catch {
        if (!cancelled) setServerStatuses((prev) => ({ ...prev, [server.id]: { state: 'offline' } }));
      }
    };

    const timers = [];
    const pollAll = () => polled.forEach((s, i) => timers.push(setTimeout(() => { if (!cancelled) fetchStatus(s); }, i * 300)));
    pollAll();
    const id = setInterval(pollAll, 30000);
    return () => { cancelled = true; clearInterval(id); timers.forEach(clearTimeout); };
  }, [pollKey]);

  // ── Sunucu işlemleri ──────────────────────────────────────────────────────
  const handleAddServer = useCallback((name, address, manifestUrl) => {
    if (servers.length >= MAX_SERVERS) { setErrorMessage(t('srv.max', { max: MAX_SERVERS })); return false; }
    if (servers.some((s) => s.address.toLowerCase() === address.toLowerCase())) { setErrorMessage(t('srv.dup')); return false; }
    saveServers([...servers, { id: crypto.randomUUID(), name, address, manifestUrl: manifestUrl || '', favorite: false, addedAt: Date.now() }]);
    return true;
  }, [servers, saveServers, t]);

  const handleRemoveServer = useCallback((id) => saveServers(servers.filter((s) => s.id !== id)), [servers, saveServers]);
  const handleToggleFavorite = useCallback((id) => saveServers(servers.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s))), [servers, saveServers]);

  // Uzun işlemler görev olarak yürür: ilerleme indirme panelinde, sayfadan çıkınca kaybolmaz
  const handleApplyManifest = useCallback(async (server) => {
    const res = await runTask(
      { kind: 'manifest', title: server.name || server.address, subtitle: t('srv.applyManifest') },
      (taskId) => api.applyServerManifest(server.manifestUrl, taskId),
    );
    if (!res?.ok) return;
    await refreshInstances();
    openInstance(res.instanceId);
  }, [api, runTask, refreshInstances, openInstance, t]);

  // ── Profil işlemleri ──────────────────────────────────────────────────────
  const handleUpdateInstance = useCallback((id, patch) => {
    api.updateInstance(id, patch).then(refreshInstances).catch(surfaceError);
  }, [api, refreshInstances, surfaceError]);

  const handleCreateInstance = useCallback(async (data) => {
    try {
      const inst = await api.createInstance(data);
      await refreshInstances();
      openInstance(inst.id);
      return true;
    } catch (err) {
      surfaceError(err);
      return false;
    }
  }, [api, refreshInstances, openInstance, surfaceError]);

  const handleImportMrpack = useCallback(async () => {
    const res = await runTask(
      { kind: 'mrpack', title: t('mods.mrpack'), subtitle: '.mrpack' },
      (taskId) => api.importMrpack(taskId),
    );
    if (!res?.ok) return false;
    await refreshInstances();
    openInstance(res.instanceId);
    return true;
  }, [api, runTask, refreshInstances, openInstance, t]);

  const confirmDeleteInstance = useCallback(() => {
    const instance = pendingDelete;
    setPendingDelete(null);
    if (!instance) return;
    api.deleteInstance(instance.id)
      .then(() => { setView({ page: 'home' }); return refreshInstances(); })
      .catch(surfaceError);
  }, [api, pendingDelete, refreshInstances, surfaceError]);

  // ── Başlatma ──────────────────────────────────────────────────────────────
  const launchInstance = useCallback((instance, serverAddress) => {
    if (!account) {
      setView({ page: 'account' });
      setErrorMessage(t('acc.required'));
      return;
    }
    const cur = launchRef.current;
    if (cur.launchingId || cur.runningId) return; // tek oyun
    const serverIp = (serverAddress ?? instance.serverAddress ?? '').trim();
    setLaunch({ launchingId: instance.id, runningId: null, serverAddress: serverIp || null });
    setProgress(0);
    setProgressLabel('');
    api.launchGame({ instanceId: instance.id, serverIp });
  }, [account, api, t]);

  const stopGame = useCallback(() => api.stopGame(), [api]);

  // ── Türetilmiş değerler ───────────────────────────────────────────────────
  if (!settings) {
    return <div className="boot">{t('common.loading')}</div>;
  }

  const accent = settings.accent;
  const onAccent = contrastText(accent);
  const latestVersionId = versionManifest[0]?.id;
  const sortedInstances = [...instances].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || a.name.localeCompare(b.name, 'tr'));
  const findInstance = (id) => instances.find((i) => i.id === id);

  const progressText = (d) => (d ? (d.key ? t(d.key, d.params) : (d.message || '')) : '');
  const installing = installStatus && installStatus.type !== 'done';
  const activePct = installing ? (installStatus.percent || 0) : progress;
  const activeLabel = installing
    ? (progressText(installStatus) || t('progress.preparing'))
    : t(progressLabel || 'progress.starting');

  const launchingInst = findInstance(launch.launchingId);
  const runningInst = findInstance(launch.runningId);
  const launchTask = launchingInst ? {
    id: 'launch',
    kind: 'launch',
    status: 'running',
    title: launchingInst.name,
    pct: activePct,
    progress: { message: activeLabel },
  } : null;

  // Launcher güncellemesi: iniyorsa indirme panelinde bir satır
  const updateTask = updaterStatus.state === 'downloading' ? {
    id: 'app-update',
    kind: 'update',
    status: 'running',
    title: t('upd.task', { version: updaterStatus.version || '' }),
    pct: updaterStatus.percent ?? null,
    progress: { message: t('upd.task.detail') },
  } : null;
  const updateReady = updaterStatus.state === 'ready';
  const gameBusy = !!(launch.launchingId || launch.runningId);

  const topStatus = runningInst
    ? { kind: 'running', name: runningInst.name }
    : launchingInst ? { kind: 'launching', name: launchingInst.name, pct: activePct } : null;

  // Görünümdeki profil silindiyse ana sayfaya düş
  const viewInstance = view.page === 'instance' ? findInstance(view.id) : null;
  const page = view.page === 'instance' && !viewInstance && instances.length ? 'home' : view.page;

  const crumbs = (() => {
    const home = { label: t('nav.home'), onClick: () => navigate({ page: 'home' }) };
    switch (page) {
      case 'instance': return [{ label: t('home.library'), onClick: home.onClick }, { label: viewInstance?.name || '' }];
      case 'browse': {
        const target = view.instanceId && findInstance(view.instanceId);
        return target
          ? [{ label: target.name, onClick: () => openInstance(target.id, view.type) }, { label: t('browse.title') }]
          : [{ label: t('browse.title') }];
      }
      case 'servers': return [{ label: t('nav.servers') }];
      case 'hardsetups': return [{ label: t('nav.library') }];
      case 'product': return [{ label: t('nav.library'), onClick: () => navigate({ page: 'hardsetups', tab: 'store' }) }, { label: view.title || view.slug || '' }];
      case 'settings': return [{ label: t('nav.settings') }];
      case 'account': return [{ label: t('nav.account') }];
      default: return [{ label: t('nav.home') }];
    }
  })();

  const pageMotion = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.14 } };
  const pageKey = page === 'instance' ? `inst-${view.id}` : page === 'browse' ? `browse-${view.instanceId || ''}-${view.type || ''}` : page === 'product' ? `product-${view.slug}` : page;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell" style={{ '--accent': accent, '--on-accent': onAccent }}>
      <Rail
        view={view}
        navigate={navigate}
        instances={sortedInstances}
        runningId={launch.runningId}
        account={account}
        onCreateInstance={() => setCreating(true)}
      />

      <div className="app-column">
        <TopBar crumbs={crumbs} status={topStatus} onStop={stopGame} updateReady={updateReady} onOpenUpdate={() => setUpdateOpen(true)} />

        {portal?.outdated && (
          <div className="banner portal-banner" role="alert">
            <ArrowUpCircle size={16} />
            <span style={{ flex: 1 }}>{t('hs.outdated.text', { min: portal.outdated.minVersion || '' })}</span>
            <button className="btn-secondary btn-xs" onClick={() => (updateReady ? setUpdateOpen(true) : api.checkAppUpdate())}>{t('hs.outdated.update')}</button>
            <button className="btn-ghost btn-xs" onClick={() => api.portalOpenLink('launcher')}>{t('hs.outdated.download')}</button>
          </div>
        )}
        {portal?.maintenance && !portal?.outdated && (
          <div className="banner portal-banner" role="status">
            <Wrench size={16} />
            <span>
              <b>{t('hs.maintenance.title')}</b>
              {portal.maintenance.message ? ` ${portal.maintenance.message}` : ''}
              <span className="muted"> — {t('hs.maintenance.playable')}</span>
            </span>
          </div>
        )}

        {/* İndirme paneli açıkken sayfaların altı boşalır: panel düğmeleri örtmesin */}
        <main className={`app-main${tasks.length || launch.launchingId || updaterStatus.state === 'downloading' ? ' has-dl' : ''}`}>
          <AnimatePresence mode="wait">
            <motion.div key={pageKey} className="page" {...pageMotion}>
              {page === 'home' && (
                <HomePage
                  instances={sortedInstances}
                  latestVersionId={latestVersionId}
                  account={account}
                  servers={servers}
                  statuses={serverStatuses}
                  news={news}
                  launch={launch}
                  onPlay={(inst) => launchInstance(inst)}
                  onOpenInstance={openInstance}
                  onCreateInstance={() => setCreating(true)}
                  navigate={navigate}
                />
              )}

              {page === 'instance' && viewInstance && (
                <InstancePage
                  instance={viewInstance}
                  tab={view.tab || 'mod'}
                  setTab={(tab) => setView((v) => ({ ...v, tab }))}
                  latestVersionId={latestVersionId}
                  versionManifest={versionManifest}
                  versionManifestLoading={versionManifestLoading}
                  versionManifestError={versionManifestError}
                  launch={launch}
                  launchPct={activePct}
                  systemInfo={systemInfo}
                  globalRam={settings.ram}
                  servers={servers}
                  statuses={serverStatuses}
                  onPlay={(inst) => launchInstance(inst)}
                  onStop={stopGame}
                  onUpdate={handleUpdateInstance}
                  onDelete={() => setPendingDelete(viewInstance)}
                  onError={setErrorMessage}
                  onNotice={setNotice}
                  onAddContent={(instanceId, type) => navigate({ page: 'browse', instanceId, type })}
                />
              )}

              {page === 'browse' && (
                <BrowsePage
                  instances={sortedInstances}
                  initialInstanceId={view.instanceId}
                  initialType={view.type}
                  latestVersionId={latestVersionId}
                  onError={setErrorMessage}
                  onInstancesRefresh={refreshInstances}
                />
              )}

              {page === 'servers' && (
                <ServersPage
                  servers={servers}
                  statuses={serverStatuses}
                  instances={sortedInstances}
                  latestVersionId={latestVersionId}
                  launch={launch}
                  onAdd={handleAddServer}
                  onRemove={handleRemoveServer}
                  onToggleFavorite={handleToggleFavorite}
                  onApplyManifest={handleApplyManifest}
                  onPlayServer={(server, inst) => launchInstance(inst, server.address)}
                />
              )}

              {page === 'hardsetups' && (
                <PortalPage
                  portal={portal}
                  tab={view.tab || 'store'}
                  setTab={(tab) => setView((v) => ({ ...v, tab }))}
                  autoInstall={view.install || null}
                  onAutoInstallDone={() => setView((v) => ({ ...v, install: null }))}
                  onOpenProduct={(slug) => navigate({ page: 'product', slug })}
                  instances={instances}
                  launch={launch}
                  onPlay={(inst) => launchInstance(inst)}
                  onStop={stopGame}
                  onOpenInstance={openInstance}
                  onInstancesRefresh={refreshInstances}
                  onError={setErrorMessage}
                  onNotice={setNotice}
                />
              )}

              {page === 'product' && (
                <ProductView
                  slug={view.slug}
                  portal={portal}
                  onLoaded={(title) => setView((v) => (v.page === 'product' && v.title !== title ? { ...v, title } : v))}
                  onBack={() => navigate({ page: 'hardsetups', tab: 'store' })}
                  onOpenLibrary={() => navigate({ page: 'hardsetups', tab: 'library' })}
                  onInstall={(slug) => navigate({ page: 'hardsetups', tab: 'library', install: slug })}
                  onConnect={() => navigate({ page: 'account' })}
                />
              )}

              {page === 'settings' && (
                <SettingsPage
                  settings={settings}
                  updateSetting={updateSetting}
                  systemInfo={systemInfo}
                  accent={accent}
                  updaterStatus={updaterStatus}
                  onNotice={setNotice}
                  onError={setErrorMessage}
                />
              )}

              {page === 'account' && (
                <AccountPage
                  account={account}
                  setAccount={setAccount}
                  portal={portal}
                  onError={setErrorMessage}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <DownloadBar extraTasks={[launchTask, updateTask].filter(Boolean)} />

      <UpdateModal open={updateOpen && updateReady} status={updaterStatus} gameBusy={gameBusy} onClose={() => setUpdateOpen(false)} />

      <CreateInstanceModal
        open={creating}
        onClose={() => setCreating(false)}
        versionManifest={versionManifest}
        versionManifestLoading={versionManifestLoading}
        versionManifestError={versionManifestError}
        onCreate={handleCreateInstance}
        onImportMrpack={handleImportMrpack}
        onBrowseModpacks={() => navigate({ page: 'browse', type: 'modpack' })}
      />

      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        icon={<Trash2 size={18} />}
        tone="danger"
        title={t('prof.deleteTitle')}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setPendingDelete(null)}>{t('common.cancel')}</button>
            <button className="btn-danger" onClick={confirmDeleteInstance} autoFocus>{t('common.delete')}</button>
          </>
        }
      >
        <p className="modal-text">{pendingDelete ? t('prof.deleteConfirm', { name: pendingDelete.name }) : ''}</p>
      </Modal>

      <Modal
        open={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        icon={<AlertTriangle size={18} />}
        tone="danger"
        title={t('err.title')}
        footer={
          <>
            <button className="btn-ghost" onClick={() => api.openLogs()}>{t('err.openLogs')}</button>
            <button className="btn-primary" onClick={() => setErrorMessage(null)} autoFocus>{t('common.ok')}</button>
          </>
        }
      >
        <p className="modal-text" style={{ whiteSpace: 'pre-wrap' }}>{errorMessage}</p>
      </Modal>

      {/* Bilgi: hata açıksa üst üste binmesin */}
      <Modal
        open={!!notice && !errorMessage}
        onClose={() => setNotice(null)}
        icon={<CheckCircle2 size={18} />}
        tone="success"
        title={t('common.notice')}
        footer={<button className="btn-primary" onClick={() => setNotice(null)} autoFocus>{t('common.ok')}</button>}
      >
        <p className="modal-text">{notice}</p>
      </Modal>

      <AnimatePresence>
        {!settings.onboarded && (
          <Onboarding
            accent={accent}
            account={account}
            setAccount={setAccount}
            systemInfo={systemInfo}
            updateSetting={updateSetting}
            onError={setErrorMessage}
            onFinish={() => setSettingsState((prev) => ({ ...prev, onboarded: true }))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AppRoot() {
  const [lang, setLang] = useState('tr');
  return (
    <I18nProvider lang={lang} setLang={setLang}>
      <TaskProvider>
        <App />
      </TaskProvider>
    </I18nProvider>
  );
}
