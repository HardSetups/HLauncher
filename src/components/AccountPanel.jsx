import { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn, LogOut, Loader2, User } from 'lucide-react';
import { contrastText } from '../utils/color';
import { useI18n } from '../i18n.jsx';

function AccountPanel({ account, setAccount, accent, onError, onDone }) {
  const { t } = useI18n();
  const [offlineName, setOfflineName] = useState('');
  const [msBusy, setMsBusy] = useState(false);

  const handleMicrosoft = async () => {
    setMsBusy(true);
    try {
      const res = await window.electronAPI.loginMicrosoft();
      if (!res.ok) { onError(res.error); return; }
      setAccount(res.account);
      onDone?.();
    } finally {
      setMsBusy(false);
    }
  };

  const handleOffline = async () => {
    const res = await window.electronAPI.loginOffline(offlineName);
    if (!res.ok) { onError(res.error); return; }
    setAccount(res.account);
    setOfflineName('');
    onDone?.();
  };

  const handleLogout = async () => {
    await window.electronAPI.logout();
    setAccount(null);
  };

  if (account) {
    return (
      <div className="glass-panel" style={{ padding: '32px', maxWidth: '440px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <img
            src={`https://minotar.net/avatar/${encodeURIComponent(account.name)}/64`}
            alt=""
            style={{ borderRadius: '12px', border: `2px solid ${accent}`, width: '64px', height: '64px' }}
          />
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 'bold', fontSize: '22px' }}>{account.name}</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
              {account.type === 'microsoft' ? t('acc.type.microsoft') : t('acc.type.offline')}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{ marginTop: '24px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '12px 18px', borderRadius: '12px', fontWeight: '700', fontSize: '14px' }}
        >
          <LogOut size={16} /> {t('acc.logout')}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '440px' }}>
      {/* Microsoft */}
      <div className="glass-panel" style={{ padding: '28px' }}>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleMicrosoft}
          disabled={msBusy}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            background: '#107C10', color: '#fff', height: '54px', borderRadius: '14px',
            fontWeight: '700', fontSize: '16px',
          }}
        >
          {msBusy ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
          {msBusy ? t('acc.microsoft.busy') : t('acc.microsoft')}
        </motion.button>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '12px', textAlign: 'center' }}>
          {t('acc.microsoft.desc')}
        </p>
      </div>

      {/* Offline */}
      <div className="glass-panel" style={{ padding: '28px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontWeight: '600', fontSize: '14px' }}>
          <User size={16} /> {t('acc.offline')}
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text" value={offlineName} onChange={(e) => setOfflineName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleOffline()}
            placeholder={t('acc.offline.placeholder')}
            className="prof-input" style={{ marginTop: 0, flex: 1 }}
          />
          <button
            onClick={handleOffline}
            style={{ background: accent, color: contrastText(accent), padding: '0 20px', borderRadius: '12px', fontWeight: '700', fontSize: '14px', whiteSpace: 'nowrap' }}
          >
            {t('acc.offline.btn')}
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '12px' }}>
          {t('acc.offline.desc')}
        </p>
      </div>
    </div>
  );
}

export default AccountPanel;
