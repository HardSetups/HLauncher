import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Plus, Trash2, Users } from 'lucide-react';
import { contrastText } from '../utils/color';

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

function ServerCard({ accent, server, status, selected, compact, index, onSelect, onRemove }) {
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
        borderRadius: '20px',
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
          : <span style={{ fontSize: compact ? '16px' : '20px' }}>🖥️</span>}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h4 style={{ fontSize: compact ? '15px' : '17px', fontWeight: '800', color: selected ? accent : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {server.name || server.address}
          </h4>
          {statusDot(status)}
        </div>
        <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {server.address}
        </p>
        {!compact && (
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginTop: '6px', minHeight: '16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {status?.state === 'online' ? (status.motd || '—') : status?.state === 'loading' ? 'Kontrol ediliyor...' : 'Sunucu çevrimdışı'}
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
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(server.id); }}
          title="Sunucuyu kaldır"
          style={{ background: 'none', color: 'rgba(255,255,255,0.3)', padding: '8px', flexShrink: 0 }}
        >
          <Trash2 size={16} />
        </button>
      )}
    </motion.div>
  );
}

function ServerListPanel({ accent, variant = 'compact', servers, statuses, selectedServerId, onSelect, onAdd, onRemove, onSeeAll }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const compact = variant === 'compact';
  const visibleServers = compact ? servers.slice(0, 5) : servers;

  const handleAdd = () => {
    if (!address.trim()) return;
    onAdd(name.trim(), address.trim());
    setName('');
    setAddress('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '12px' : '16px', height: compact ? 'auto' : '100%' }}>
      {!compact && (
        <div>
          <h2 style={{ fontSize: '40px', fontWeight: '800', marginBottom: '8px' }}>SUNUCULAR</h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '24px' }}>Sunucularını ekle, canlı durumunu takip et ve bağlanacağın sunucuyu seç.</p>
        </div>
      )}

      {!compact && (
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', gap: '10px' }}>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Sunucu adı (opsiyonel)" className="prof-input" style={{ marginTop: 0, flex: '0 0 200px' }}
          />
          <input
            type="text" value={address} onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Sunucu adresi (örn. mc.example.com:25565)" className="prof-input" style={{ marginTop: 0, flex: 1 }}
          />
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleAdd}
            style={{ background: accent, color: contrastText(accent), border: 'none', borderRadius: '12px', padding: '0 20px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <Plus size={18} /> Ekle
          </motion.button>
        </div>
      )}

      {compact && (
        <h3 style={{ fontSize: '14px', fontWeight: '900', color: 'rgba(255,255,255,0.4)', letterSpacing: '2px' }}>SUNUCULAR</h3>
      )}

      <div style={{ display: compact ? 'flex' : 'grid', flexDirection: compact ? 'column' : undefined, gridTemplateColumns: compact ? undefined : 'repeat(auto-fill, minmax(320px, 1fr))', gap: compact ? '10px' : '16px', overflowY: 'auto' }}>
        {visibleServers.length === 0 && (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', padding: compact ? '4px 0' : '20px 0' }}>
            {compact ? 'Henüz sunucu eklenmedi.' : 'Henüz sunucu eklemediniz. Yukarıdan bir adres girip ekleyin.'}
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
            />
          ))}
        </AnimatePresence>
      </div>

      {compact && servers.length > 5 && (
        <button onClick={onSeeAll} style={{ background: 'none', color: accent, fontSize: '12px', fontWeight: '700', padding: '4px 0', textAlign: 'left' }}>
          Tümünü gör ({servers.length}) →
        </button>
      )}
    </div>
  );
}

export default ServerListPanel;
