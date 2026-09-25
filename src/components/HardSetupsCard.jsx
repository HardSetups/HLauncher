// HardSetups hesabı kartı (Hesap sayfası) + cihaz kodu ile bağlanma penceresi.
// Giriş tarayıcıda yapılır: launcher parola görmez. Token'lar ana süreçte kalır;
// buraya yalnızca özet (kullanıcı adı, bakiye) gelir. alpha.7'den beri hesap zorunlu:
// oturum yokken kabuk yerine giriş ekranı (AuthScreen) görünür, bu kart normalde bağlı
// hâlde çizilir. Cihaz kodu mantığı giriş ekranıyla ortak (auth/useDeviceLogin).
import { useState, useEffect } from 'react';
import { Link2, ExternalLink, Copy, Check, Loader2, LogOut, Wallet, MonitorSmartphone, ShieldCheck, RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import Modal from './Modal.jsx';
import { formatMinor } from '../utils/money.js';
import { portalErrorText } from '../utils/portal.js';
import { useDeviceLogin } from './auth/useDeviceLogin.js';

function ConnectModal({ open, onClose, onError }) {
  const { t } = useI18n();
  const login = useDeviceLogin();
  const { start, cancel, status, error } = login;

  // Pencere açılınca akışı başlat; kapanınca (onaylanmadıysa) iptal et
  useEffect(() => {
    if (!open) return undefined;
    start();
    return cancel;
  }, [open, start, cancel]);

  useEffect(() => { if (status === 'success') onClose(true); }, [status, onClose]);
  useEffect(() => { if (status === 'error' && error) onError(portalErrorText(t, error)); }, [status, error, onError, t]);

  const flow = login.flow;
  return (
    <Modal
      open={open}
      onClose={() => onClose(false)}
      icon={<Link2 size={18} />}
      title={t('hs.connecting.title')}
      footer={
        <>
          <button className="btn-ghost" onClick={() => onClose(false)}>{t('common.cancel')}</button>
          {login.ended
            ? <button className="btn-primary" onClick={() => start()} autoFocus>{t('hs.retry')}</button>
            : <button className="btn-primary" onClick={login.openBrowser} disabled={!flow}><ExternalLink size={15} /> {t('hs.openBrowser')}</button>}
        </>
      }
    >
      <p className="modal-text">{t('hs.connecting.text')}</p>
      <div className="hs-code" aria-live="polite">
        <span className="hs-code-label">{t('hs.code')}</span>
        {flow ? <strong className="hs-code-value">{flow.userCode}</strong> : <Loader2 size={22} className="spin" />}
      </div>
      <div className={`hs-status is-${status}`} role="status">
        {status === 'waiting' && <><Loader2 size={14} className="spin" /> {t('hs.waiting')}</>}
        {status === 'starting' && <><Loader2 size={14} className="spin" /> {t('common.loading')}</>}
        {status === 'denied' && t('hs.denied')}
        {status === 'expired' && t('hs.expired')}
      </div>
      {flow && !login.ended && (
        <p className="hs-fallback">
          {t('hs.noBrowser')}{' '}
          <button className="link-btn" onClick={login.copy}>
            {login.copied ? <><Check size={12} /> {t('hs.copied')}</> : <><Copy size={12} /> {t('hs.copyUrl')}</>}
          </button>
          <span className="hs-fallback-url">{flow.verificationUri}</span>
        </p>
      )}
    </Modal>
  );
}

export default function HardSetupsCard({ portal, onError }) {
  const { t, lang } = useI18n();
  const api = window.electronAPI;
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Oturum durumu 'portal:login' olayından önce gelebilir: bağlanınca pencere
  // durumunu da sıfırla, yoksa sonraki oturum kapanışında pencere kendiliğinden açılır.
  const signedIn = !!portal?.signedIn;
  useEffect(() => { if (signedIn) setConnecting(false); }, [signedIn]);

  if (!portal) return null;

  // minVersion altındaysa HardSetups bölümü kilitli; genel launcher çalışmaya devam eder
  if (portal.outdated) {
    return (
      <section className="card hs-card is-locked">
        <div className="hs-card-main">
          <span className="hs-mark" aria-hidden="true">HS</span>
          <div className="hs-card-text">
            <h3>{t('hs.title')}</h3>
            <p>{t('hs.locked', { min: portal.outdated.minVersion || '' })}</p>
          </div>
        </div>
        <button className="btn-secondary" onClick={() => api.portalOpenLink('launcher')}><ExternalLink size={15} /> {t('hs.outdated.download')}</button>
      </section>
    );
  }

  // Çıkış onaylanınca oturum kapanır ve kapı (giriş ekranı) görünür; bu kart da kalkar
  const logout = async () => {
    setConfirmLogout(false);
    setBusy(true);
    try {
      const res = await api.portalLogout();
      if (!res.ok) onError(portalErrorText(t, res.error));
    } finally { setBusy(false); }
  };

  const openLink = async (kind) => {
    const res = await api.portalOpenLink(kind);
    if (!res.ok) onError(portalErrorText(t, res.error));
  };

  // Sunucu launcher uçlarını henüz açmadıysa bağlanma denenmez; yeniden denetlenebilir
  if (!portal.signedIn && portal.accountAvailable === false) {
    const recheck = async () => {
      setBusy(true);
      try {
        const res = await api.portalRefresh();
        if (!res.ok) onError(portalErrorText(t, res.error));
      } finally { setBusy(false); }
    };
    return (
      <section className="card hs-card">
        <div className="hs-card-main">
          <span className="hs-mark" aria-hidden="true">HS</span>
          <div className="hs-card-text">
            <h3>{t('hs.title')}</h3>
            <p>{t('hs.unavailable')}</p>
          </div>
        </div>
        <button className="btn-secondary" onClick={recheck} disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} {t('hs.retry.load')}
        </button>
      </section>
    );
  }

  if (!portal.signedIn) {
    return (
      <section className="card hs-card">
        <div className="hs-card-main">
          <span className="hs-mark" aria-hidden="true">HS</span>
          <div className="hs-card-text">
            <h3>{t('hs.title')}</h3>
            <p>{t('hs.desc')}</p>
            <span className="hs-safe"><ShieldCheck size={13} /> {t('hs.safe')}</span>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setConnecting(true)}>
          <Link2 size={15} /> {t('hs.connect')}
        </button>
        <ConnectModal open={connecting && !signedIn} onClose={() => setConnecting(false)} onError={onError} />
      </section>
    );
  }

  const balance = portal.wallet ? formatMinor(portal.wallet.balanceMinor, portal.wallet.currency, lang) : null;
  return (
    <section className="card hs-card is-connected">
      <div className="hs-card-main">
        <span className="hs-mark" aria-hidden="true">{(portal.user?.username || 'H').slice(0, 1).toUpperCase()}</span>
        <div className="hs-card-text">
          <span className="acct-type is-microsoft">{t('hs.connected')}</span>
          <h3 className="hs-username" title={portal.user?.username}>{portal.user?.username}</h3>
          {balance && (
            <span className="hs-balance">
              <Wallet size={13} /> {t('hs.balance')}: <b>{balance}</b>
              <button className="link-btn" onClick={() => openLink('wallet')}>{t('hs.wallet')}</button>
              <button className="link-btn" onClick={() => openLink('topup')}>{t('hs.buy.topup')}</button>
            </span>
          )}
        </div>
      </div>
      <div className="acct-actions">
        <button className="btn-secondary" onClick={() => openLink('account')}><ExternalLink size={15} /> {t('hs.myAccount')}</button>
        <button className="btn-ghost" onClick={() => openLink('devices')}><MonitorSmartphone size={15} /> {t('hs.devices')}</button>
        <button className="btn-ghost hs-logout" onClick={() => setConfirmLogout(true)} disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <LogOut size={15} />} {t('hs.logout')}
        </button>
      </div>
      <Modal
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        icon={<LogOut size={18} />}
        title={t('auth.logout.title')}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirmLogout(false)} autoFocus>{t('common.cancel')}</button>
            <button className="btn-primary hs-logout-confirm" onClick={logout}>{t('auth.logout.confirm')}</button>
          </>
        }
      >
        <p className="modal-text">{t('auth.logout.text')}</p>
      </Modal>
    </section>
  );
}
