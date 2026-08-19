// Ana ekran sağ sütunundaki haber kartı: launcher haberleri (news.json) +
// aktif sunucu profilinin duyuruları birlikte listelenir.
import { Newspaper, Megaphone, ExternalLink } from 'lucide-react';
import { useI18n } from '../i18n.jsx';

function NewsPanel({ accent, news, serverAnnouncements, serverName }) {
  const { t } = useI18n();

  const items = [
    ...(serverAnnouncements || []).map((a) => ({ ...a, server: true })),
    ...(news || []).map((n) => ({ ...n, server: false })),
  ];

  if (!items.length) return null;

  return (
    <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
      <h3 style={{ fontSize: '13px', fontWeight: '900', color: 'rgba(255,255,255,0.4)', letterSpacing: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Newspaper size={13} /> {t('news.title')}
      </h3>
      <div style={{ overflowY: 'auto', maxHeight: '190px', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '2px' }}>
        {items.map((item, i) => (
          <div
            key={i}
            onClick={item.url ? () => window.open(item.url, '_blank') : undefined}
            style={{
              borderLeft: `2px solid ${item.server ? '#f59e0b' : accent}`,
              paddingLeft: '10px',
              cursor: item.url ? 'pointer' : 'default',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
              {item.server && <Megaphone size={11} color="#f59e0b" />}
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', fontWeight: '700' }}>
                {item.server ? (serverName || t('news.server')) : (item.date || '')}
                {item.server && item.date ? ` · ${item.date}` : ''}
              </span>
            </div>
            {item.title && (
              <p style={{ fontSize: '13px', fontWeight: '700', lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: '5px' }}>
                {item.title}
                {item.url && <ExternalLink size={11} color="rgba(255,255,255,0.4)" />}
              </p>
            )}
            {item.text && (
              <p style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, marginTop: '2px' }}>
                {item.text}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default NewsPanel;
