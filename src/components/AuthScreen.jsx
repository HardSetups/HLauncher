// Giriş kapısı (alpha.7): HardSetups hesabı zorunlu. Oturum yoksa uygulama kabuğu yerine bu tam
// pencere ekran görünür (kabuk hiç çizilmez, arkada odaklanabilir öğe kalmaz). Giriş ve kayıt aynı
// cihaz kodu akışını kullanır: onay tarayıcıda yapılır, parola launcher'a girmez, renderer yalnızca
// userCode'u görür. Durumlar authView() ile belirlenir: login | outdated | maintenance | unavailable.
// Açılışta portal durumu gelene kadar AuthSplash görünür.
import { useEffect, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  Package, Wallet, WifiOff, ShieldCheck, ShieldAlert, ExternalLink, Copy, Check, Loader2, RefreshCw,
  ArrowUpCircle, Wrench, CloudOff, AlertTriangle, LogIn, UserPlus, CheckCircle2,
} from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { portalErrorText } from '../utils/portal.js';
import { useDeviceLogin } from './auth/useDeviceLogin.js';
import { isRevokedReason, isStateError } from './auth/authView.js';
import WindowControls from './auth/WindowControls.jsx';
import '../styles/auth.css';

const EASE = [0.2, 0.8, 0.2, 1];
// Bakım ya da "henüz açılmadı" durumunda config arada bir yeniden denetlenir (bitince kendiliğinden açılır)
const RECHECK_MS = 60 * 1000;

/** Arka plan katmanları: grafit geçiş + sol üstte kiremit ışığı (CSS), koyu örtülü görsel, ince doku. */
function Backdrop({ image = true }) {
  return (
    <div className="auth-bg" aria-hidden="true">
      {image && <img className="auth-bg-img" src="bg_kingdoms.jpg" alt="" draggable="false" />}
      <div className="auth-bg-grain" />
    </div>
  );
}

function Brand() {
  return (
    <div className="auth-brand">
      <img className="auth-logo" src="logo.png" alt="" draggable="false" />
      <span className="auth-brand-name">HardSetups</span>
    </div>
  );
}

/** Kartın üstündeki bildirim (bakım, iptal edilen cihaz, sunucu kapalı). */
function Notice({ tone = 'warn', icon, title, children, action, className = '' }) {
  return (
    <div className={`auth-notice is-${tone} ${className}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="auth-notice-icon">{icon}</span>
      <div className="auth-notice-body">
        {title && <b>{title}</b>}
        <span>{children}</span>
        {action}
      </div>
    </div>
  );
}

/** Açılış ekranı: portal durumu gelene kadar (genelde bir an). Giriş ekranı bu sürede hiç çizilmez. */
export function AuthSplash() {
  const { t } = useI18n();
  return (
    <div className="auth auth-splash" aria-busy="true" aria-label={t('auth.loading')}>
      <Backdrop image={false} />
      <header className="auth-top">
        <div className="auth-top-drag" />
        <WindowControls />
      </header>
      <div className="auth-splash-body">
        <img className="auth-splash-logo" src="logo.png" alt="" draggable="false" />
        <Loader2 size={18} className="spin auth-splash-spin" />
      </div>
    </div>
  );
}

/**
 * @param {object} p
 * @param {object} p.portal          portal özeti (token içermez)
 * @param {string} p.view            authView(portal): 'login' | 'outdated' | 'maintenance' | 'unavailable'
 * @param {string|null} p.sessionEnd oturumun kapanma nedeni (DEVICE_REVOKED…), kendi çıkışında null
 * @param {object} p.updaterStatus   updater-status akışı (outdated durumunda indirme ilerlemesi)
 * @param {() => void} p.onOpenUpdate indirilen güncellemeyi kurma penceresi
 * @param {string} p.appVersion
 * @param {(lang: string) => void} p.onLanguage
 * @param {{name: string, launching?: boolean}|null} p.running oturum oyun açıkken düştüyse oyun sürer; üstte gösterilir
 * @param {() => void} p.onStop
 */
export default function AuthScreen({ portal, view, sessionEnd, updaterStatus, onOpenUpdate, appVersion, onLanguage, running, onStop }) {
  const { t, lang } = useI18n();
  const api = window.electronAPI;
  const login = useDeviceLogin();
  const [register, setRegister] = useState(false);   // son başlatılan akış "Kayıt ol" mu
  const [rechecking, setRechecking] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Bakım / henüz açılmadı: arada bir kendiliğinden yeniden denetle
  useEffect(() => {
    if (view !== 'maintenance' && view !== 'unavailable') return undefined;
    const id = setInterval(() => { api.portalRefresh().catch(() => {}); }, RECHECK_MS);
    return () => clearInterval(id);
  }, [api, view]);

  const begin = (asRegister) => {
    setRegister(asRegister);
    login.start({ register: asRegister });
  };

  const recheck = async () => {
    setRechecking(true);
    try { await api.portalRefresh(); } catch { /* durum olayı yine gelir */ } finally { setRechecking(false); }
  };

  const checkUpdate = async () => {
    setCheckingUpdate(true);
    try { await api.checkAppUpdate(); } catch { /* durum updater-status ile gelir */ } finally { setCheckingUpdate(false); }
  };

  const perks = [
    { key: 'mods', icon: <Package size={17} />, title: t('auth.perk.mods.title'), text: t('auth.perk.mods.text') },
    { key: 'store', icon: <Wallet size={17} />, title: t('auth.perk.store.title'), text: t('auth.perk.store.text') },
    { key: 'offline', icon: <WifiOff size={17} />, title: t('auth.perk.offline.title'), text: t('auth.perk.offline.text') },
    { key: 'secure', icon: <ShieldCheck size={17} />, title: t('auth.perk.secure.title'), text: t('auth.perk.secure.text') },
  ];

  // Kod paneli: akış başladıysa (başlatma hatası hariç: o giriş kartında satır içi gösterilir).
  // Onaydan sonra kapı kalkana kadar panel "bağlandı" der. Bakım gibi bir durum araya girerse
  // panel gizlenir; akış sürer, durum düzelince geri gelir.
  const s = login.status;
  const codeVisible = view === 'login' && s !== 'idle' && !(s === 'error' && !login.flow);
  const cardKey = view === 'outdated' ? 'outdated' : codeVisible ? 'code' : 'login';

  const retryLink = (
    <button type="button" className="auth-link auth-recheck" onClick={recheck} disabled={rechecking}>
      {rechecking ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {t('hs.retry.load')}
    </button>
  );

  const loginCard = () => {
    const blocked = view !== 'login';
    const starting = s === 'starting';
    const inlineError = s === 'error' && !login.flow && login.error && !isStateError(login.error);
    // Sunucunun bakım mesajı (varsa) ayrı satırda, ardından ne yapılacağı
    const maintenanceText = portal?.maintenance?.message
      ? <>{portal.maintenance.message}<br />{t('auth.maintenance.text')}</>
      : t('auth.maintenance.text');
    return (
      <>
        {isRevokedReason(sessionEnd) && (
          <Notice tone="warn" icon={<ShieldAlert size={16} />} className="auth-notice-revoked">{t('auth.revoked')}</Notice>
        )}
        {view === 'maintenance' && (
          <Notice tone="warn" icon={<Wrench size={16} />} title={t('hs.maintenance.title')} action={retryLink} className="auth-notice-maintenance">
            {maintenanceText}
          </Notice>
        )}
        {view === 'unavailable' && (
          <Notice tone="info" icon={<CloudOff size={16} />} title={t('auth.unavailable.title')} action={retryLink} className="auth-notice-unavailable">
            {t('auth.unavailable')}
          </Notice>
        )}
        <h2 className="auth-card-title" id="auth-card-title">{t('auth.card.title')}</h2>
        <p className="auth-card-text">{t('auth.card.text')}</p>
        <div className="auth-actions">
          <button type="button" className="btn-primary auth-btn auth-login" disabled={blocked || starting} onClick={() => begin(false)}>
            <LogIn size={16} /> {t('auth.login')}
          </button>
          <div className="auth-or"><span>{t('auth.noAccount')}</span></div>
          <button type="button" className="btn-secondary auth-btn auth-register" disabled={blocked || starting} onClick={() => begin(true)}>
            <UserPlus size={16} /> {t('auth.register')}
          </button>
        </div>
        {inlineError && (
          <p className="auth-error" role="alert"><AlertTriangle size={14} /> <span>{portalErrorText(t, login.error)}</span></p>
        )}
        {/* Giriş kapalıyken (bakım, sunucu kapalı) ipucu gereksiz; kısa pencerede yer açar */}
        {!blocked && <p className="auth-hint"><ShieldCheck size={14} /> <span>{t('auth.browserHint')}</span></p>}
      </>
    );
  };

  const codeCard = () => {
    const flow = login.flow;
    const minutes = flow?.expiresIn ? Math.max(1, Math.round(flow.expiresIn / 60)) : null;
    return (
      <>
        <h2 className="auth-card-title" id="auth-card-title">{register ? t('auth.code.registerTitle') : t('hs.connecting.title')}</h2>
        <p className="auth-card-text">{register ? t('auth.code.registerText') : t('auth.code.text')}</p>
        <div className={`auth-code${login.ended ? ' is-ended' : ''}`} aria-live="polite">
          <span className="auth-code-label">{t('hs.code')}</span>
          {flow
            ? <strong className="auth-code-value">{flow.userCode}</strong>
            : <span className="auth-code-wait"><Loader2 size={22} className="spin" /></span>}
          {minutes && !login.ended && <span className="auth-code-valid">{t('auth.code.valid', { min: minutes })}</span>}
        </div>
        <div className={`auth-status is-${s}`} role="status">
          {s === 'starting' && <><Loader2 size={14} className="spin" /> {t('auth.code.starting')}</>}
          {s === 'waiting' && <><Loader2 size={14} className="spin" /> {t('hs.waiting')}</>}
          {s === 'success' && <><CheckCircle2 size={14} /> {t('hs.connected')}</>}
          {s === 'denied' && <><AlertTriangle size={14} /> {t('hs.denied')}</>}
          {s === 'expired' && <><AlertTriangle size={14} /> {t('hs.expired')}</>}
          {s === 'error' && <><AlertTriangle size={14} /> <span>{portalErrorText(t, login.error)}</span></>}
        </div>
        <div className="auth-actions">
          {login.ended
            ? (
              <button type="button" className="btn-primary auth-btn auth-retry" onClick={() => begin(register)}>
                <RefreshCw size={16} /> {t('hs.retry')}
              </button>
            ) : (
              <button type="button" className="btn-primary auth-btn auth-open" onClick={login.openBrowser} disabled={!flow}>
                <ExternalLink size={16} /> {t('hs.openBrowser')}
              </button>
            )}
          <div className="auth-row">
            <button type="button" className="btn-secondary auth-btn-sm auth-copy" onClick={login.copy} disabled={!flow || login.ended}>
              {login.copied ? <><Check size={14} /> {t('hs.copied')}</> : <><Copy size={14} /> {t('hs.copyUrl')}</>}
            </button>
            <button type="button" className="btn-ghost auth-btn-sm auth-cancel" onClick={login.cancel}>{t('common.cancel')}</button>
          </div>
        </div>
        {flow && !login.ended && (
          <p className="auth-url">
            <span>{t('hs.noBrowser')}</span>
            <span className="auth-url-value">{flow.verificationUri}</span>
          </p>
        )}
      </>
    );
  };

  const outdatedCard = () => {
    const u = updaterStatus || {};
    const pct = Math.max(0, Math.min(100, Math.round(u.percent || 0)));
    const canCheck = !['downloading', 'ready', 'dev'].includes(u.state);
    return (
      <>
        <span className="auth-card-icon is-warn"><ArrowUpCircle size={20} /></span>
        <h2 className="auth-card-title" id="auth-card-title">{t('auth.outdated.title')}</h2>
        <p className="auth-card-text">{t('auth.outdated.text', { min: portal?.outdated?.minVersion || '?', current: appVersion || '?' })}</p>
        {u.state === 'downloading' && (
          <div className="auth-progress">
            <div className="auth-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="auth-progress-text">{t('auth.outdated.downloading', { pct })}</span>
          </div>
        )}
        {u.state === 'ready' && <p className="auth-ok"><CheckCircle2 size={14} /> {t('auth.outdated.ready')}</p>}
        {u.state === 'checking' && <p className="auth-status"><Loader2 size={14} className="spin" /> {t('auth.outdated.checking')}</p>}
        <div className="auth-actions">
          {u.state === 'ready' && (
            <button type="button" className="btn-primary auth-btn" onClick={onOpenUpdate}><RefreshCw size={16} /> {t('auth.outdated.restart')}</button>
          )}
          {canCheck && (
            <button type="button" className="btn-primary auth-btn" onClick={checkUpdate} disabled={checkingUpdate || u.state === 'checking'}>
              {checkingUpdate ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />} {t('auth.outdated.check')}
            </button>
          )}
          <button type="button" className={`${canCheck || u.state === 'ready' ? 'btn-secondary' : 'btn-primary'} auth-btn auth-download`}
            onClick={() => api.portalOpenLink('launcher').catch(() => {})}>
            <ExternalLink size={16} /> {t('hs.outdated.download')}
          </button>
        </div>
      </>
    );
  };

  const card = cardKey === 'outdated' ? outdatedCard() : cardKey === 'code' ? codeCard() : loginCard();

  return (
    <MotionConfig reducedMotion="user">
      <div className="auth" data-view={view}>
        <Backdrop />

        <header className="auth-top">
          {running && (
            <div className="auth-run" role="status">
              {running.launching ? <Loader2 size={13} className="spin" /> : <span className="auth-run-dot" />}
              <span className="auth-run-text">{t(running.launching ? 'top.launching' : 'top.running', { name: running.name })}</span>
              {!running.launching && <button type="button" className="auth-run-stop" onClick={onStop}>{t('play.stopShort')}</button>}
            </div>
          )}
          <div className="auth-top-drag" />
          <div className="auth-lang" role="group" aria-label={t('set.language')}>
            {[{ id: 'tr', label: 'Türkçe' }, { id: 'en', label: 'English' }].map((l) => (
              <button key={l.id} type="button" className={lang === l.id ? 'is-active' : ''} aria-pressed={lang === l.id} onClick={() => onLanguage(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
          <WindowControls />
        </header>

        <main className="auth-body">
          <motion.section className="auth-intro" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: EASE }}>
            <Brand />
            <h1 className="auth-title">{t('auth.title')}</h1>
            <p className="auth-lead">{t('auth.lead')}</p>
            <ul className="auth-perks">
              {perks.map(({ key, icon, title, text }) => (
                <li key={key} className="auth-perk">
                  <span className="auth-perk-icon">{icon}</span>
                  <span className="auth-perk-text"><b>{title}</b><span>{text}</span></span>
                </li>
              ))}
            </ul>
          </motion.section>

          <motion.section
            className="auth-card"
            aria-labelledby="auth-card-title"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, delay: 0.06, ease: EASE }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={cardKey}
                className={`auth-card-inner is-${cardKey}`}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: EASE }}
              >
                {card}
              </motion.div>
            </AnimatePresence>
          </motion.section>
        </main>

        <footer className="auth-foot">
          <span>HLauncher {appVersion} · {t('auth.legal')}</span>
          {portal?.configLoaded && (
            <span className="auth-foot-links">
              <button type="button" className="auth-link" onClick={() => api.portalOpenLink('support').catch(() => {})}>{t('auth.support')}</button>
              <button type="button" className="auth-link" onClick={() => api.portalOpenLink('site').catch(() => {})}>{t('auth.site')}</button>
            </span>
          )}
        </footer>
      </div>
    </MotionConfig>
  );
}
