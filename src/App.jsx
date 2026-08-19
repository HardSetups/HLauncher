import { useState, useEffect, useCallback, useRef } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Modal from './components/Modal';
import ServerListPanel from './components/ServerListPanel';
import VersionPicker from './components/VersionPicker';
import ProfilesPanel from './components/ProfilesPanel';
import ModsPanel from './components/ModsPanel';
import SettingsPanel from './components/SettingsPanel';
import AccountPanel from './components/AccountPanel';
import Onboarding from './components/Onboarding';
import NewsPanel from './components/NewsPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Layers, Users, Zap } from 'lucide-react';
import { contrastText } from './utils/color';
import { I18nProvider, useI18n } from './i18n.jsx';

const MAX_SERVERS = 20;
const LOADER_LABELS = { release: 'Release', optifine: 'OptiFine', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

function App() {
  const { t, setLang } = useI18n();

  // ── Boot verisi (main süreçteki store'dan) ────────────────────────────────
  const [settings, setSettingsState] = useState(null);
  const [servers, setServersState] = useState([]);
  const [account, setAccount] = useState(null);
  const [instances, setInstances] = useState([]);
  const [activeInstanceId, setActiveInstanceIdState] = useState('default');
  const [systemInfo, setSystemInfo] = useState({ totalMemGb: 16, appVersion: '', logsDir: '' });

  // ── UI durumu ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('dashboard');
  const [launching, setLaunching] = useState(false);
  const [gameRunning, setGameRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [installStatus, setInstallStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [notice, setNotice] = useState(null);
  const [isHoveringPlay, setIsHoveringPlay] = useState(false);
  const [connectAddress, setConnectAddress] = useState('');
  const [serverStatuses, setServerStatuses] = useState({});
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [globalBusy, setGlobalBusy] = useState(null);

  const [news, setNews] = useState([]);
  const [versionManifest, setVersionManifest] = useState([]);
  const [versionManifestLoading, setVersionManifestLoading] = useState(true);
  const [versionManifestError, setVersionManifestError] = useState(null);

  const manifestApplyingRef = useRef(false);

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

  const refreshInstances = useCallback(() => {
    return window.electronAPI.listInstances().then(setInstances);
  }, []);

  // ── Boot: store + sistem bilgisi + profiller ──────────────────────────────
  useEffect(() => {
    Promise.all([
      window.electronAPI.getStoreData(),
      window.electronAPI.getSystemInfo(),
      window.electronAPI.listInstances(),
    ]).then(([store, sys, insts]) => {
      setServersState(store.servers || []);
      setAccount(store.account);
      setActiveInstanceIdState(store.activeInstanceId || 'default');
      setSystemInfo(sys);
      setInstances(insts);
      setConnectAddress(store.settings.connectAddress || '');
      setLang(store.settings.language || 'tr');

      // Eski sürümden (localStorage) tek seferlik migrasyon
      const legacyName = localStorage.getItem('thc_username');
      if (!store.settings.onboarded && legacyName) {
        const patch = { onboarded: true };
        const accent = localStorage.getItem('thc_accent');
        const bg = localStorage.getItem('thc_bg');
        if (accent) patch.accent = accent;
        if (bg) patch.bgImage = bg;
        window.electronAPI.patchSettings(patch);
        window.electronAPI.loginOffline(legacyName).then((res) => { if (res.ok) setAccount(res.account); });
        try {
          const legacyServers = JSON.parse(localStorage.getItem('thc_servers') || '[]')
            .slice(0, MAX_SERVERS)
            .map((s) => ({ ...s, favorite: false, manifestUrl: '' }));
          if (legacyServers.length) {
            setServersState(legacyServers);
            window.electronAPI.setServers(legacyServers);
          }
        } catch { /* eski liste bozuksa atla */ }
        ['thc_username', 'thc_servers', 'thc_accent', 'thc_bg', 'thc_loader_type', 'thc_selected_version', 'thc_connect_address'].forEach((k) => localStorage.removeItem(k));
        setSettingsState({ ...store.settings, ...patch });
      } else {
        setSettingsState(store.settings);
      }
    }).catch((err) => {
      setSettingsState({ language: 'tr', accent: '#ff6a3d', bgImage: 'bg.png', ram: 4, fullscreen: false, javaPath: '', jvmPreset: 'balanced', customJvmArgs: '', checkUpdates: true, onboarded: true });
      setErrorMessage(String(err?.message || err));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── IPC dinleyicileri (bir kez) ───────────────────────────────────────────
  useEffect(() => {
    window.electronAPI.onLaunchProgress((data) => {
      const pct = Math.floor(((data.task || 0) / (data.total || 100)) * 100);
      setProgress(pct);
      const keys = { assets: 'progress.assets', classes: 'progress.classes', libraries: 'progress.libraries', natives: 'progress.natives' };
      setProgressLabel(keys[data.type] || 'progress.preparing');
    });

    window.electronAPI.onLaunchFinished(() => {
      setProgress(100);
      setGameRunning(true);
      window.electronAPI.hideLauncher();
    });

    window.electronAPI.onLaunchError((err) => {
      setLaunching(false);
      setGameRunning(false);
      setProgress(0);
      setInstallStatus(null);
      const msg = typeof err === 'string' ? err : (err?.error || err?.message || 'Bilinmeyen bir hata oluştu');
      setErrorMessage(msg);
    });

    window.electronAPI.onGameClosed(() => {
      setLaunching(false);
      setGameRunning(false);
      setProgress(0);
      window.electronAPI.showLauncher();
    });

    window.electronAPI.onJavaStatus((data) => {
      setInstallStatus(data);
      if (data.type === 'done') {
        setTimeout(() => setInstallStatus(null), 1200);
      }
    });

    window.electronAPI.onModProgress((p) => {
      if (manifestApplyingRef.current) setGlobalBusy(p);
    });

    return () => window.electronAPI.removeGameListeners();
  }, []);

  // ── Sürüm listesi ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    window.electronAPI.getVersionManifest()
      .then((res) => {
        if (cancelled) return;
        setVersionManifestLoading(false);
        if (res.error || !res.versions?.length) {
          setVersionManifestError(res.error || t('vp.error'));
          return;
        }
        setVersionManifest(res.versions);
      })
      .catch((err) => {
        if (cancelled) return;
        setVersionManifestLoading(false);
        setVersionManifestError(err.message);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Haber beslemesi ───────────────────────────────────────────────────────
  useEffect(() => {
    window.electronAPI.getNews().then(setNews).catch(() => {});
  }, []);

  // ── connectAddress kalıcılığı ─────────────────────────────────────────────
  useEffect(() => {
    if (settings) updateSetting('connectAddress', connectAddress);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectAddress]);

  // ── Canlı sunucu durumu (mcstatus.io, 30sn) ───────────────────────────────
  useEffect(() => {
    let cancelled = false;

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
            fetchedAt: Date.now(),
          },
        }));
      } catch {
        if (cancelled) return;
        setServerStatuses((prev) => ({ ...prev, [server.id]: { state: 'offline', players: null, motd: null, icon: null, version: null, fetchedAt: Date.now() } }));
      }
    };

    const pollAll = () => {
      servers.forEach((server, i) => {
        setTimeout(() => { if (!cancelled) fetchStatus(server); }, i * 300);
      });
    };

    pollAll();
    const id = setInterval(pollAll, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [servers]);

  // ── Sunucu listesi işlemleri ──────────────────────────────────────────────
  const handleAddServer = useCallback((name, address, manifestUrl) => {
    if (servers.length >= MAX_SERVERS) {
      setErrorMessage(t('srv.max', { max: MAX_SERVERS }));
      return;
    }
    if (servers.some((s) => s.address.toLowerCase() === address.toLowerCase())) {
      setErrorMessage(t('srv.dup'));
      return;
    }
    saveServers([...servers, { id: crypto.randomUUID(), name, address, manifestUrl: manifestUrl || '', favorite: false, addedAt: Date.now() }]);
  }, [servers, saveServers, t]);

  const handleRemoveServer = useCallback((id) => {
    saveServers(servers.filter((s) => s.id !== id));
    setSelectedServerId((prev) => (prev === id ? null : prev));
  }, [servers, saveServers]);

  const handleToggleFavorite = useCallback((id) => {
    saveServers(servers.map((s) => (s.id === id ? { ...s, favorite: !s.favorite } : s)));
  }, [servers, saveServers]);

  const handleSelectServer = useCallback((server) => {
    setSelectedServerId(server.id);
    setConnectAddress(server.address);
  }, []);

  const handleApplyManifest = useCallback(async (server) => {
    manifestApplyingRef.current = true;
    setGlobalBusy({ key: 'common.loading' });
    try {
      const res = await window.electronAPI.applyServerManifest(server.manifestUrl);
      if (!res.ok) { setErrorMessage(res.error); return; }
      await refreshInstances();
      await window.electronAPI.setActiveInstance(res.instanceId);
      setActiveInstanceIdState(res.instanceId);
      setConnectAddress(res.address);
      setNotice(t('srv.manifestApplied', { name: res.name, count: res.modCount }));
    } finally {
      manifestApplyingRef.current = false;
      setGlobalBusy(null);
    }
  }, [refreshInstances, t]);

  // ── Profil işlemleri ──────────────────────────────────────────────────────
  const activeInstance = instances.find((i) => i.id === activeInstanceId) || instances[0] || null;

  const handleSetActiveInstance = useCallback((id) => {
    window.electronAPI.setActiveInstance(id).then(() => setActiveInstanceIdState(id));
  }, []);

  const handleUpdateInstance = useCallback((id, patch) => {
    window.electronAPI.updateInstance(id, patch).then(refreshInstances).catch((err) => setErrorMessage(err.message));
  }, [refreshInstances]);

  const handleDeleteInstance = useCallback((instance) => {
    if (!window.confirm(t('prof.deleteConfirm', { name: instance.name }))) return;
    window.electronAPI.deleteInstance(instance.id).then(() => {
      if (activeInstanceId === instance.id) setActiveInstanceIdState('default');
      refreshInstances();
    });
  }, [activeInstanceId, refreshInstances, t]);

  const handleCreateInstance = useCallback((data) => {
    window.electronAPI.createInstance(data)
      .then((inst) => refreshInstances().then(() => handleSetActiveInstance(inst.id)))
      .catch((err) => setErrorMessage(err.message));
  }, [refreshInstances, handleSetActiveInstance]);

  // ── Başlatma ──────────────────────────────────────────────────────────────
  const doLaunch = useCallback(() => {
    setLaunching(true);
    setProgress(0);
    setProgressLabel('');
    window.electronAPI.launchGame({
      instanceId: activeInstanceId,
      serverIp: connectAddress.trim(),
    });
  }, [activeInstanceId, connectAddress]);

  const handleLaunch = useCallback(() => {
    if (!account) {
      setActiveTab('account');
      setErrorMessage(t('acc.required'));
      return;
    }
    doLaunch();
  }, [account, doLaunch, t]);

  // ── Türetilmiş değerler ───────────────────────────────────────────────────
  if (!settings) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0c', color: 'rgba(255,255,255,0.4)' }}>
        {t('common.loading')}
      </div>
    );
  }

  const accent = settings.accent;
  const bgImage = settings.bgImage;
  const onAccent = contrastText(accent);
  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const totalOnline = Object.values(serverStatuses).reduce((sum, s) => sum + (s.state === 'online' ? (s.players?.online || 0) : 0), 0);

  const latestVersionId = versionManifest[0]?.id;
  const displayVersion = activeInstance?.mcVersion || latestVersionId || '—';
  const displayLoader = activeInstance ? LOADER_LABELS[activeInstance.loader] : '—';

  // Backend ilerleme nesnesini metne çevirir ({key, params} veya düz {message})
  const progressText = (d) => (d ? (d.key ? t(d.key, d.params) : (d.message || '')) : '');

  const installing = installStatus && installStatus.type !== 'done';
  const activeProgress = installing ? (installStatus.percent || 0) : progress;
  const activeLabel = installing
    ? (progressText(installStatus) || t('progress.preparing'))
    : (progressLabel ? `${t(progressLabel)} %${progress}` : `${t('progress.starting')} %${progress}`);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', position: 'relative', background: '#0a0a0c', color: '#fff', overflow: 'hidden' }}>

      {/* Arka plan */}
      <AnimatePresence>
        <motion.div
          key={bgImage}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.45 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="bg-zoom"
          style={{ position: 'absolute', inset: 0, background: `url(${bgImage}) center/cover no-repeat`, zIndex: 0 }}
        />
      </AnimatePresence>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,10,12,0.5) 0%, transparent 30%, rgba(10,10,12,0.85) 100%), radial-gradient(circle at center, transparent, rgba(0,0,0,0.65))', zIndex: 1, pointerEvents: 'none' }} />

      <TitleBar />

      <div style={{ display: 'flex', flex: 1, position: 'relative', zIndex: 2, height: '100%' }}>
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} accent={accent} copyText={connectAddress.trim()} />

        <main style={{ flex: 1, marginTop: '32px', display: 'flex', padding: '24px', gap: '24px', overflow: 'hidden' }}>

          {/* ── Sol içerik ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <AnimatePresence mode="wait">

              {/* Ana Sayfa */}
              {activeTab === 'dashboard' && (
                <motion.div key="dashboard" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ marginBottom: 'auto' }}>
                    <motion.img
                      src="logo.png" alt="Logo"
                      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                      style={{ width: '100px', marginBottom: '16px', filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.2))' }}
                    />
                    <motion.h1
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                      style={{ fontSize: '52px', fontWeight: '900', letterSpacing: '-2px', lineHeight: 1 }}
                    >HLAUNCHER</motion.h1>
                    <motion.p
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
                      style={{ fontSize: '18px', color: 'rgba(255,255,255,0.6)', maxWidth: '560px', marginTop: '12px' }}
                    >
                      {selectedServer
                        ? t('dash.subtitle.server', { name: selectedServer.name || selectedServer.address })
                        : t('dash.subtitle.default')}
                    </motion.p>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
                      style={{ display: 'flex', gap: '16px', marginTop: '24px', flexWrap: 'wrap' }}
                    >
                      <div className="stat-card"><Users size={18} color={accent} /><span>{t('dash.stat.active', { count: totalOnline })}</span></div>
                      <div className="stat-card"><Layers size={18} color={accent} /><span>{displayVersion}</span></div>
                      <div className="stat-card"><Zap size={18} color={accent} /><span>{displayLoader}</span></div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
                      style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px', maxWidth: '640px' }}
                    >
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', marginBottom: '8px', display: 'block' }}>
                          {t('dash.connect.label')}
                        </label>
                        <input
                          type="text" value={connectAddress} onChange={(e) => setConnectAddress(e.target.value)}
                          placeholder={t('dash.connect.placeholder')} className="prof-input" style={{ marginTop: 0 }}
                        />
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <label style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: '1px' }}>
                            {t('dash.version.label')} — {activeInstance?.name || ''}
                          </label>
                          <button onClick={() => setActiveTab('profiles')} style={{ background: 'none', color: accent, fontSize: '11px', fontWeight: '700', padding: 0 }}>
                            {t('dash.profile.manage')}
                          </button>
                        </div>
                        <VersionPicker
                          accent={accent}
                          loaderType={activeInstance?.loader || 'release'}
                          setLoaderType={(l) => activeInstance && handleUpdateInstance(activeInstance.id, { loader: l })}
                          versionManifest={versionManifest}
                          versionManifestLoading={versionManifestLoading}
                          versionManifestError={versionManifestError}
                          selectedVersion={activeInstance?.mcVersion || latestVersionId || ''}
                          setSelectedVersion={(v) => activeInstance && handleUpdateInstance(activeInstance.id, { mcVersion: v })}
                        />
                      </div>
                    </motion.div>
                  </div>

                  {/* Oyna butonu + ilerleme */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '36px' }}>
                    <button
                      onClick={gameRunning ? () => window.electronAPI.stopGame() : handleLaunch}
                      disabled={launching && !gameRunning}
                      onMouseEnter={() => setIsHoveringPlay(true)}
                      onMouseLeave={() => setIsHoveringPlay(false)}
                      style={{
                        width: '400px', height: '76px', borderRadius: '38px', border: 'none',
                        background: gameRunning
                          ? (isHoveringPlay ? '#ef4444' : 'rgba(255,255,255,0.1)')
                          : `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                        color: gameRunning ? '#fff' : onAccent,
                        fontSize: '25px', fontWeight: '800', letterSpacing: '0.5px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: gameRunning
                          ? (isHoveringPlay ? '0 10px 40px rgba(239,68,68,0.4)' : 'none')
                          : `0 12px 44px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
                      }}
                    >
                      <Play fill={gameRunning ? '#fff' : onAccent} size={30} />
                      {gameRunning
                        ? (isHoveringPlay ? t('play.stop') : t('play.running'))
                        : (launching ? t('play.launching') : t('play.now'))}
                    </button>

                    <AnimatePresence>
                      {launching && !gameRunning && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                        >
                          <div style={{ width: '400px', height: '5px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', marginTop: '16px', overflow: 'hidden' }}>
                            <motion.div
                              animate={{ width: `${activeProgress}%` }}
                              transition={{ duration: 0.35 }}
                              style={{ height: '100%', background: `linear-gradient(90deg, ${accent}, ${accent}aa)` }}
                            />
                          </div>
                          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '8px', fontWeight: 'bold' }}>
                            {installing && <span style={{ marginRight: '6px' }}>{installStatus.type === 'optifine' ? '✨' : ['fabric', 'quilt'].includes(installStatus.type) ? '🧵' : ['forge', 'neoforge'].includes(installStatus.type) ? '⚒️' : '☕'}</span>}
                            {activeLabel.toUpperCase()}{installing ? ` %${activeProgress}` : ''}
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

              {/* Sunucular */}
              {activeTab === 'servers' && (
                <motion.div key="servers" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <ServerListPanel
                    accent={accent}
                    variant="grid"
                    servers={servers}
                    statuses={serverStatuses}
                    selectedServerId={selectedServerId}
                    onSelect={(server) => { handleSelectServer(server); setActiveTab('dashboard'); }}
                    onAdd={handleAddServer}
                    onRemove={handleRemoveServer}
                    onToggleFavorite={handleToggleFavorite}
                    onApplyManifest={handleApplyManifest}
                  />
                </motion.div>
              )}

              {/* Modlar */}
              {activeTab === 'mods' && (
                <motion.div key="mods" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <ModsPanel
                    instance={activeInstance}
                    accent={accent}
                    latestVersionId={latestVersionId}
                    onError={setErrorMessage}
                    onNotice={setNotice}
                    onProfilesRefresh={refreshInstances}
                  />
                </motion.div>
              )}

              {/* Profiller */}
              {activeTab === 'profiles' && (
                <motion.div key="profiles" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <ProfilesPanel
                    instances={instances}
                    activeInstanceId={activeInstanceId}
                    accent={accent}
                    versionManifest={versionManifest}
                    onSetActive={handleSetActiveInstance}
                    onUpdate={handleUpdateInstance}
                    onDelete={handleDeleteInstance}
                    onCreate={handleCreateInstance}
                  />
                </motion.div>
              )}

              {/* Hesap */}
              {activeTab === 'account' && (
                <motion.div key="account" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <h2 style={{ fontSize: '40px', fontWeight: '800', marginBottom: '32px' }}>{t('acc.title')}</h2>
                  <AccountPanel
                    account={account}
                    setAccount={setAccount}
                    accent={accent}
                    onError={setErrorMessage}
                  />
                </motion.div>
              )}

              {/* Ayarlar */}
              {activeTab === 'settings' && (
                <motion.div key="settings" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  style={{ overflow: 'hidden', display: 'flex' }}>
                  <SettingsPanel
                    settings={settings}
                    updateSetting={updateSetting}
                    systemInfo={systemInfo}
                    accent={accent}
                  />
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* ── Sağ sütun ── */}
          <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <ServerListPanel
              accent={accent}
              variant="compact"
              servers={servers}
              statuses={serverStatuses}
              selectedServerId={selectedServerId}
              onSelect={handleSelectServer}
              onAdd={handleAddServer}
              onRemove={handleRemoveServer}
              onToggleFavorite={handleToggleFavorite}
              onApplyManifest={handleApplyManifest}
              onSeeAll={() => setActiveTab('servers')}
            />

            <NewsPanel
              accent={accent}
              news={news}
              serverAnnouncements={activeInstance?.origin === 'server' ? activeInstance.announcements : null}
              serverName={activeInstance?.origin === 'server' ? activeInstance.name : null}
            />

            <div
              className="glass-panel"
              onClick={() => setActiveTab('account')}
              title={t('nav.account')}
              style={{ marginTop: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', cursor: 'pointer' }}
            >
              <img
                src={account ? `https://minotar.net/armor/bust/${encodeURIComponent(account.name)}/120.png` : 'https://minotar.net/armor/bust/Steve/120.png'}
                alt="Skin"
                style={{ width: '120px', filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))' }}
              />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontWeight: 'bold' }}>{account?.name || t('acc.guest')}</p>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
                  <div style={{ width: '6px', height: '6px', background: account ? '#4bff4b' : 'rgba(255,255,255,0.3)', borderRadius: '50%' }} />
                  <span style={{ fontSize: '10px', color: account ? '#4bff4b' : 'rgba(255,255,255,0.4)', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                    {account ? t('acc.ready') : t('acc.none')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Meşguliyet göstergesi (manifest kurulumu vb.) */}
      <AnimatePresence>
        {globalBusy && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            style={{
              position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
              background: '#12121c', border: `1px solid ${accent}55`, borderRadius: '14px',
              padding: '12px 24px', fontSize: '13px', fontWeight: '600', zIndex: 9000,
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            }}
          >
            ⏳ {progressText(globalBusy)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hata */}
      <Modal
        open={!!errorMessage}
        icon="⚠️"
        title={t('err.title')}
        accentColor="#ef4444"
        footer={
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => window.electronAPI.openLogs()}
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '12px', padding: '14px 20px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}
            >{t('err.openLogs')}</button>
            <button
              onClick={() => setErrorMessage(null)}
              style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px 32px', fontWeight: '700', cursor: 'pointer', fontSize: '15px' }}
            >{t('common.ok')}</button>
          </div>
        }
      >
        <p style={{ color: 'rgba(255,255,255,0.85)', marginBottom: '16px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{errorMessage}</p>
      </Modal>

      {/* Bilgi */}
      <Modal
        open={!!notice}
        icon="✅"
        title={t('common.notice')}
        accentColor={accent}
        footer={
          <button
            onClick={() => setNotice(null)}
            style={{ background: accent, color: onAccent, border: 'none', borderRadius: '12px', padding: '14px 32px', fontWeight: '700', cursor: 'pointer', fontSize: '15px' }}
          >{t('common.ok')}</button>
        }
      >
        <p style={{ color: 'rgba(255,255,255,0.85)', marginBottom: '16px', lineHeight: 1.6 }}>{notice}</p>
      </Modal>

      {/* İlk açılış sihirbazı */}
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

      <style>{`
        .stat-card { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); padding: 10px 20px; border-radius: 30px; font-size: 14px; font-weight: 600; border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(10px); }
        .prof-input { padding: 15px 16px; font-size: 15px; margin-top: 8px; }
        input:focus { border-color: ${accent}88 !important; }
        select option { background: #12121c; }
        button:hover:not(:disabled) { transform: scale(1.02); }
        button:active:not(:disabled) { transform: scale(0.98); }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        .bg-zoom { animation: bgZoom 40s ease-in-out infinite alternate; }
        @keyframes bgZoom { from { transform: scale(1); } to { transform: scale(1.08); } }
        .spin { animation: hlSpin 1s linear infinite; }
        @keyframes hlSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default function AppRoot() {
  const [lang, setLang] = useState('tr');
  return (
    <I18nProvider lang={lang} setLang={setLang}>
      <App />
    </I18nProvider>
  );
}
