// Üst bar: sürükleme alanı, konum (breadcrumb), oyun durumu ve pencere düğmeleri.
import { useState, useEffect } from 'react';
import { X, Minus, Square, Copy, Loader2, ChevronRight, ArrowUpCircle } from 'lucide-react';
import { useI18n } from '../i18n.jsx';

function WindowButton({ onClick, danger, title, children }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} className={`win-btn${danger ? ' win-btn-danger' : ''}`}>
      {children}
    </button>
  );
}

/**
 * crumbs: [{ label, onClick? }]
 * status: null | { kind: 'launching' | 'running', name, detail?, pct? }
 */
export default function TopBar({ crumbs, status, onStop, updateReady, onOpenUpdate }) {
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.electronAPI.isMaximized?.().then(setMaximized).catch(() => {});
    return window.electronAPI.onWindowMaximized?.(setMaximized);
  }, []);

  return (
    <header className="topbar">
      <nav className="crumbs" aria-label={t('top.location')}>
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="crumb">
            {i > 0 && <ChevronRight size={14} className="crumb-sep" />}
            {c.onClick && i < crumbs.length - 1
              ? <button className="crumb-link" onClick={c.onClick}>{c.label}</button>
              : <span className={i === crumbs.length - 1 ? 'crumb-current' : ''}>{c.label}</span>}
          </span>
        ))}
      </nav>

      <div className="topbar-drag" />

      <div className="topbar-right">
        {updateReady && (
          <button className="update-pill" onClick={onOpenUpdate} title={t('upd.pill.title')}>
            <ArrowUpCircle size={15} />
            <span>{t('upd.pill')}</span>
          </button>
        )}
        <div className={`run-status${status ? ` is-${status.kind}` : ''}`} aria-live="polite">
          {status?.kind === 'launching' && <Loader2 size={13} className="spin" />}
          {status?.kind === 'running' && <span className="run-dot" />}
          {!status && <span className="run-dot is-idle" />}
          <span className="run-text">
            {status
              ? (status.kind === 'running'
                ? t('top.running', { name: status.name })
                : `${t('top.launching', { name: status.name })}${status.pct != null ? ` · %${status.pct}` : ''}`)
              : t('top.idle')}
          </span>
          {status?.kind === 'running' && (
            <button className="run-stop" onClick={onStop}>{t('play.stopShort')}</button>
          )}
        </div>

        <div className="win-controls">
          <WindowButton title={t('win.minimize')} onClick={() => window.electronAPI.minimizeApp()}>
            <Minus size={15} />
          </WindowButton>
          <WindowButton title={maximized ? t('win.restore') : t('win.maximize')} onClick={() => window.electronAPI.toggleMaximize()}>
            {maximized ? <Copy size={13} /> : <Square size={13} />}
          </WindowButton>
          <WindowButton danger title={t('win.close')} onClick={() => window.electronAPI.closeApp()}>
            <X size={15} />
          </WindowButton>
        </div>
      </div>
    </header>
  );
}
