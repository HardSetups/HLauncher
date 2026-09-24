// HardSetups vitrini (sözleşme §4): hero, duyurular, kampanyalar, öne çıkanlar,
// güncellemeler, "lisansın bitiyor", haberler. Kurallar:
// - Boş gelen bölüm HİÇ gösterilmez; yer tutucu / örnek içerik yok
// - İçerik panelden gelir, launcher'a gömülü metin yok
// - Veri en sık 5 dk'da bir ve pencere odaklanınca tazelenir (ana süreç denetler)
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, ExternalLink, RefreshCw, Clock, Tag, Megaphone, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import ProductCard from './ProductCard.jsx';
import Markdown from './Markdown.jsx';
import { imgSrc, portalErrorText } from '../utils/portal.js';
import { relativeTime } from '../utils/format.js';

function Section({ title, icon, children }) {
  return (
    <section className="feed-section">
      <h2 className="feed-title">{icon}{title}</h2>
      {children}
    </section>
  );
}

function Hero({ items, imageHosts, onAction }) {
  const [i, setI] = useState(0);
  const item = items[i % items.length];
  const img = imgSrc(item.imageUrl, imageHosts);
  return (
    <div className="hero">
      <AnimatePresence mode="wait" initial={false}>
        <motion.button key={item.id} type="button" className="hero-card" onClick={() => onAction(item.action)}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {img && <img className="hero-img" src={img} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
          <span className="hero-shade" />
          <span className="hero-text">
            <b className="hero-title">{item.title}</b>
            {item.subtitle && <span className="hero-sub">{item.subtitle}</span>}
          </span>
        </motion.button>
      </AnimatePresence>
      {items.length > 1 && (
        <div className="hero-nav">
          <button className="icon-btn" onClick={() => setI((v) => (v - 1 + items.length) % items.length)} aria-label="‹"><ChevronLeft size={16} /></button>
          {items.map((h, j) => <span key={h.id} className={`hero-dot${j === i % items.length ? ' is-active' : ''}`} />)}
          <button className="icon-btn" onClick={() => setI((v) => (v + 1) % items.length)} aria-label="›"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}

function CouponChip({ code }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  return (
    <button type="button" className="coupon" onClick={copy} title={t('hs.coupon.copy')}>
      <Tag size={13} /> <code>{code}</code> {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

export default function StoreFeed({ portal, onOpenProduct, onOpenLibrary }) {
  const { t, lang } = useI18n();
  const api = window.electronAPI;
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (reason = 'open') => {
    setLoading(true);
    try {
      const res = await api.portalHome(reason);
      if (res.ok) { setFeed(res.home); setError(null); } else setError(res.error);
    } catch (err) { setError({ message: String(err?.message || err) }); } finally { setLoading(false); }
  }, [api]);

  const signedIn = !!portal?.signedIn;
  useEffect(() => { load('open'); }, [load, signedIn]);
  useEffect(() => {
    const onFocus = () => load('focus');
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const openAction = (action) => {
    if (action?.type === 'product') onOpenProduct(action.slug);
    else if (action?.type === 'url') api.portalOpenUrl(action.url);
  };
  const dismiss = async (id) => {
    setFeed((f) => ({ ...f, announcements: f.announcements.filter((a) => a.id !== id) }));
    await api.portalDismissAnnouncement(id);
  };

  if (error && !feed) {
    return (
      <div className="feed-error">
        <AlertTriangle size={18} />
        <p style={{ whiteSpace: 'pre-wrap' }}>{portalErrorText(t, error)}</p>
        <button className="btn-secondary" onClick={() => load('refresh')} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : undefined} /> {t('hs.retry.load')}</button>
      </div>
    );
  }
  if (!feed) {
    return (
      <div className="feed" aria-busy="true">
        <div className="hero is-skeleton" />
        <div className="pgrid">{[0, 1, 2].map((i) => <div key={i} className="pcard is-skeleton" />)}</div>
      </div>
    );
  }

  const hosts = portal?.imageHosts;
  // updates/expiring yalnızca ürün kodu taşır; vitrinde adı biliniyorsa o gösterilir
  const nameOf = (slug) => feed.featured.find((p) => p.slug === slug)?.name || slug;
  const nothing = !feed.hero.length && !feed.announcements.length && !feed.featured.length && !feed.campaigns.length && !feed.news.length && !feed.updates.length && !feed.expiring.length;
  return (
    <div className="feed">
      {feed.announcements.map((a) => (
        <div key={a.id} className={`banner ann is-${a.variant.toLowerCase()}`} role="status">
          <Megaphone size={16} />
          <span className="ann-text">{a.text}</span>
          {a.link && <button className="btn-secondary btn-xs" onClick={() => api.portalOpenUrl(a.link.url)}>{a.link.label || t('hs.more')} <ExternalLink size={12} /></button>}
          {a.dismissible && <button className="icon-btn" onClick={() => dismiss(a.id)} aria-label={t('common.close')}><X size={14} /></button>}
        </div>
      ))}

      {feed.hero.length > 0 && <Hero items={feed.hero} imageHosts={hosts} onAction={openAction} />}

      {feed.expiring.length > 0 && (
        <Section title={t('hs.feed.expiring')} icon={<Clock size={16} />}>
          <div className="feed-rows">
            {feed.expiring.map((e) => (
              <div key={e.licenseId || e.product} className="feed-row is-warn">
                <span><b>{nameOf(e.product)}</b> — {t('hs.feed.expiresAt', { when: relativeTime(Date.parse(e.expiresAt), lang) })}</span>
                {e.renewUrl && <button className="btn-primary btn-xs" onClick={() => api.portalOpenUrl(e.renewUrl)}>{t('hs.renew')}</button>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {feed.updates.length > 0 && (
        <Section title={t('hs.feed.updates')} icon={<RefreshCw size={16} />}>
          <div className="feed-rows">
            {feed.updates.map((u) => (
              <details key={`${u.product}-${u.version}`} className="feed-row feed-update">
                <summary>
                  <span><b>{nameOf(u.product)}</b> {u.version}</span>
                  <button className="btn-secondary btn-xs" onClick={(e) => { e.preventDefault(); onOpenLibrary(); }}>{t('hs.update')}</button>
                </summary>
                {u.changelog && <Markdown source={u.changelog} onLink={(url) => api.portalOpenUrl(url)} />}
              </details>
            ))}
          </div>
        </Section>
      )}

      {feed.campaigns.length > 0 && (
        <Section title={t('hs.feed.campaigns')} icon={<Tag size={16} />}>
          <div className="camp-grid">
            {feed.campaigns.map((c) => (
              <div key={c.id} className="camp">
                <b className="camp-title">{c.title}</b>
                {c.description && <span className="camp-desc">{c.description}</span>}
                <span className="camp-foot">
                  {c.couponCode && <CouponChip code={c.couponCode} />}
                  {c.endsAt && <span className="camp-ends"><Clock size={12} /> {t('hs.feed.endsIn', { when: relativeTime(Date.parse(c.endsAt), lang) })}</span>}
                </span>
                {c.products.length > 0 && (
                  <span className="camp-products">
                    {c.products.map((s) => <button key={s} className="link-btn" onClick={() => onOpenProduct(s)}>{nameOf(s)}</button>)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {feed.featured.length > 0 && (
        <Section title={t('hs.feed.featured')}>
          <div className="pgrid">
            {feed.featured.map((p) => <ProductCard key={p.slug} product={p} imageHosts={hosts} onOpen={() => onOpenProduct(p.slug)} />)}
          </div>
        </Section>
      )}

      {feed.news.length > 0 && (
        <Section title={t('hs.feed.news')}>
          <div className="feed-news">
            {feed.news.map((n) => {
              const img = imgSrc(n.imageUrl, hosts);
              return (
                <button key={n.id} type="button" className="news-card" onClick={() => n.url && api.portalOpenUrl(n.url)} disabled={!n.url}>
                  {img && <img src={img} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                  <span className="news-card-text">
                    <b>{n.title}</b>
                    {n.excerpt && <span>{n.excerpt}</span>}
                    {n.publishedAt && <small>{relativeTime(Date.parse(n.publishedAt), lang)}</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {nothing && <p className="feed-nothing">{t('hs.feed.nothing')}</p>}
      {error && <p className="feed-stale">{t('hs.feed.stale')}</p>}
    </div>
  );
}
