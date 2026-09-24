// HardSetups hesabı kartı (Hesap sayfası) + cihaz kodu ile bağlanma penceresi.
// Giriş tarayıcıda yapılır: launcher parola görmez. Token'lar ana süreçte kalır;
// buraya yalnızca özet (kullanıcı adı, bakiye) gelir.
import { useState, useEffect } from 'react';
import { Link2, ExternalLink, Copy, Check, Loader2, LogOut, Wallet, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import Modal from './Modal.jsx';
import { formatMinor } from '../utils/money.js';
import { portalErrorText } from '../utils/portal.js';

function ConnectModal({ open, onClose, onError }) {
  const { t } = useI18n();
  const api = window.electronAPI;
  const [flow, setFlow] = useState(null);     // { userCode, verificationUri }
  const [status, setStatus] = useState('idle'); // idle | starting | waiting | denied | expired | error
  const [copied, setCopied] = useState(false);

  const start = async () => {
    setStatus('starting');
    setFlow(null);
    try {
      const res = await api.portalLoginStart();
      if (!res.ok) { setStatus('error'); onError(portalErrorText(t, res.error)); return; }
      setFlow({ userCode: res.userCode, verificationUri: res.verificationUri });
      setStatus('waiting');
    } catch (err) {
      setStatus('error');
      onError(String(err?.message || err));
    }
  };

  // Pencere açılınca akışı başlat; kapanınca (onaylanmadıysa) iptal et
  useEffect(() => {
    if (!open) return undefined;
    start();
    const off = api.onPortalLogin((res) => {
      if (res.state === 'success') { onClose(true); return; }
      if (res.state === 'denied' || res.state === 'expired') setStatus(res.state);
      if (res.state === 'error') { setStatus('error'); onError(portalErrorText(t, res.error)); }
    });
    return () => { off?.(); api.portalLoginCancel(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copy = async () => {
    const res = await api.portalCopyVerification();
    if (res.ok && res.copied) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  const ended = status === 'denied' || status === 'expired' || status === 'error';

  return (
    <Modal
      open={open}
      onClose={() => onClose(false)}
      icon={<Link2 size={18} />}
      title={t('hs.connecting.title')}
      footer={
        <>
          <button className="btn-ghost" onClick={() => onClose(false)}>{t('common.cancel')}</button>
          {ended
            ? <button className="btn-primary" onClick={start} autoFocus>{t('hs.retry')}</button>
            : <button className="btn-primary" onClick={() => api.portalOpenVerification()} disabled={!flow}><ExternalLink size={15} /> {t('hs.openBrowser')}</button>}
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
      {flow && !ended && (
        <p className="hs-fallback">
          {t('hs.noBrowser')}{' '}
          <button className="link-btn" onClick={copy}>
            {copied ? <><Check size={12} /> {t('hs.copied')}</> : <><Copy size={12} /> {t('hs.copyUrl')}</>}
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

  const logout = async () => {
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
          <h3 className="hs-username">{portal.user?.username}</h3>
          {balance && <span className="hs-balance"><Wallet size={13} /> {t('hs.balance')}: <b>{balance}</b></span>}
        </div>
      </div>
      <div className="acct-actions">
        <button className="btn-secondary" onClick={() => openLink('account')}><ExternalLink size={15} /> {t('hs.myAccount')}</button>
        <button className="btn-ghost" onClick={() => openLink('devices')}><MonitorSmartphone size={15} /> {t('hs.devices')}</button>
        <button className="btn-ghost" onClick={logout} disabled={busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <LogOut size={15} />} {t('hs.logout')}
        </button>
      </div>
    </section>
  );
}
