import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Check, Server, Package, Box, FolderOpen } from 'lucide-react';
import { contrastText } from '../utils/color';
import { useI18n } from '../i18n.jsx';

const LOADER_OPTIONS = ['release', 'optifine', 'fabric', 'quilt', 'forge', 'neoforge'];
const LOADER_LABELS = { release: 'Release', optifine: 'OptiFine', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

const selectStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px', padding: '10px 12px', color: '#fff', fontSize: '14px',
  outline: 'none', cursor: 'pointer',
};

function OriginBadge({ origin, t }) {
  if (origin === 'server') return <span style={badgeStyle}><Server size={10} /> {t('prof.origin.server')}</span>;
  if (origin === 'mrpack') return <span style={badgeStyle}><Package size={10} /> {t('prof.origin.mrpack')}</span>;
  if (origin === 'builtin') return <span style={badgeStyle}><Box size={10} /> {t('prof.origin.builtin')}</span>;
  return null;
}

const badgeStyle = {
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  fontSize: '10px', fontWeight: '700', color: 'rgba(255,255,255,0.5)',
  background: 'rgba(255,255,255,0.07)', padding: '3px 8px', borderRadius: '8px',
};

function ProfileCard({ instance, isActive, accent, versionManifest, onSetActive, onUpdate, onDelete, t }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      className="glass-panel"
      style={{
        padding: '20px',
        border: `1px solid ${isActive ? accent : 'rgba(255,255,255,0.07)'}`,
        boxShadow: isActive ? `0 8px 30px ${accent}22` : 'none',
        display: 'flex', flexDirection: 'column', gap: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '800', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {instance.name}
        </h3>
        {isActive && (
          <span style={{ fontSize: '10px', fontWeight: '800', background: `${accent}22`, color: accent, padding: '3px 10px', borderRadius: '10px', letterSpacing: '1px' }}>
            {t('prof.active')}
          </span>
        )}
        <OriginBadge origin={instance.origin} t={t} />
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 130px' }}>
          <label style={labelStyle}>{t('prof.version')}</label>
          <select
            value={instance.mcVersion || ''}
            onChange={(e) => onUpdate(instance.id, { mcVersion: e.target.value || null })}
            style={{ ...selectStyle, width: '100%' }}
          >
            <option value="">{t('prof.latest')}</option>
            {versionManifest.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label style={labelStyle}>{t('prof.loader')}</label>
          <select
            value={instance.loader}
            onChange={(e) => onUpdate(instance.id, { loader: e.target.value })}
            style={{ ...selectStyle, width: '100%' }}
          >
            {LOADER_OPTIONS.map((l) => <option key={l} value={l}>{LOADER_LABELS[l]}</option>)}
          </select>
        </div>
        <div style={{ flex: '0 1 100px' }}>
          <label style={labelStyle}>{t('prof.ram')}</label>
          <input
            type="number" min="1" max="64"
            value={instance.ram || ''}
            placeholder="—"
            onChange={(e) => onUpdate(instance.id, { ram: e.target.value ? parseInt(e.target.value, 10) : null })}
            style={{ ...selectStyle, width: '100%' }}
          />
        </div>
      </div>

      {instance.serverAddress && (
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Server size={11} /> {instance.serverAddress}
        </p>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        {!isActive && (
          <button
            onClick={() => onSetActive(instance.id)}
            style={{ flex: 1, background: accent, color: contrastText(accent), borderRadius: '10px', padding: '10px', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <Check size={15} /> {t('prof.select')}
          </button>
        )}
        <button
          onClick={() => window.electronAPI.openInstanceDir(instance.id)}
          title={t('prof.openFolder')}
          style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', borderRadius: '10px', padding: '10px 14px' }}
        >
          <FolderOpen size={15} />
        </button>
        {instance.id !== 'default' && (
          <button
            onClick={() => onDelete(instance)}
            title={t('common.delete')}
            style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', borderRadius: '10px', padding: '10px 14px' }}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

const labelStyle = {
  display: 'block', fontSize: '10px', fontWeight: '700',
  color: 'rgba(255,255,255,0.4)', letterSpacing: '0.5px', marginBottom: '6px',
};

function ProfilesPanel({ instances, activeInstanceId, accent, versionManifest, onSetActive, onUpdate, onDelete, onCreate }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [mcVersion, setMcVersion] = useState('');
  const [loader, setLoader] = useState('fabric');

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), mcVersion: mcVersion || null, loader });
    setName('');
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <h2 style={{ fontSize: '40px', fontWeight: '800', marginBottom: '8px' }}>{t('prof.title')}</h2>
      <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '24px' }}>{t('prof.subtitle')}</p>

      <div className="glass-panel" style={{ padding: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder={t('prof.name.placeholder')} className="prof-input"
          style={{ marginTop: 0, flex: 1, minWidth: '200px' }}
        />
        <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)} style={selectStyle}>
          <option value="">{t('prof.latest')}</option>
          {versionManifest.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
        </select>
        <select value={loader} onChange={(e) => setLoader(e.target.value)} style={selectStyle}>
          {LOADER_OPTIONS.map((l) => <option key={l} value={l}>{LOADER_LABELS[l]}</option>)}
        </select>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleCreate}
          style={{ background: accent, color: contrastText(accent), borderRadius: '12px', padding: '12px 20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
        >
          <Plus size={18} /> {t('prof.create')}
        </motion.button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px', overflowY: 'auto', paddingRight: '4px' }}>
        <AnimatePresence mode="popLayout">
          {instances.map((instance) => (
            <ProfileCard
              key={instance.id}
              instance={instance}
              isActive={instance.id === activeInstanceId}
              accent={accent}
              versionManifest={versionManifest}
              onSetActive={onSetActive}
              onUpdate={onUpdate}
              onDelete={onDelete}
              t={t}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default ProfilesPanel;
