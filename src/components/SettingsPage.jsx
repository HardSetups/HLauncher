// Ayarlar: bölümler halinde satırlar — solda ad + açıklama, sağda kontrol.
import { Check, FolderOpen, RefreshCw, RotateCw, Camera, Trash2, LifeBuoy } from 'lucide-react';
import { contrastText } from '../utils/color';
import { useI18n } from '../i18n.jsx';
import { Switch } from './ui.jsx';

const ACCENTS = [
  { color: '#ff6a3d', key: 'fire' },
  { color: '#00f2ff', key: 'ice' },
  { color: '#ef4444', key: 'crimson' },
  { color: '#10b981', key: 'emerald' },
  { color: '#8b5cf6', key: 'purple' },
  { color: '#f59e0b', key: 'amber' },
];

const JVM_PRESETS = ['balanced', 'lowram', 'zgc', 'custom'];

function updaterStatusText(t, status) {
  switch (status?.state) {
    case 'checking': return t('upd.checking');
    case 'uptodate': return t('upd.uptodate');
    case 'downloading': return t('upd.downloading', { pct: status.percent ?? 0 });
    case 'ready': return t('upd.ready', { version: status.version || '' });
    case 'dev': return t('upd.dev');
    case 'error': return t('upd.error', { message: status.message || '' });
    default: return '';
  }
}

function Row({ title, desc, children, align }) {
  return (
    <div className={`setting-row${align === 'top' ? ' is-top' : ''}`}>
      <div className="setting-label"><b>{title}</b>{desc && <span>{desc}</span>}</div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

export default function SettingsPage({ settings, updateSetting, systemInfo, accent, updaterStatus, onNotice, onError, onReport }) {
  const { t, lang, setLang } = useI18n();
  const fail = (err) => onError?.(String(err?.message || err));

  const handleClearCache = async () => {
    try {
      const res = await window.electronAPI.clearCache();
      onNotice?.(t('set.clearCache.done', { mb: (res.freedBytes / (1024 * 1024)).toFixed(1) }));
    } catch (err) { fail(err); }
  };

  const handleBrowseJava = async () => {
    try {
      const selected = await window.electronAPI.selectJavaPath();
      if (selected) updateSetting('javaPath', selected);
    } catch (err) { fail(err); }
  };

  const RAM_MIN = 1;
  const ramMax = Math.max(4, (systemInfo.totalMemGb || 16) - 2);
  const ramRecommended = Math.min(8, Math.max(2, Math.floor((systemInfo.totalMemGb || 16) / 2)));
  const ramValue = Math.min(Math.max(settings.ram, RAM_MIN), ramMax);
  const ramFill = ((ramValue - RAM_MIN) / (ramMax - RAM_MIN)) * 100;
  const updText = updaterStatusText(t, updaterStatus);

  return (
    <div className="settings page-scroll">
      <header className="page-head">
        <div>
          <h1>{t('set.title')}</h1>
          <p className="page-sub">{t('set.sub')}</p>
        </div>
      </header>

      <section className="settings-section">
        <h2 className="settings-heading">{t('set.appearance')}</h2>
        <div className="settings-list">
          <Row title={t('set.accent')} desc={t('set.accent.desc')}>
            <div className="swatches" role="radiogroup" aria-label={t('set.accent')}>
              {ACCENTS.map((a) => (
                <button
                  key={a.color}
                  role="radio"
                  aria-checked={accent === a.color}
                  className={`swatch${accent === a.color ? ' is-selected' : ''}`}
                  style={{ background: a.color }}
                  onClick={() => updateSetting('accent', a.color)}
                  title={t(`set.accent.${a.key}`)}
                  aria-label={t(`set.accent.${a.key}`)}
                >
                  {accent === a.color && <Check size={15} color={contrastText(a.color)} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </Row>
          <Row title={t('set.language')}>
            <div className="seg">
              {[{ id: 'tr', label: 'Türkçe' }, { id: 'en', label: 'English' }].map((l) => (
                <button key={l.id} className={`seg-btn${lang === l.id ? ' is-active' : ''}`} aria-pressed={lang === l.id}
                  onClick={() => { setLang(l.id); updateSetting('language', l.id); }}>
                  {l.label}
                </button>
              ))}
            </div>
          </Row>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">{t('set.game')}</h2>
        <div className="settings-list">
          <Row title={t('set.ram')} desc={t('set.ram.desc', { rec: ramRecommended })} align="top">
            <div className="ram-control">
              <input
                type="range" min={RAM_MIN} max={ramMax} value={ramValue}
                onChange={(e) => updateSetting('ram', parseInt(e.target.value, 10))}
                aria-label={t('set.ram')}
                style={{ background: `linear-gradient(to right, var(--accent) ${ramFill}%, var(--raised-3) ${ramFill}%)` }}
              />
              <span className="ram-value">{ramValue} GB</span>
            </div>
          </Row>
          <Row title={t('set.fullscreen')} desc={t('set.fullscreen.desc')}>
            <Switch checked={!!settings.fullscreen} onChange={(v) => updateSetting('fullscreen', v)} label={t('set.fullscreen')} />
          </Row>
          <Row title={t('set.jvm')} desc={t('set.jvm.desc')} align="top">
            <div className="stack-end">
              <div className="seg">
                {JVM_PRESETS.map((p) => (
                  <button key={p} className={`seg-btn${settings.jvmPreset === p ? ' is-active' : ''}`} aria-pressed={settings.jvmPreset === p} onClick={() => updateSetting('jvmPreset', p)}>
                    {t(`set.jvm.${p}`)}
                  </button>
                ))}
              </div>
              {settings.jvmPreset === 'custom' && (
                <input
                  className="mono-input"
                  value={settings.customJvmArgs}
                  onChange={(e) => updateSetting('customJvmArgs', e.target.value)}
                  placeholder={t('set.jvm.customArgs')}
                  spellCheck={false}
                />
              )}
            </div>
          </Row>
          <Row title={t('set.java.label')} desc={t('set.java.hint')} align="top">
            <div className="stack-end">
              <div className="input-group">
                <input value={settings.javaPath} onChange={(e) => updateSetting('javaPath', e.target.value)} placeholder={t('set.java.placeholder')} spellCheck={false} />
                <button className="btn-secondary" onClick={handleBrowseJava}>{t('set.java.browse')}</button>
              </div>
              {settings.javaPath && <button className="link-btn" onClick={() => updateSetting('javaPath', '')}>{t('set.java.clear')}</button>}
            </div>
          </Row>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">{t('set.launcher')}</h2>
        <div className="settings-list">
          <Row title={t('set.rpc')} desc={t('set.rpc.desc')}>
            <Switch checked={settings.rpcEnabled !== false} onChange={(v) => updateSetting('rpcEnabled', v)} label={t('set.rpc')} />
          </Row>
          <Row title={t('set.tray')} desc={t('set.tray.desc')}>
            <Switch checked={settings.minimizeToTray === true} onChange={(v) => updateSetting('minimizeToTray', v)} label={t('set.tray')} />
          </Row>
          <Row title={t('set.updates')} desc={t('set.updates.desc')}>
            <Switch checked={!!settings.checkUpdates} onChange={(v) => updateSetting('checkUpdates', v)} label={t('set.updates')} />
          </Row>
          <Row title={t('set.version', { version: systemInfo.appVersion ? `v${systemInfo.appVersion}` : '' })} desc={updText || t('set.version.desc')}>
            <div className="row-buttons">
              {updaterStatus?.state === 'ready' && (
                <button className="btn-primary" onClick={() => window.electronAPI.installAppUpdate()}><RotateCw size={15} /> {t('upd.installNow')}</button>
              )}
              <button className="btn-secondary" onClick={() => window.electronAPI.checkAppUpdate().catch(fail)} disabled={['checking', 'downloading'].includes(updaterStatus?.state)}>
                <RefreshCw size={15} className={updaterStatus?.state === 'checking' ? 'spin' : undefined} /> {t('upd.check')}
              </button>
            </div>
          </Row>
          <Row title={t('set.folders')} desc={t('set.folders.desc')}>
            <div className="row-buttons">
              <button className="btn-secondary" onClick={() => window.electronAPI.openLogs()}><FolderOpen size={15} /> {t('set.logsShort')}</button>
              <button className="btn-secondary" onClick={() => window.electronAPI.openScreenshots()}><Camera size={15} /> {t('set.screenshots')}</button>
            </div>
          </Row>
          <Row title={t('set.clearCache')} desc={t('set.clearCache.desc')}>
            <button className="btn-secondary" onClick={handleClearCache}><Trash2 size={15} /> {t('set.clearCache.btn')}</button>
          </Row>
          {onReport && (
            <Row title={t('hs.report.title')} desc={t('hs.report.desc')}>
              <button className="btn-secondary" onClick={onReport}><LifeBuoy size={15} /> {t('hs.report.open')}</button>
            </Row>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">{t('set.about')}</h2>
        <div className="settings-list">
          <Row
            title={`HLauncher${systemInfo.appVersion ? ` v${systemInfo.appVersion}` : ''}`}
            desc={`${t(!systemInfo.packaged ? 'set.about.devMode' : systemInfo.signed ? 'set.about.signed' : 'set.about.unsigned')} · ${t('set.about.legal')}`}
          />
        </div>
      </section>
    </div>
  );
}
