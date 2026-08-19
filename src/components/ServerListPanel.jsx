import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Plus, Trash2, Users, Star, PackageCheck, Server } from 'lucide-react';
import { contrastText } from '../utils/color';
import { useI18n } from '../i18n.jsx';

function statusDot(status) {
  const color = status?.state === 'online' ? '#4bff4b' : status?.state === 'loading' ? '#f59e0b' : '#666';
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: '7px', height: '7px', flexShrink: 0 }}>
      {status?.state === 'online' && (
        <motion.span
          animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: 0, background: color, borderRadius: '50%' }}
        />
      )}
      <span style={{ width: '7px', height: '7px', background: color, borderRadius: '50%' }} />
    </span>
  );
}

function ServerCard({ accent, server, status, selected, compact, index, onSelect, onRemove, onToggleFavorite, onApplyManifest, t }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
      whileHover={compact ? { x: -6 } : { y: -4 }}
      onClick={() => onSelect(server)}
      style={{
        background: selected ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? accent : 'rgba(255,255,255,0.06)'}`,
        boxShadow: selected ? `0 8px 30px ${accent}22` : 'none',
        borderLeft: `3px solid ${selected ? accent : 'transparent'}`,
        borderRadius: '12px',
        padding: compact ? '14px 16px' : '20px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        transition: 'border-color 0.3s, background 0.3s, box-shadow 0.3s',
      }}
    >
      <div style={{
        width: compact ? '38px' : '48px', height: compact ? '38px' : '48px', borderRadius: '12px',
        background: 'rgba(255,255,255,0.06)', flexShrink: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        {status?.icon
          ? <img src={status.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Server size={compact ? 16 : 20} color="rgba(255,255,255,0.35)" />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {server.favorite && <Star size={12} fill="#f59e0b" color="#f59e0b" style={{ flexShrink: 0 }} />}
          <h4 style={{ fontSize: compact ? '15px' : '17px', fontWeight: '800', color: selected ? accent : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {server.name || server.address}
          </h4>
          {statusDot(status)}
          {!compact && status?.version && (
            <span style={{ fontSize: '10px', fontWeight: '700', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: '8px', flexShrink: 0 }}>
              {status.version}
            </span>
          )}
        </div>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {server.address}
        </p>
        {!compact && (
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '6px', minHeight: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {status?.state === 'online' ? (status.motd || '—') : status?.state === 'loading' ? t('srv.checking') : t('srv.offline')}
          </p>
        )}
      </div>

      {status?.state === 'online' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.6)', fontSize: compact ? '12px' : '13px', flexShrink: 0 }}>
          <Users size={compact ? 12 : 14} />
          <span>{status.players?.online ?? 0}{!compact && `/${status.players?.max ?? 0}`}</span>
        </div>
      )}

      {compact && selected && <ChevronRight size={18} color={accent} style={{ flexShrink: 0 }} />}

      {!compact && (
        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
          {server.manifestUrl && (
            <button
              onClick={(e) => { e.stopPropagation(); onApplyManifest(server); }}
              title={t('srv.applyManifest')}
              style={{ background: 'none', color: accent, padding: '8px' }}
            >
              <PackageCheck size={16} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(server.id); }}
            title={t('srv.favorite')}
            style={{ background: 'none', color: server.favorite ? '#f59e0b' : 'rgba(255,255,255,0.3)', padding: '8px' }}
          >
            <Star size={16} fill={server.favorite ? '#f59e0b' : 'none'} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(server.id); }}
            title={t('srv.remove')}
            style={{ background: 'none', color: 'rgba(255,255,255,0.3)', padding: '8px' }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </motion.div>
  );
}

function sortServers(servers) {
  return [...servers].sort((a, b) => (b.favorite === true) - (a.favorite === true));
}

function ServerListPanel({ accent, variant = 'compact', servers, statuses, selectedServerId, onSelect, onAdd, onRemove, onToggleFavorite, onApplyManifest, onSeeAll }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [manifestUrl, setManifestUrl] = useState('');
  const compact = variant === 'compact';
  const sorted = sortServers(servers);
  const visibleServers = compact ? sorted.slice(0, 5) : sorted;

  const handleAdd = () => {
    if (!address.trim()) return;
    onAdd(name.trim(), address.trim(), manifestUrl.trim());
    setName('');
    setAddress('');
    setManifestUrl('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '12px' : '16px', height: compact ? 'auto' : '100%' }}>
      {!compact && (
        <div>
          <h2 style={{ fontSize: '40px', fontWeight: '800', marginBottom: '8px' }}>{t('srv.title')}</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '24px' }}>{t('srv.subtitle')}</p>
        </div>
      )}

      {!compact && (
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t('srv.name.placeholder')} className="prof-input" style={{ marginTop: 0, flex: '0 0 180px' }}
          />
          <input
            type="text" value={address} onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={t('srv.address.placeholder')} className="prof-input" style={{ marginTop: 0, flex: 1, minWidth: '200px' }}
          />
          <input
            type="text" value={manifestUrl} onChange={(e) => setManifestUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={t('srv.manifest.placeholder')} className="prof-input" style={{ marginTop: 0, flex: 1, minWidth: '200px' }}
          />
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleAdd}
            style={{ background: accent, color: contrastText(accent), border: 'none', borderRadius: '12px', padding: '12px 20px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <Plus size={18} /> {t('common.add')}
          </motion.button>
        </div>
      )}

      {compact && (
        <h3 style={{ fontSize: '14px', fontWeight: '900', color: 'rgba(255,255,255,0.4)', letterSpacing: '2px' }}>{t('srv.title')}</h3>
      )}

      <div style={{ display: compact ? 'flex' : 'grid', flexDirection: compact ? 'column' : undefined, gridTemplateColumns: compact ? undefined : 'repeat(auto-fill, minmax(340px, 1fr))', gap: compact ? '10px' : '16px', overflowY: 'auto' }}>
        {visibleServers.length === 0 && (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', padding: compact ? '4px 0' : '20px 0' }}>
            {compact ? t('srv.empty.compact') : t('srv.empty.grid')}
          </p>
        )}
        <AnimatePresence mode="popLayout">
          {visibleServers.map((server, i) => (
            <ServerCard
              key={server.id}
              accent={accent}
              server={server}
              status={statuses[server.id]}
              selected={selectedServerId === server.id}
              compact={compact}
              index={i}
              onSelect={onSelect}
              onRemove={onRemove}
              onToggleFavorite={onToggleFavorite}
              onApplyManifest={onApplyManifest}
              t={t}
            />
          ))}
        </AnimatePresence>
      </div>

      {compact && servers.length > 5 && (
        <button onClick={onSeeAll} style={{ background: 'none', color: accent, fontSize: '12px', fontWeight: '700', padding: '4px 0', textAlign: 'left' }}>
          {t('srv.seeAll', { count: servers.length })}
        </button>
      )}
    </div>
  );
}

export default ServerListPanel;
