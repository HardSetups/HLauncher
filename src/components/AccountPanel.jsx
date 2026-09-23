import { useState } from 'react';
import { LogIn, LogOut, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import SkinViewer3D from './SkinViewer3D.jsx';

// Hesap: giriş yapılmışsa skin + bilgiler, değilse Microsoft / çevrimdışı giriş.
// Onboarding sihirbazı da bu bileşeni kullanır (onDone ile ilerler).
function AccountPanel({ account, setAccount, onError, onDone }) {
  const { t } = useI18n();
  const [offlineName, setOfflineName] = useState('');
  const [msBusy, setMsBusy] = useState(false);

  // IPC reddedilse bile kullanıcı hatayı görsün (sessiz başarısızlık yok)
  const surfaceError = (err) => onError(String(err?.message || err));

  const handleMicrosoft = async () => {
    setMsBusy(true);
    try {
      const res = await window.electronAPI.loginMicrosoft();
      if (!res.ok) { onError(res.error); return; }
      setAccount(res.account);
      onDone?.();
    } catch (err) {
      surfaceError(err);
    } finally {
      setMsBusy(false);
    }
  };

  const handleOffline = async (e) => {
    e?.preventDefault();
    if (!offlineName.trim()) return;
    try {
      const res = await window.electronAPI.loginOffline(offlineName.trim());
      if (!res.ok) { onError(res.error); return; }
      setAccount(res.account);
      setOfflineName('');
      onDone?.();
    } catch (err) {
      surfaceError(err);
    }
  };

  const handleLogout = async () => {
    try {
      await window.electronAPI.logout();
      setAccount(null);
    } catch (err) {
      surfaceError(err);
    }
  };

  if (account) {
    return (
      <div className="card account-card">
        <div className="account-skin"><SkinViewer3D account={account} width={130} height={200} /></div>
        <div className="account-info">
          <span className="account-kind">{account.type === 'microsoft' ? t('acc.type.microsoft') : t('acc.type.offline')}</span>
          <p className="account-name">{account.name}</p>
          {account.type !== 'microsoft' && <p className="account-hint">{t('acc.offline.desc')}</p>}
          <button className="btn-secondary" onClick={handleLogout}><LogOut size={15} /> {t('acc.logout')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-stack">
      <div className="card login-card">
        <div className="login-text">
          <b>{t('acc.microsoft')}</b>
          <span>{t('acc.microsoft.desc')}</span>
        </div>
        <button className="btn-primary" onClick={handleMicrosoft} disabled={msBusy}>
          {msBusy ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}
          {msBusy ? t('acc.microsoft.busyShort') : t('acc.microsoft.btn')}
        </button>
      </div>

      <form className="card login-card" onSubmit={handleOffline}>
        <div className="login-text">
          <b>{t('acc.offline')}</b>
          <span>{t('acc.offline.desc')}</span>
        </div>
        <div className="input-group">
          <input
            value={offlineName} onChange={(e) => setOfflineName(e.target.value)}
            placeholder={t('acc.offline.placeholder')} maxLength={16} spellCheck={false}
          />
          <button type="submit" className="btn-secondary" disabled={!offlineName.trim()}>{t('acc.offline.btn')}</button>
        </div>
      </form>
    </div>
  );
}

export default AccountPanel;
