// HardSetups vitrini (sözleşme §4): hero, duyurular, kampanyalar, öne çıkanlar,
// kuponların (girişliyken), güncellemeler, "lisansın bitiyor", haberler + tüm ürünler
// kataloğu (§5 /products). Kurallar:
// - Boş gelen bölüm HİÇ gösterilmez; yer tutucu / örnek içerik yok
// - İçerik panelden gelir, launcher'a gömülü metin yok ("Nasıl çalışır" launcher'ın kendi akışını anlatır)
// - Veri en sık 5 dk'da bir ve pencere odaklanınca tazelenir (ana süreç denetler)
// - Vitrin azken sayfa gerçek veriyle dolar: katalog tek ürünse geniş kartla gösterilir
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  X, Copy, Check, ExternalLink, RefreshCw, Clock, Tag, Ticket, Megaphone, ChevronLeft, ChevronRight, AlertTriangle,
  ArrowRight, Star, Boxes, Newspaper, ShoppingBag, Library, Download, Globe,
} from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { Badges, Price, CoverArt, ProductShelf } from './ProductCard.jsx';
import Markdown from './Markdown.jsx';
import { InstanceIcon } from './ui.jsx';
import { imgSrc, portalErrorText } from '../utils/portal.js';
import { relativeTime } from '../utils/format.js';
import { formatMinor } from '../utils/money.js';

const HERO_INTERVAL_MS = 8000;

function Section({ title, icon, count, action, className = '', children }) {
  return (
    <section className={`feed-section ${className}`}>
      <header className="feed-head">
        <h2 className="feed-title">
          {icon}{title}
          {count > 0 && <span className="feed-count">{count}</span>}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Hero({ items, imageHosts, products, onAction }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = items.length;
  // Kendiliğinden döner; üzerine gelince / odaklanınca ya da azaltılmış harekette durur
  useEffect(() => {
    if (n < 2 || paused || reduce) return undefined;
    const id = setTimeout(() => setI((v) => (v + 1) % n), HERO_INTERVAL_MS);
    return () => clearTimeout(id);
  }, [i, n, paused, reduce]);

  const item = items[i % n];
  const img = imgSrc(item.imageUrl, imageHosts);
  const product = item.action?.type === 'product' ? products.get(item.action.slug) : null;
  return (
    <div className="hero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.button key={item.id} type="button" className={`hero-card${item.action ? '' : ' is-static'}`} onClick={() => item.action && onAction(item.action)} aria-disabled={!item.action}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.22 }}>
          {img ? <img className="hero-img" src={img} alt="" draggable={false} onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : <span className="hero-pattern" />}
          <span className="hero-shade" />
          <span className="hero-text">
            {product?.badges?.length > 0 && <Badges badges={product.badges} />}
            <b className="hero-title">{item.title}</b>
            {item.subtitle && <span className="hero-sub">{item.subtitle}</span>}
            {item.action && (
              <span className="hero-cta">
                <span className="hero-go btn-primary">
                  {item.action.type === 'url' ? <>{t('hub.hero.open')} <ExternalLink size={14} /></> : <>{t('hub.hero.view')} <ArrowRight size={15} /></>}
                </span>
                {product && (product.owned
                  ? <span className="hero-owned"><Check size={14} /> {t('hs.owned')}</span>
                  : <Price minor={product.priceFromMinor} compareAt={product.compareAtMinor} currency={product.currency} from />)}
              </span>
            )}
          </span>
        </motion.button>
      </AnimatePresence>
      {n > 1 && (
        <div className="hero-nav">
          <button type="button" className="icon-btn" onClick={() => setI((v) => (v - 1 + n) % n)} aria-label={t('hub.hero.prev')}><ChevronLeft size={16} /></button>
          {items.map((h, j) => (
            <button key={h.id} type="button" className={`hero-dot${j === i % n ? ' is-active' : ''}`} onClick={() => setI(j)} aria-label={t('hub.hero.goto', { n: j + 1 })} aria-current={j === i % n} />
          ))}
          <button type="button" className="icon-btn" onClick={() => setI((v) => (v + 1) % n)} aria-label={t('hub.hero.next')}><ChevronRight size={16} /></button>
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
    <button type="button" className={`coupon${copied ? ' is-copied' : ''}`} onClick={copy} title={t('hs.coupon.copy')}>
      <Tag size={13} /> <code>{code}</code> {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

/** Launcher'ın kendi akışı (satın al → kütüphane → kur). Vitrin azken yol gösterir. */
function HowItWorks() {
  const { t } = useI18n();
  const steps = [
    { icon: <ShoppingBag size={18} />, title: t('hub.how.1.title'), text: t('hub.how.1.text') },
    { icon: <Library size={18} />, title: t('hub.how.2.title'), text: t('hub.how.2.text') },
    { icon: <Download size={18} />, title: t('hub.how.3.title'), text: t('hub.how.3.text') },
  ];
  return (
    <Section title={t('hub.how.title')} className="hub-how-section">
      <ol className="hub-how">
        {steps.map((s, i) => (
          <li key={i} className="hub-how-step">
            <span className="hub-how-icon">{s.icon}</span>
            <span className="hub-how-num">{i + 1}</span>
            <b>{s.title}</b>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function FeedSkeleton() {
  return (
    <div className="feed hub-feed" aria-busy="true">
      <div className="hero is-skeleton" />
      <div className="feed-section">
        <span className="hub-skel-title" />
        <div className="pgrid">{[0, 1, 2].map((i) => <div key={i} className="pcard is-skeleton" />)}</div>
      </div>
    </div>
  );
}

export default function StoreFeed({ portal, onOpenProduct, onOpenLibrary }) {
  const { t, lang } = useI18n();
  const api = window.electronAPI;
  const [feed, setFeed] = useState(null);
  const [catalog, setCatalog] = useState(null); // null: yükleniyor / alınamadı
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await api.portalProducts();
      setCatalog(res.ok ? res.products : (c) => c || []);
    } catch { setCatalog((c) => c || []); }
  }, [api]);

  const load = useCallback(async (reason = 'open') => {
    setLoading(true);
    try {
      const res = await api.portalHome(reason);
      if (res.ok) { setFeed(res.home); setError(null); } else setError(res.error);
    } catch (err) { setError({ message: String(err?.message || err) }); } finally { setLoading(false); }
  }, [api]);

  const signedIn = !!portal?.signedIn;
  // Sahiplik (owned) girişe bağlı: hesap değişince katalog da tazelenir
  useEffect(() => { load('open'); loadCatalog(); }, [load, loadCatalog, signedIn]);
  useEffect(() => {
    const onFocus = () => load('focus');
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const retry = () => { load('refresh'); loadCatalog(); };
  const openAction = (action) => {
    if (action?.type === 'product') onOpenProduct(action.slug);
    else if (action?.type === 'url') api.portalOpenUrl(action.url);
  };
  const dismiss = async (id) => {
    setFeed((f) => ({ ...f, announcements: f.announcements.filter((a) => a.id !== id) }));
    await api.portalDismissAnnouncement(id);
  };

  const hosts = portal?.imageHosts;
  const products = catalog || [];

  if (!feed && !error) return <FeedSkeleton />;

  if (!feed) {
    return (
      <div className="feed hub-feed">
        <div className="feed-error">
          <AlertTriangle size={18} />
          <p style={{ whiteSpace: 'pre-wrap' }}>{portalErrorText(t, error)}</p>
          <button className="btn-secondary" onClick={retry} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : undefined} /> {t('hs.retry.load')}</button>
        </div>
        {products.length > 0 && (
          <Section title={t('hub.catalog')} icon={<Boxes size={16} />} count={products.length}>
            <ProductShelf products={products} imageHosts={hosts} onOpen={onOpenProduct} />
          </Section>
        )}
      </div>
    );
  }

  // updates/expiring/kampanyalar yalnızca ürün kodu taşır; ad ve ikon katalogdan / vitrinden
  const bySlug = new Map([...products, ...feed.featured].map((p) => [p.slug, p]));
  const nameOf = (slug) => bySlug.get(slug)?.name || slug;
  const iconOf = (slug) => ({ id: slug, iconUrl: imgSrc(bySlug.get(slug)?.iconUrl, hosts) });
  // Katalog: öne çıkanlar boşsa "Tüm ürünler"; doluysa yalnızca orada olmayanlar ("Diğer ürünler") — aynı kart iki kez görünmez
  const featuredSlugs = new Set(feed.featured.map((p) => p.slug));
  const catalogItems = feed.featured.length ? products.filter((p) => !featuredSlugs.has(p.slug)) : products;
  const showCatalog = catalogItems.length > 0;
  const coupons = feed.coupons || [];
  const feedEmpty = !feed.hero.length && !feed.announcements.length && !feed.featured.length && !feed.campaigns.length && !coupons.length && !feed.news.length && !feed.updates.length && !feed.expiring.length;
  const nothing = feedEmpty && catalog !== null && !products.length;
  // Vitrin azken (hero, haber, kampanya yok) launcher'ın akışı anlatılır: sayfa yol gösterir
  const sparse = !feed.hero.length && !feed.news.length && !feed.campaigns.length && catalog !== null;

  return (
    <div className="feed hub-feed">
      {feed.announcements.map((a) => (
        <div key={a.id} className={`banner ann is-${a.variant.toLowerCase()}`} role="status">
          <Megaphone size={16} />
          <span className="ann-text">{a.text}</span>
          {a.link && <button className="btn-secondary btn-xs" onClick={() => api.portalOpenUrl(a.link.url)}>{a.link.label || t('hs.more')} <ExternalLink size={12} /></button>}
          {a.dismissible && <button className="icon-btn" onClick={() => dismiss(a.id)} aria-label={t('common.close')}><X size={14} /></button>}
        </div>
      ))}

      {feed.hero.length > 0 && <Hero items={feed.hero} imageHosts={hosts} products={bySlug} onAction={openAction} />}

      {(feed.expiring.length > 0 || feed.updates.length > 0) && (
        <div className="feed-duo">
          {feed.expiring.length > 0 && (
            <Section title={t('hs.feed.expiring')} icon={<Clock size={16} />} count={feed.expiring.length}>
              <div className="feed-rows">
                {feed.expiring.map((e) => (
                  <div key={e.licenseId || e.product} className="feed-row is-warn">
                    <InstanceIcon instance={iconOf(e.product)} size={36} />
                    <span className="feed-row-text">
                      <b className="ellipsis">{nameOf(e.product)}</b>
                      <span>{t('hs.feed.expiresAt', { when: relativeTime(Date.parse(e.expiresAt), lang) })}</span>
                    </span>
                    {e.renewUrl && <button className="btn-secondary btn-xs" onClick={() => api.portalOpenUrl(e.renewUrl)}>{t('hs.renew')} <ExternalLink size={12} /></button>}
                  </div>
                ))}
              </div>
            </Section>
          )}
          {feed.updates.length > 0 && (
            <Section title={t('hs.feed.updates')} icon={<RefreshCw size={16} />} count={feed.updates.length}>
              <div className="feed-rows">
                {feed.updates.map((u) => (
                  <details key={`${u.product}-${u.version}`} className="feed-row feed-update">
                    <summary>
                      <InstanceIcon instance={iconOf(u.product)} size={36} />
                      <span className="feed-row-text">
                        <b className="ellipsis">{nameOf(u.product)}</b>
                        <span>{t('hub.update.line', { v: u.version })}{u.publishedAt ? ` · ${relativeTime(Date.parse(u.publishedAt), lang)}` : ''}</span>
                      </span>
                      <button className="btn-secondary btn-xs" onClick={(e) => { e.preventDefault(); onOpenLibrary(); }}>{t('hs.update')}</button>
                    </summary>
                    {u.changelog && <Markdown source={u.changelog} onLink={(url) => api.portalOpenUrl(url)} />}
                  </details>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {(feed.campaigns.length > 0 || coupons.length > 0) && (
        <div className="feed-duo">
          {feed.campaigns.length > 0 && (
            <Section title={t('hs.feed.campaigns')} icon={<Tag size={16} />}>
              <div className="camp-grid">
                {feed.campaigns.map((c) => (
                  <div key={c.id} className="camp">
                    <b className="camp-title">{c.title}</b>
                    {c.description && <span className="camp-desc">{c.description}</span>}
                    {c.products.length > 0 && (
                      <span className="camp-products">
                        {c.products.map((s) => (
                          <button key={s} type="button" className="camp-product" onClick={() => onOpenProduct(s)}>
                            <InstanceIcon instance={iconOf(s)} size={20} /> <span className="ellipsis">{nameOf(s)}</span> <ArrowRight size={13} />
                          </button>
                        ))}
                      </span>
                    )}
                    <span className="camp-foot">
                      {c.couponCode && <CouponChip code={c.couponCode} />}
                      {c.endsAt && <span className="camp-ends"><Clock size={12} /> {t('hs.feed.endsIn', { when: relativeTime(Date.parse(c.endsAt), lang) })}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
          {coupons.length > 0 && (
            <Section title={t('hs.feed.coupons')} icon={<Ticket size={16} />} count={coupons.length}>
              <div className="camp-grid">
                {coupons.map((c) => (
                  <div key={c.code} className="camp is-coupon">
                    <span className="coupon-value" aria-label={c.type === 'PERCENT' ? t('hs.coupon.percent', { value: c.value }) : t('hs.coupon.fixed', { amount: formatMinor(c.value, 'TRY', lang) })}>
                      <b>{c.type === 'PERCENT' ? t('hub.coupon.pct', { value: c.value }) : formatMinor(c.value, 'TRY', lang)}</b>
                      <small>{t('hub.coupon.off')}</small>
                    </span>
                    <span className="coupon-body">
                      <span className="camp-desc">{c.description || t('hub.coupon.generic')}</span>
                      <span className="camp-foot">
                        <CouponChip code={c.code} />
                        {c.endsAt && <span className="camp-ends"><Clock size={12} /> {t('hs.feed.endsIn', { when: relativeTime(Date.parse(c.endsAt), lang) })}</span>}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {feed.featured.length > 0 && (
        <Section title={t('hs.feed.featured')} icon={<Star size={16} />}>
          <ProductShelf products={feed.featured} imageHosts={hosts} onOpen={onOpenProduct} />
        </Section>
      )}

      {showCatalog && (
        <Section title={feed.featured.length ? t('hub.catalogMore') : t('hub.catalog')} icon={<Boxes size={16} />} count={catalogItems.length}>
          <ProductShelf products={catalogItems} imageHosts={hosts} onOpen={onOpenProduct} />
        </Section>
      )}
      {catalog === null && !feed.featured.length && (
        <div className="feed-section" aria-busy="true">
          <span className="hub-skel-title" />
          <div className="pgrid">{[0, 1, 2].map((i) => <div key={i} className="pcard is-skeleton" />)}</div>
        </div>
      )}

      {feed.news.length > 0 && (
        <Section title={t('hs.feed.news')} icon={<Newspaper size={16} />}>
          <div className="feed-news">
            {feed.news.map((n) => (
              <button key={n.id} type="button" className="news-card" onClick={() => n.url && api.portalOpenUrl(n.url)} disabled={!n.url}>
                <CoverArt src={imgSrc(n.imageUrl, hosts)} seed={n.id} iconSize={40} className="news-card-img" />
                <span className="news-card-text">
                  <b>{n.title}</b>
                  {n.excerpt && <span>{n.excerpt}</span>}
                  <small>
                    {n.publishedAt && relativeTime(Date.parse(n.publishedAt), lang)}
                    {n.url && <ExternalLink size={12} />}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {nothing && (
        <div className="hub-empty">
          <span className="hub-mark is-lg" aria-hidden="true">HS</span>
          <b className="hub-empty-title">{t('hub.empty.title')}</b>
          <p className="hub-empty-text">{t('hub.empty.text')}</p>
          <span className="hub-empty-actions">
            <button type="button" className="btn-secondary" onClick={onOpenLibrary}><Library size={15} /> {t('hs.tab.library')}</button>
            {portal?.configLoaded && <button type="button" className="btn-ghost" onClick={() => api.portalOpenLink('site')}><Globe size={15} /> {t('hub.link.site')} <ExternalLink size={12} /></button>}
          </span>
        </div>
      )}
      {sparse && <HowItWorks />}
      {error && <p className="feed-stale">{t('hs.feed.stale')}</p>}
    </div>
  );
}
