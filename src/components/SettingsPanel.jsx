import { motion } from 'framer-motion';
import { Check, FolderOpen, RefreshCw, RotateCw, Palette, Zap, Coffee, Globe } from 'lucide-react';

const sectionTitleStyle = { fontSize: '17px', fontWeight: '700', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' };
import { contrastText } from '../utils/color';
import { useI18n } from '../i18n.jsx';

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

const JVM_PRESETS = ['balanced', 'lowram', 'zgc', 'custom'];

export function ToggleCard({ label, desc, active, color, onClick }) {
  return (
    <div onClick={onClick} style={{ flex: '1', minWidth: '200px', background: active ? `${color}22` : 'rgba(255,255,255,0.05)', border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`, borderRadius: '16px', padding: '20px', cursor: 'pointer', transition: 'all 0.3s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontWeight: '600', marginBottom: '4px' }}>{label}</p>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{desc}</p>
        </div>
        <div style={{ width: '48px', height: '26px', background: active ? color : 'rgba(255,255,255,0.2)', borderRadius: '13px', position: 'relative', transition: 'all 0.3s', flexShrink: 0 }}>
          <div style={{ width: '20px', height: '20px', background: 'white', borderRadius: '50%', position: 'absolute', top: '3px', left: active ? '25px' : '3px', transition: 'all 0.3s' }} />
        </div>
      </div>
    </div>
  );
}

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

function SettingsPanel({ settings, updateSetting, systemInfo, accent, updaterStatus }) {
  const { t, lang, setLang } = useI18n();
  const onAccent = contrastText(accent);

  const ramMaxLimit = Math.max(4, (systemInfo.totalMemGb || 16) - 2);
  const ramRecommended = Math.min(8, Math.max(2, Math.floor((systemInfo.totalMemGb || 16) / 2)));

  return (
    <div style={{ width: '100%', maxWidth: '700px', overflowY: 'auto', paddingRight: '8px' }}>
      <h2 style={{ fontSize: '40px', fontWeight: '800', marginBottom: '32px' }}>{t('set.title')}</h2>

      {/* Görünüm */}
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '24px' }}>
        <h3 style={{ ...sectionTitleStyle, color: accent }}><Palette size={17} /> {t('set.appearance')}</h3>

        <label style={{ display: 'block', fontWeight: '600', marginBottom: '14px' }}>{t('set.accent')}</label>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '28px' }}>
          {ACCENTS.map((a) => (
            <motion.button
              key={a.color}
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => updateSetting('accent', a.color)}
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

        <label style={{ display: 'block', fontWeight: '600', marginBottom: '14px' }}>{t('set.bg')}</label>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {BACKGROUNDS.map((bg) => (
            <motion.div
              key={bg.file}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => updateSetting('bgImage', bg.file)}
              style={{
                cursor: 'pointer', borderRadius: '14px', overflow: 'hidden',
                border: settings.bgImage === bg.file ? `2px solid ${accent}` : '2px solid rgba(255,255,255,0.1)',
                boxShadow: settings.bgImage === bg.file ? `0 6px 24px ${accent}44` : 'none',
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
              {settings.bgImage === bg.file && (
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
        <h3 style={{ ...sectionTitleStyle, color: accent }}><Zap size={17} /> {t('set.performance')}</h3>

        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <label style={{ fontWeight: '600' }}>{t('set.ram')}</label>
            <span style={{ background: accent, color: onAccent, padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '14px' }}>{settings.ram} GB</span>
          </div>
          <input type="range" min="1" max={ramMaxLimit} value={Math.min(settings.ram, ramMaxLimit)}
            onChange={(e) => updateSetting('ram', parseInt(e.target.value, 10))}
            className="custom-slider"
            style={{ width: '100%', height: '8px', borderRadius: '4px', background: `linear-gradient(to right, ${accent} ${(settings.ram / ramMaxLimit) * 100}%, rgba(255,255,255,0.1) ${(settings.ram / ramMaxLimit) * 100}%)`, cursor: 'pointer', WebkitAppearance: 'none' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>
            <span>1 GB</span><span>{t('set.ram.hint', { rec: ramRecommended })}</span><span>{ramMaxLimit} GB</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '28px' }}>
          <ToggleCard
            label={t('set.fullscreen')} desc={t('set.fullscreen.desc')}
            active={settings.fullscreen} color="#10b981"
            onClick={() => updateSetting('fullscreen', !settings.fullscreen)}
          />
          <ToggleCard
            label={t('set.updates')} desc={t('set.updates.desc')}
            active={settings.checkUpdates} color="#3b82f6"
            onClick={() => updateSetting('checkUpdates', !settings.checkUpdates)}
          />
        </div>

        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px' }}>{t('set.jvm')}</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {JVM_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => updateSetting('jvmPreset', p)}
              style={{
                padding: '10px 16px', borderRadius: '10px', fontWeight: '700', fontSize: '13px',
                background: settings.jvmPreset === p ? accent : 'rgba(255,255,255,0.06)',
                color: settings.jvmPreset === p ? onAccent : 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {t(`set.jvm.${p}`)}
            </button>
          ))}
        </div>
        {settings.jvmPreset === 'custom' && (
          <input
            type="text" value={settings.customJvmArgs}
            onChange={(e) => updateSetting('customJvmArgs', e.target.value)}
            placeholder={t('set.jvm.customArgs')}
            className="prof-input" style={{ marginTop: 0, fontFamily: 'Consolas, monospace', fontSize: '13px' }}
          />
        )}
      </div>

      {/* Java */}
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '24px' }}>
        <h3 style={{ ...sectionTitleStyle, color: '#3b82f6' }}><Coffee size={17} /> {t('set.java')}</h3>
        <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600' }}>{t('set.java.label')}</label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="text" value={settings.javaPath} onChange={(e) => updateSetting('javaPath', e.target.value)}
            placeholder={t('set.java.placeholder')}
            className="prof-input"
            style={{ flex: 1, marginTop: '8px' }}
          />
          <button
            onClick={async () => {
              const selected = await window.electronAPI.selectJavaPath();
              if (selected) updateSetting('javaPath', selected);
            }}
            style={{ marginTop: '8px', padding: '14px 18px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: '600', fontSize: '13px' }}
          >
            {t('set.java.browse')}
          </button>
        </div>
        {settings.javaPath && (
          <button onClick={() => updateSetting('javaPath', '')} style={{ marginTop: '8px', background: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '12px', padding: '4px 0', border: 'none', cursor: 'pointer' }}>
            {t('set.java.clear')}
          </button>
        )}
        <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(59,130,246,0.1)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)' }}>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{t('set.java.hint')}</p>
        </div>
      </div>

      {/* Genel */}
      <div className="glass-panel" style={{ padding: '32px', marginBottom: '24px' }}>
        <h3 style={{ ...sectionTitleStyle, color: accent }}><Globe size={17} /> {t('set.general')}</h3>

        <label style={{ display: 'block', fontWeight: '600', marginBottom: '12px' }}>{t('set.language')}</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {[{ id: 'tr', label: 'Türkçe' }, { id: 'en', label: 'English' }].map((l) => (
            <button
              key={l.id}
              onClick={() => { setLang(l.id); updateSetting('language', l.id); }}
              style={{
                padding: '10px 20px', borderRadius: '10px', fontWeight: '700', fontSize: '13px',
                background: lang === l.id ? accent : 'rgba(255,255,255,0.06)',
                color: lang === l.id ? onAccent : 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <ToggleCard
            label={t('set.rpc')} desc={t('set.rpc.desc')}
            active={settings.rpcEnabled !== false} color="#5865F2"
            onClick={() => updateSetting('rpcEnabled', settings.rpcEnabled === false)}
          />
        </div>

        {/* Launcher güncellemesi */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '16px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: '700' }}>
              {t('set.version', { version: systemInfo.appVersion ? `v${systemInfo.appVersion}` : '' })}
            </span>
            <button
              onClick={() => window.electronAPI.checkAppUpdate()}
              disabled={['checking', 'downloading'].includes(updaterStatus?.state)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)', padding: '8px 14px', borderRadius: '10px', fontWeight: '700', fontSize: '12px' }}
            >
              <RefreshCw size={13} className={updaterStatus?.state === 'checking' ? 'spin' : undefined} />
              {t('upd.check')}
            </button>
            {updaterStatus?.state === 'ready' && (
              <button
                onClick={() => window.electronAPI.installAppUpdate()}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: accent, color: onAccent, padding: '8px 14px', borderRadius: '10px', fontWeight: '800', fontSize: '12px' }}
              >
                <RotateCw size={13} /> {t('upd.installNow')}
              </button>
            )}
          </div>
          {updaterStatusText(t, updaterStatus) && (
            <p style={{ fontSize: '12px', color: updaterStatus?.state === 'error' ? '#ef4444' : 'rgba(255,255,255,0.5)', marginTop: '10px' }}>
              {updaterStatusText(t, updaterStatus)}
            </p>
          )}
        </div>

        <button
          onClick={() => window.electronAPI.openLogs()}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)', padding: '10px 16px', borderRadius: '10px', fontWeight: '600', fontSize: '13px' }}
        >
          <FolderOpen size={15} /> {t('set.logs')}
        </button>
      </div>
    </div>
  );
}

export default SettingsPanel;
