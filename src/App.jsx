import { useState, useEffect, useCallback } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Modal from './components/Modal';
import ServerListPanel from './components/ServerListPanel';
import VersionPicker from './components/VersionPicker';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Layers, Users, Zap, Check } from 'lucide-react';
import axios from 'axios';
import { contrastText } from './utils/color';

// ─── Constants ───────────────────────────────────────────────────────────────

const LOADER_LABELS = { release: 'Release', optifine: 'OptiFine', fabric: 'Fabric' };
const MAX_SERVERS = 20;

const ACCENTS = [
  { color: '#ff6a3d', name: 'Ateş' },
  { color: '#00f2ff', name: 'Buz' },
  { color: '#ef4444', name: 'Kızıl' },
  { color: '#10b981', name: 'Zümrüt' },
  { color: '#8b5cf6', name: 'Mor' },
  { color: '#f59e0b', name: 'Amber' },
];

const BACKGROUNDS = [
  { file: 'bg.png', name: 'Klasik' },
  { file: 'bg_kingdoms.jpg', name: 'Krallık' },
  { file: 'bg_skyblock.jpg', name: 'Skyblock' },
  { file: 'bg_towny.jpg', name: 'Kasaba' },
];

const INSTALL_LABELS = {
  optifine: 'OptiFine kuruluyor',
  fabric: 'Fabric kuruluyor',
  download: 'Java indiriliyor',
  extract: 'Dosyalar çıkarılıyor',
  start: 'Hazırlanıyor',
};

// ─── App ─────────────────────────────────────────────────────────────────────

function App() {
  const [activeTab, setActiveTab]       = useState('dashboard');
  const [user, setUser]                 = useState(() => {
    const saved = localStorage.getItem('thc_username');
    return saved ? { name: saved } : null;
  });
  const [launching, setLaunching]       = useState(false);
  const [gameRunning, setGameRunning]   = useState(false);
  const [progress, setProgress]         = useState(0);
  const [javaPath, setJavaPath]         = useState('');
  const [isHoveringPlay, setIsHoveringPlay] = useState(false);
  const [ramMax, setRamMax]             = useState(4);
  const [fullscreen, setFullscreen]     = useState(false);

  // Theme
  const [accent, setAccent]   = useState(() => localStorage.getItem('thc_accent') || '#ff6a3d');
  const [bgImage, setBgImage] = useState(() => localStorage.getItem('thc_bg') || 'bg.png');

  // Servers
  const [servers, setServers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('thc_servers') || '[]'); } catch { return []; }
  });
  const [serverStatuses, setServerStatuses] = useState({});
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [connectServerIp, setConnectServerIp] = useState(() => localStorage.getItem('thc_connect_address') || '');

  // Version / loader
  const [loaderType, setLoaderType] = useState(() => localStorage.getItem('thc_loader_type') || 'release');
  const [selectedVersion, setSelectedVersion] = useState(() => localStorage.getItem('thc_selected_version') || '');
  const [versionManifest, setVersionManifest] = useState([]);
  const [versionManifestLoading, setVersionManifestLoading] = useState(true);
  const [versionManifestError, setVersionManifestError] = useState(null);

  // UI state
  const [errorMessage, setErrorMessage] = useState(null);
  const [installStatus, setInstallStatus] = useState(null);
  const [progressLabel, setProgressLabel] = useState('');

  // ── IPC Listeners (registered once) ────────────────────────────────────────
  useEffect(() => {
    window.electronAPI.onLaunchProgress((data) => {
      const pct = Math.floor(((data.task || 0) / (data.total || 100)) * 100);
      setProgress(pct);
      const labels = {
        'assets': 'Oyun görselleri indiriliyor',
        'classes': 'Oyun dosyaları indiriliyor',
        'libraries': 'Kütüphaneler indiriliyor',
        'natives': 'Native dosyalar indiriliyor',
      };
      setProgressLabel(labels[data.type] || 'Dosyalar hazırlanıyor');
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

    return () => window.electronAPI.removeGameListeners();
  }, []);

  // ── Version manifest (fetched once, shared by Release/OptiFine/Fabric tabs) ─
  useEffect(() => {
    let cancelled = false;
    window.electronAPI.getVersionManifest()
      .then((res) => {
        if (cancelled) return;
        setVersionManifestLoading(false);
        if (res.error || !res.versions?.length) {
          setVersionManifestError(res.error || 'Sürüm listesi alınamadı');
          return;
        }
        setVersionManifest(res.versions);
        setSelectedVersion((prev) => (prev && res.versions.some((v) => v.id === prev)) ? prev : res.versions[0].id);
      })
      .catch((err) => {
        if (cancelled) return;
        setVersionManifestLoading(false);
        setVersionManifestError(err.message);
      });
    return () => { cancelled = true; };
  }, []);

  // ── Persistence ───────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('thc_servers', JSON.stringify(servers)); }, [servers]);
  useEffect(() => { localStorage.setItem('thc_connect_address', connectServerIp); }, [connectServerIp]);
  useEffect(() => { localStorage.setItem('thc_loader_type', loaderType); }, [loaderType]);
  useEffect(() => { if (selectedVersion) localStorage.setItem('thc_selected_version', selectedVersion); }, [selectedVersion]);
  useEffect(() => { localStorage.setItem('thc_accent', accent); }, [accent]);
  useEffect(() => { localStorage.setItem('thc_bg', bgImage); }, [bgImage]);

  // ── Live server status polling (mcstatus.io, staggered, 30s/server) ────────
  useEffect(() => {
    let cancelled = false;

    const fetchStatus = async (server) => {
      try {
        const res = await axios.get(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(server.address)}`, { timeout: 8000 });
        if (cancelled) return;
        const data = res.data;
        setServerStatuses((prev) => ({
          ...prev,
          [server.id]: {
            state: data.online ? 'online' : 'offline',
            players: data.players ? { online: data.players.online, max: data.players.max } : null,
            motd: data.motd?.clean || null,
            icon: data.icon || null,
            fetchedAt: Date.now(),
          },
        }));
      } catch {
        if (cancelled) return;
        setServerStatuses((prev) => ({ ...prev, [server.id]: { state: 'offline', players: null, motd: null, icon: null, fetchedAt: Date.now() } }));
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

  // ── Server list handlers ────────────────────────────────────────────────
  const handleAddServer = useCallback((name, address) => {
    setServers((prev) => {
      if (prev.length >= MAX_SERVERS) {
        setErrorMessage(`En fazla ${MAX_SERVERS} sunucu ekleyebilirsiniz.`);
        return prev;
      }
      if (prev.some((s) => s.address.toLowerCase() === address.toLowerCase())) {
        setErrorMessage('Bu sunucu adresi zaten listenizde ekli.');
        return prev;
      }
      return [...prev, { id: crypto.randomUUID(), name, address, addedAt: Date.now() }];
    });
  }, []);

  const handleRemoveServer = useCallback((id) => {
    setServers((prev) => prev.filter((s) => s.id !== id));
    setSelectedServerId((prev) => (prev === id ? null : prev));
  }, []);

  const handleSelectServer = useCallback((server) => {
    setSelectedServerId(server.id);
    setConnectServerIp(server.address);
  }, []);

  // ── Launch Logic ─────────────────────────────────────────────────────────
  const doLaunch = useCallback(() => {
    if (!selectedVersion) { setErrorMessage('Lütfen bir sürüm seçin.'); return; }
    setLaunching(true);
    setProgress(0);
    setProgressLabel('');
    window.electronAPI.launchGame({
      username:     user.name,
      ramMax:       `${ramMax}G`,
      baseVersion:  selectedVersion,
      loaderType,
      version:      selectedVersion,
      serverIp:     connectServerIp.trim(),
      javaPath:     javaPath.trim(),
      fullscreen,
    });
  }, [user, ramMax, javaPath, fullscreen, connectServerIp, selectedVersion, loaderType]);

  const handleLaunch = useCallback(() => {
    if (!user) { setActiveTab('profile'); return; }
    doLaunch();
  }, [user, doLaunch]);

  const selectedServer = servers.find((s) => s.id === selectedServerId);
  const totalOnline = Object.values(serverStatuses).reduce((sum, s) => sum + (s.state === 'online' ? (s.players?.online || 0) : 0), 0);
  const onAccent = contrastText(accent);

  // Kurulum (Java/OptiFine/Fabric) ilerlemesi başlatma kutusuna entegre
  const installing = installStatus && installStatus.type !== 'done';
  const activeProgress = installing ? (installStatus.percent || 0) : progress;
  const activeLabel = installing
    ? (installStatus.message || INSTALL_LABELS[installStatus.type] || 'Hazırlanıyor')
    : (progressLabel ? `${progressLabel} %${progress}` : `Başlatılıyor %${progress}`);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', position: 'relative', background: '#0a0a0c', color: '#fff', overflow: 'hidden' }}>

      {/* Background — tema seçimine göre, yavaş zoom animasyonlu */}
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
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} accent={accent} copyText={connectServerIp.trim()} />

        <main style={{ flex: 1, marginTop: '32px', display: 'flex', padding: '24px', gap: '24px' }}>

          {/* ── Left Content ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <AnimatePresence mode="wait">

              {/* Dashboard */}
              {activeTab === 'dashboard' && (
                <motion.div key="dashboard" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ marginBottom: 'auto' }}>
                    <motion.img
                      src="logo.png" alt="Logo"
                      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
                      style={{ width: '110px', marginBottom: '20px', filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.2))' }}
                    />
                    <motion.h1
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                      style={{ fontSize: '56px', fontWeight: '900', letterSpacing: '-2px', lineHeight: 1 }}
                    >HARDSETUPS</motion.h1>
                    <motion.p
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
                      style={{ fontSize: '19px', color: 'rgba(255,255,255,0.6)', maxWidth: '560px', marginTop: '12px' }}
                    >
                      {selectedServer
                        ? `${selectedServer.name || selectedServer.address} sunucusuna bağlanmaya hazır.`
                        : 'Bir sunucu seç ya da adres gir, sürümünü seç ve oynamaya başla!'}
                    </motion.p>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
                      style={{ display: 'flex', gap: '16px', marginTop: '28px' }}
                    >
                      <div className="stat-card"><Users size={18} color={accent} /><span>{totalOnline} Aktif</span></div>
                      <div className="stat-card"><Layers size={18} color={accent} /><span>{selectedVersion || '—'}</span></div>
                      <div className="stat-card"><Zap size={18} color={accent} /><span>{LOADER_LABELS[loaderType]}</span></div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
                      style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '28px', maxWidth: '640px' }}
                    >
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', marginBottom: '8px', display: 'block' }}>
                          BAĞLANILACAK SUNUCU
                        </label>
                        <input
                          type="text" value={connectServerIp} onChange={(e) => setConnectServerIp(e.target.value)}
                          placeholder="Sunucu adresi (örn. mc.example.com) — boş bırakılırsa oyun ana menüde açılır" className="prof-input" style={{ marginTop: 0 }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', marginBottom: '8px', display: 'block' }}>
                          SÜRÜM
                        </label>
                        <VersionPicker
                          accent={accent}
                          loaderType={loaderType} setLoaderType={setLoaderType}
                          versionManifest={versionManifest}
                          versionManifestLoading={versionManifestLoading}
                          versionManifestError={versionManifestError}
                          selectedVersion={selectedVersion} setSelectedVersion={setSelectedVersion}
                        />
                      </div>
                    </motion.div>
                  </div>

                  {/* Play Button + entegre kurulum/başlatma ilerlemesi */}
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
                        ? (isHoveringPlay ? 'OYUNU KAPAT' : 'OYUN AÇIK')
                        : (launching ? 'BAŞLATILIYOR' : 'ŞİMDİ OYNA')}
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
                            {installing && <span style={{ marginRight: '6px' }}>{installStatus.type === 'optifine' ? '✨' : installStatus.type === 'fabric' ? '🧵' : '☕'}</span>}
                            {activeLabel.toUpperCase()}{installing ? ` %${activeProgress}` : ''}
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

              {/* Servers Tab (full management view) */}
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
                  />
                </motion.div>
              )}

              {/* Profile */}
              {activeTab === 'profile' && (
                <motion.div key="profile" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <h2 style={{ fontSize: '40px', fontWeight: '800', marginBottom: '32px' }}>PROFİL</h2>
                  <div className="glass-panel" style={{ padding: '40px', width: '400px' }}>
                    <div style={{ marginBottom: '24px' }}>
                      <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600' }}>Kullanıcı Adı</label>
                      <input id="user-input" type="text" placeholder="Niyazi..." defaultValue={user?.name || ''} className="prof-input" />
                    </div>
                    <button
                      style={{ width: '100%', background: accent, color: onAccent, height: '56px', fontSize: '18px', fontWeight: '700', borderRadius: '14px' }}
                      onClick={() => {
                        const name = document.getElementById('user-input').value.trim();
                        if (name) {
                          localStorage.setItem('thc_username', name);
                          setUser({ name });
                          setActiveTab('dashboard');
                        }
                      }}
                    >Giriş Yap</button>
                  </div>
                  {user && (
                    <div style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <img src={`https://minotar.net/avatar/${user.name}/64`} alt="" style={{ borderRadius: '12px', border: `2px solid ${accent}` }} />
                      <div>
                        <p style={{ fontWeight: 'bold', fontSize: '20px' }}>{user.name}</p>
                        <button onClick={() => { localStorage.removeItem('thc_username'); setUser(null); }} style={{ background: 'none', color: '#ef4444', padding: 0 }}>Oturumu Kapat</button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Settings */}
              {activeTab === 'settings' && (
                <motion.div key="settings" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  style={{ width: '100%', maxWidth: '700px', overflowY: 'auto', paddingRight: '8px' }}>
                  <h2 style={{ fontSize: '40px', fontWeight: '800', marginBottom: '32px' }}>AYARLAR</h2>

                  {/* Görünüm / Tema */}
                  <div className="glass-panel" style={{ padding: '32px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '24px', color: accent }}>🎨 Görünüm</h3>

                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '14px' }}>Tema Rengi</label>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '28px' }}>
                      {ACCENTS.map((a) => (
                        <motion.button
                          key={a.color}
                          whileHover={{ scale: 1.12 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setAccent(a.color)}
                          title={a.name}
                          style={{
                            width: '42px', height: '42px', borderRadius: '50%', cursor: 'pointer',
                            background: a.color, border: accent === a.color ? '3px solid #fff' : '3px solid transparent',
                            boxShadow: accent === a.color ? `0 0 20px ${a.color}88` : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {accent === a.color && <Check size={18} color={contrastText(a.color)} strokeWidth={3} />}
                        </motion.button>
                      ))}
                    </div>

                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '14px' }}>Arka Plan</label>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {BACKGROUNDS.map((bg) => (
                        <motion.div
                          key={bg.file}
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setBgImage(bg.file)}
                          style={{
                            cursor: 'pointer', borderRadius: '14px', overflow: 'hidden',
                            border: bgImage === bg.file ? `2px solid ${accent}` : '2px solid rgba(255,255,255,0.1)',
                            boxShadow: bgImage === bg.file ? `0 6px 24px ${accent}44` : 'none',
                            position: 'relative',
                          }}
                        >
                          <img src={bg.file} alt={bg.name} style={{ width: '132px', height: '76px', objectFit: 'cover', display: 'block' }} />
                          <div style={{
                            position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end',
                            background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent 60%)', padding: '6px 10px',
                          }}>
                            <span style={{ fontSize: '11px', fontWeight: '700' }}>{bg.name}</span>
                          </div>
                          {bgImage === bg.file && (
                            <div style={{ position: 'absolute', top: '6px', right: '6px', background: accent, borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Check size={12} color={onAccent} strokeWidth={3} />
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Performans */}
                  <div className="glass-panel" style={{ padding: '32px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '24px', color: accent }}>⚡ Performans</h3>

                    <div style={{ marginBottom: '28px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <label style={{ fontWeight: '600' }}>RAM Ayırma</label>
                        <span style={{ background: accent, color: onAccent, padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '14px' }}>{ramMax} GB</span>
                      </div>
                      <input type="range" min="1" max="16" value={ramMax}
                        onChange={(e) => setRamMax(parseInt(e.target.value))}
                        className="custom-slider"
                        style={{ width: '100%', height: '8px', borderRadius: '4px', background: `linear-gradient(to right, ${accent} ${(ramMax / 16) * 100}%, rgba(255,255,255,0.1) ${(ramMax / 16) * 100}%)`, cursor: 'pointer', WebkitAppearance: 'none' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
                        <span>1 GB</span><span>Önerilen: 4-8 GB</span><span>16 GB</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <ToggleCard
                        label="Tam Ekran" desc="Oyunu tam ekranda başlat"
                        active={fullscreen} color="#10b981"
                        onClick={() => setFullscreen(v => !v)}
                      />
                    </div>
                  </div>

                  {/* Java */}
                  <div className="glass-panel" style={{ padding: '32px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '24px', color: '#3b82f6' }}>☕ Java Ayarları</h3>
                    <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600' }}>Java Yolu (Opsiyonel)</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="text" value={javaPath} onChange={(e) => setJavaPath(e.target.value)}
                        placeholder="Otomatik — boş bırakın"
                        className="prof-input"
                        style={{ flex: 1, marginTop: '8px' }}
                      />
                      <button
                        onClick={async () => {
                          const selected = await window.electronAPI.selectJavaPath();
                          if (selected) setJavaPath(selected);
                        }}
                        style={{ marginTop: '8px', padding: '14px 18px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: '600', fontSize: '13px' }}
                      >
                        Gözat...
                      </button>
                    </div>
                    {javaPath && (
                      <button onClick={() => setJavaPath('')} style={{ marginTop: '8px', background: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '12px', padding: '4px 0', border: 'none', cursor: 'pointer' }}>
                        Temizle (otomatik kullan)
                      </button>
                    )}
                    <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)' }}>
                      <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                        💡 <strong>İpucu:</strong> Boş bırakırsanız launcher otomatik bulur ve bulamazsa indirir.<br />
                        • 1.21+ → Java 21 gerektirir<br />
                        • 1.17 - 1.20 → Java 17 gerektirir
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* ── Right: Server Selector ── */}
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
              onSeeAll={() => setActiveTab('servers')}
            />

            <div
              className="glass-panel"
              onClick={() => setActiveTab('profile')}
              title="Profili aç"
              style={{ marginTop: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', cursor: 'pointer' }}
            >
              <img
                src={user ? `https://minotar.net/armor/bust/${user.name}/120.png` : 'https://minotar.net/armor/bust/Steve/120.png'}
                alt="Skin"
                style={{ width: '120px', filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))' }}
              />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontWeight: 'bold' }}>{user?.name || 'Misafir'}</p>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
                  <div style={{ width: '6px', height: '6px', background: user ? '#4bff4b' : 'rgba(255,255,255,0.3)', borderRadius: '50%' }} />
                  <span style={{ fontSize: '10px', color: user ? '#4bff4b' : 'rgba(255,255,255,0.4)', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                    {user ? 'HAZIR' : 'GİRİŞ YAPILMADI'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Error Dialog ── */}
      <Modal
        open={!!errorMessage}
        icon="⚠️"
        title="Hata"
        accentColor="#ef4444"
        footer={
          <button
            onClick={() => setErrorMessage(null)}
            style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px 32px', fontWeight: '700', cursor: 'pointer', fontSize: '15px' }}
          >Tamam</button>
        }
      >
        <p style={{ color: 'rgba(255,255,255,0.85)', marginBottom: '16px', lineHeight: 1.6 }}>{errorMessage}</p>
      </Modal>

      <style>{`
        .stat-card { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); padding: 10px 20px; border-radius: 30px; font-size: 14px; font-weight: 600; border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(10px); }
        .prof-input { padding: 15px 16px; font-size: 15px; margin-top: 8px; }
        input:focus { border-color: ${accent}88 !important; }
        button:hover:not(:disabled) { transform: scale(1.02); }
        button:active:not(:disabled) { transform: scale(0.98); }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        .bg-zoom { animation: bgZoom 40s ease-in-out infinite alternate; }
        @keyframes bgZoom { from { transform: scale(1); } to { transform: scale(1.08); } }
      `}</style>
    </div>
  );
}

// ─── Toggle Card Component ────────────────────────────────────────────────────

function ToggleCard({ label, desc, active, color, onClick }) {
  return (
    <div onClick={onClick} style={{ flex: '1', minWidth: '200px', background: active ? `${color}22` : 'rgba(255,255,255,0.05)', border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`, borderRadius: '16px', padding: '20px', cursor: 'pointer', transition: 'all 0.3s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontWeight: '600', marginBottom: '4px' }}>{label}</p>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{desc}</p>
        </div>
        <div style={{ width: '48px', height: '26px', background: active ? color : 'rgba(255,255,255,0.2)', borderRadius: '13px', position: 'relative', transition: 'all 0.3s' }}>
          <div style={{ width: '20px', height: '20px', background: 'white', borderRadius: '50%', position: 'absolute', top: '3px', left: active ? '25px' : '3px', transition: 'all 0.3s' }} />
        </div>
      </div>
    </div>
  );
}

export default App;
