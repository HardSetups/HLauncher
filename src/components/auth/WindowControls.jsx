// Giriş ekranı ve açılış ekranı için pencere düğmeleri (pencere çerçevesiz; TopBar kapının arkasında).
import { useState, useEffect } from 'react';
import { X, Minus, Square, Copy } from 'lucide-react';
import { useI18n } from '../../i18n.jsx';

export default function WindowControls() {
  const { t } = useI18n();
  const api = window.electronAPI;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    api.isMaximized?.().then(setMaximized).catch(() => {});
    return api.onWindowMaximized?.(setMaximized);
  }, [api]);

  return (
    <div className="auth-win">
      <button type="button" className="auth-win-btn" title={t('win.minimize')} aria-label={t('win.minimize')} onClick={() => api.minimizeApp()}>
        <Minus size={15} />
      </button>
      <button type="button" className="auth-win-btn" title={maximized ? t('win.restore') : t('win.maximize')}
        aria-label={maximized ? t('win.restore') : t('win.maximize')} onClick={() => api.toggleMaximize()}>
        {maximized ? <Copy size={13} /> : <Square size={13} />}
      </button>
      <button type="button" className="auth-win-btn is-close" title={t('win.close')} aria-label={t('win.close')} onClick={() => api.closeApp()}>
        <X size={15} />
      </button>
    </div>
  );
}
