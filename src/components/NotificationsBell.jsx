// Bildirim zili (sözleşme §9): okunmamış sayısı, açılınca liste, "tümünü okundu yap".
// Bildirimdeki bağlantı tarayıcıda (izin listesiyle) açılır ve bildirim okundu sayılır.
import { useState, useEffect } from 'react';
import { Bell, CheckCheck, Loader2, ExternalLink } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { Menu } from './ui.jsx';
import { relativeTime } from '../utils/format.js';

function List({ onError }) {
  const { t, lang } = useI18n();
  const api = window.electronAPI;
  const [state, setState] = useState({ loading: true, items: [], nextCursor: null });
  const [more, setMore] = useState(false);

  // Menü her açıldığında taze liste (bileşen menüyle birlikte bağlanır)
  useEffect(() => {
    let cancelled = false;
    api.portalNotifications().then((res) => {
      if (cancelled) return;
      if (res.ok) setState({ loading: false, items: res.items, nextCursor: res.nextCursor });
      else { setState({ loading: false, items: [], nextCursor: null }); onError?.(res.error?.message); }
    }).catch(() => { if (!cancelled) setState({ loading: false, items: [], nextCursor: null }); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sayfa başına 20 (v1.6); nextCursor null ise son sayfa
  const loadMore = async () => {
    setMore(true);
    try {
      const res = await api.portalNotifications(state.nextCursor);
      if (res.ok) setState((s) => ({ ...s, items: [...s.items, ...res.items], nextCursor: res.nextCursor }));
    } finally { setMore(false); }
  };

  const open = async (n) => {
    if (!n.readAt) {
      setState((s) => ({ ...s, items: s.items.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) }));
      api.portalNotificationsRead({ ids: [n.id] });
    }
    if (n.url) api.portalOpenUrl(n.url);
  };
  const readAll = async () => {
    setState((s) => ({ ...s, items: s.items.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })) }));
    await api.portalNotificationsRead({ all: true });
  };

  return (
    <div className="notif">
      <div className="notif-head">
        <b>{t('hs.notif.title')}</b>
        <button className="link-btn" onClick={readAll} disabled={!state.items.some((n) => !n.readAt)}><CheckCheck size={13} /> {t('hs.notif.readAll')}</button>
      </div>
      {state.loading ? (
        <div className="notif-empty"><Loader2 size={16} className="spin" /></div>
      ) : state.items.length === 0 ? (
        <div className="notif-empty">{t('hs.notif.empty')}</div>
      ) : (
        <ul className="notif-list">
          {state.items.map((n) => (
            <li key={n.id}>
              <button className={`notif-item${n.readAt ? '' : ' is-unread'}`} onClick={() => open(n)}>
                <span className="notif-title">{n.title}{n.url && <ExternalLink size={12} />}</span>
                {n.body && <span className="notif-body">{n.body}</span>}
                {n.createdAt && <span className="notif-time">{relativeTime(Date.parse(n.createdAt), lang)}</span>}
              </button>
            </li>
          ))}
          {state.nextCursor && (
            <li className="notif-more">
              <button className="link-btn" onClick={loadMore} disabled={more}>{more ? <Loader2 size={13} className="spin" /> : null} {t('hs.notif.more')}</button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function NotificationsBell({ unread = 0, onError }) {
  const { t } = useI18n();
  return (
    <Menu
      align="end"
      width={340}
      trigger={({ toggle, open }) => (
        <button className="icon-btn icon-btn-framed bell" onClick={toggle} aria-expanded={open} aria-label={t('hs.notif.title')} title={t('hs.notif.title')}>
          <Bell size={16} />
          {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}
    >
      {() => <List onError={onError} />}
    </Menu>
  );
}
