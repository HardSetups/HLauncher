// Ürün sayfası (sözleşme §5) + bakiye ile satın alma (§8).
// Açıklama güvenli markdown; video launcher'da oynamaz, tarayıcıda açılır.
// Satın alma: plan → teklif → onay (toplam + ödemeden sonraki bakiye) → sipariş.
// Kart / ödeme bilgisi launcher'a HİÇ girmez; bakiye yükleme tarayıcıda.
import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Star, Play, Check, Loader2, ShoppingCart, ExternalLink, Wallet, Cpu, MemoryStick, Gamepad2, AlertTriangle, RefreshCw, Download } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import Modal from './Modal.jsx';
import Markdown from './Markdown.jsx';
import { Badges, Price } from './ProductCard.jsx';
import { InstanceIcon } from './ui.jsx';
import { imgSrc, portalErrorText } from '../utils/portal.js';
import { formatMinor, subtractMinor } from '../utils/money.js';

function Stars({ value }) {
  return (
    <span className="stars" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={13} className={i <= Math.round(value) ? 'is-on' : ''} />)}
    </span>
  );
}

function Gallery({ items, imageHosts }) {
  const { t } = useI18n();
  const api = window.electronAPI;
  const [sel, setSel] = useState(0);
  const cur = items[sel];
  const main = imgSrc(cur.type === 'video' ? cur.thumbUrl : cur.url, imageHosts);
  return (
    <div className="gallery">
      <button type="button" className="gallery-main" onClick={() => cur.type === 'video' && api.portalOpenUrl(cur.url)} disabled={cur.type !== 'video'}>
        {main && <img src={main} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />}
        {cur.type === 'video' && <span className="gallery-play"><Play size={22} /> {t('hs.watchVideo')}</span>}
      </button>
      {items.length > 1 && (
        <div className="gallery-strip">
          {items.map((g, i) => {
            const th = imgSrc(g.thumbUrl || g.url, imageHosts);
            return (
              <button key={i} type="button" className={`gallery-thumb${i === sel ? ' is-active' : ''}`} onClick={() => setSel(i)}>
                {th && <img src={th} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />}
                {g.type === 'video' && <Play size={14} className="gallery-thumb-play" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PurchaseModal({ open, product, plan, onClose, onInstall }) {
  const { t, lang } = useI18n();
  const api = window.electronAPI;
  const [step, setStep] = useState('form'); // form | confirm | done
  const [coupon, setCoupon] = useState('');
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { text, url?, urlLabel? }
  const [order, setOrder] = useState(null);
  const [accepted, setAccepted] = useState(new Set()); // v1.6: belge onayları, işaretsiz başlar

  useEffect(() => { if (open) { setStep('form'); setQuote(null); setError(null); setOrder(null); setAccepted(new Set()); } }, [open, plan?.slug]);

  const fmt = (m) => formatMinor(m, product.currency || 'TRY', lang);
  // Hata kodu → metin + (varsa) tarayıcıda açılacak adres (sözleşme v1.6 §8)
  const describe = (e) => {
    const d = e?.details || {};
    switch (e?.code) {
      case 'INSUFFICIENT_BALANCE': return { text: t('hs.buy.insufficient', { amount: fmt(d.shortfallMinor) }), url: d.topupUrl, urlLabel: t('hs.buy.topup') };
      case 'EMAIL_NOT_VERIFIED': return { text: t('hs.buy.emailNotVerified'), kind: 'account', urlLabel: t('hs.myAccount') };
      case 'CONFLICT': return d.reason === 'billingProfileRequired'
        ? { text: t('hs.buy.billingRequired'), url: d.manageUrl, urlLabel: t('hs.buy.billingManage') }
        : { text: portalErrorText(t, e) };
      case 'CONSENT_REQUIRED': return { text: t('hs.buy.consentRequired') };
      case 'COUPON_INVALID': return { text: t('hs.buy.couponInvalid') };
      case 'PURCHASE_DISABLED': return { text: t('hs.buy.disabled') };
      default: return { text: portalErrorText(t, e) };
    }
  };
  const getQuote = async (keepError = false) => {
    setBusy(true);
    if (!keepError) setError(null);
    try {
      const res = await api.portalQuote(product.slug, plan.slug, coupon.trim() || null);
      if (!res.ok) { setError(describe(res.error)); setStep('form'); return; }
      setQuote(res.quote);
      setAccepted(new Set());
      setStep('confirm');
    } finally { setBusy(false); }
  };
  const buy = async () => {
    setBusy(true); setError(null);
    try {
      const res = await api.portalPurchase(quote.quoteId, [...accepted]);
      if (res.ok) { setOrder(res); setStep('done'); return; }
      const e = res.error || {};
      // Teklif eskidi ya da fiyat değişti → yeni teklif al, kullanıcı yeni tutarı onaylasın
      if (e.code === 'QUOTE_EXPIRED' || e.code === 'PRICE_CHANGED') {
        setError({ text: e.code === 'PRICE_CHANGED' ? t('hs.buy.priceChanged') : t('hs.buy.quoteExpired') });
        setBusy(false);
        await getQuote(true);
        return;
      }
      if (e.code === 'COUPON_INVALID') { setError(describe(e)); setStep('form'); return; }
      setError(describe(e));
    } finally { setBusy(false); }
  };
  const openErrorLink = (err) => (err?.url ? api.portalOpenUrl(err.url) : err?.kind ? api.portalOpenLink(err.kind) : null);
  const topup = (url) => (url ? api.portalOpenUrl(url) : api.portalOpenLink('topup'));
  const consents = quote?.consents || [];
  const billingReady = quote?.billingProfile?.ready !== false;
  const allAccepted = consents.every((c) => accepted.has(c.key));

  if (!product || !plan) return null;
  const after = quote ? subtractMinor(quote.balanceMinor, quote.totalMinor) : null;
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      icon={step === 'done' ? <Check size={18} /> : <ShoppingCart size={18} />}
      tone={step === 'done' ? 'success' : 'default'}
      title={step === 'done' ? t('hs.buy.doneTitle') : t('hs.buy.title', { name: product.name })}
      footer={
        step === 'form' ? (
          <>
            <button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button className="btn-primary" onClick={() => getQuote()} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : null} {t('hs.buy.continue')}</button>
          </>
        ) : step === 'confirm' ? (
          <>
            <button className="btn-ghost" onClick={() => setStep('form')} disabled={busy}>{t('common.back')}</button>
            {quote && !quote.sufficient
              ? <button className="btn-primary" onClick={() => topup(quote.topupUrl)}><Wallet size={15} /> {t('hs.buy.topup')}</button>
              : !billingReady
                ? <button className="btn-primary" onClick={() => api.portalOpenUrl(quote.billingProfile.manageUrl)}><ExternalLink size={15} /> {t('hs.buy.billingManage')}</button>
                : <button className="btn-primary" onClick={buy} disabled={busy || !allAccepted}>{busy ? <Loader2 size={15} className="spin" /> : <ShoppingCart size={15} />} {t('hs.buy.confirm', { amount: fmt(quote?.totalMinor) })}</button>}
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={onClose}>{t('common.close')}</button>
            <button className="btn-primary" onClick={() => { onClose(); onInstall(product.slug); }} autoFocus><Download size={15} /> {t('hs.buy.installNow')}</button>
          </>
        )
      }
    >
      {step === 'form' && (
        <>
          <div className="buy-plan">
            <b>{plan.name}</b>
            <span>{plan.durationDays ? t('hs.plan.days', { n: plan.durationDays }) : t('hs.plan.lifetime')} · {t('hs.plan.devices', { n: plan.maxActivations ?? 1 })}</span>
            <Price minor={plan.priceMinor} compareAt={plan.compareAtMinor} currency={product.currency} />
          </div>
          <label className="field">
            <span>{t('hs.buy.coupon')}</span>
            <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder={t('hs.buy.couponPh')} maxLength={40} spellCheck={false} />
          </label>
          <p className="buy-note">{t('hs.buy.walletOnly')}</p>
        </>
      )}
      {step === 'confirm' && quote && (
        <table className="buy-sum">
          <tbody>
            <tr><td>{t('hs.buy.subtotal')}</td><td>{fmt(quote.subtotalMinor)}</td></tr>
            {quote.discountMinor && quote.discountMinor !== '0' && <tr className="is-discount"><td>{t('hs.buy.discount')}</td><td>−{fmt(quote.discountMinor)}</td></tr>}
            <tr className="is-total"><td>{t('hs.buy.total')}</td><td>{fmt(quote.totalMinor)}</td></tr>
            <tr><td>{t('hs.buy.balance')}</td><td>{fmt(quote.balanceMinor)}</td></tr>
            <tr className={quote.sufficient ? '' : 'is-short'}><td>{t('hs.buy.after')}</td><td>{quote.sufficient ? fmt(after) : '—'}</td></tr>
          </tbody>
        </table>
      )}
      {step === 'confirm' && quote && !quote.sufficient && (
        <p className="buy-warn"><AlertTriangle size={14} /> {t('hs.buy.insufficient', { amount: fmt(quote.shortfallMinor) })}</p>
      )}
      {step === 'confirm' && quote && quote.sufficient && !billingReady && (
        <p className="buy-warn"><AlertTriangle size={14} /> {t('hs.buy.billingRequired')}</p>
      )}
      {step === 'confirm' && quote && quote.sufficient && billingReady && consents.length > 0 && (
        <div className="buy-consents">
          {consents.map((c) => (
            <label key={c.key} className="check-row">
              <input type="checkbox" checked={accepted.has(c.key)} onChange={(e) => setAccepted((s) => { const n = new Set(s); if (e.target.checked) n.add(c.key); else n.delete(c.key); return n; })} />
              <span>
                {c.url ? <button type="button" className="md-link" onClick={(e) => { e.preventDefault(); api.portalOpenUrl(c.url); }}>{c.title}</button> : c.title}
                {' '}{t('hs.buy.consentSuffix')}
              </span>
            </label>
          ))}
        </div>
      )}
      {step === 'done' && order && (
        <p className="modal-text">{t('hs.buy.doneText', { order: order.orderNo || '' })}</p>
      )}
      {error && (
        <p className="buy-warn" style={{ whiteSpace: 'pre-wrap' }}>
          <AlertTriangle size={14} /> {error.text}
          {(error.url || error.kind) && <button className="link-btn" onClick={() => openErrorLink(error)}><ExternalLink size={13} /> {error.urlLabel}</button>}
        </p>
      )}
    </Modal>
  );
}

export default function ProductView({ slug, portal, onBack, onOpenLibrary, onInstall, onConnect, onLoaded = () => {} }) {
  const { t, lang } = useI18n();
  const api = window.electronAPI;
  const [product, setProduct] = useState(null);
  const [error, setError] = useState(null);
  const [planSlug, setPlanSlug] = useState(null);
  const [buying, setBuying] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await api.portalProduct(slug);
    if (res.ok) {
      setProduct(res.product);
      setPlanSlug((cur) => cur || res.product.plans?.[0]?.slug || null);
      onLoaded(res.product.name);
    } else setError(res.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, slug]);
  useEffect(() => { load(); }, [load, portal?.signedIn]);

  if (error) {
    return (
      <div className="page-scroll pview">
        <button className="link-btn back-link" onClick={onBack}><ArrowLeft size={14} /> {t('hs.tab.store')}</button>
        <div className="feed-error"><AlertTriangle size={18} /><p style={{ whiteSpace: 'pre-wrap' }}>{portalErrorText(t, error)}</p>
          <button className="btn-secondary" onClick={load}><RefreshCw size={15} /> {t('hs.retry.load')}</button></div>
      </div>
    );
  }
  if (!product) return <div className="page-scroll pview"><div className="pview-skeleton" /></div>;

  const hosts = portal?.imageHosts;
  const plans = product.plans || [];
  const plan = plans.find((p) => p.slug === planSlug) || plans[0];
  const purchaseOn = portal?.features?.purchase !== false;
  const req = product.requirements || {};
  const buyClick = () => {
    if (!purchaseOn) { if (product.storeUrl) api.portalOpenUrl(product.storeUrl); return; }
    if (!portal?.signedIn) { onConnect(); return; }
    setBuying(true);
  };

  return (
    <div className="page-scroll pview">
      <button className="link-btn back-link" onClick={onBack}><ArrowLeft size={14} /> {t('hs.tab.store')}</button>
      <header className="pview-head">
        <InstanceIcon instance={{ id: product.slug, iconUrl: imgSrc(product.iconUrl, hosts) }} size={72} />
        <div className="pview-title">
          <h1>{product.name}</h1>
          <span className="pview-meta">
            <Badges badges={product.badges} />
            {product.rating?.count > 0 && <><Stars value={product.rating.average} /> <span>{product.rating.average.toFixed(1)} ({product.rating.count})</span></>}
          </span>
          {product.shortDescription && <p className="pview-short">{product.shortDescription}</p>}
        </div>
        <div className="pview-cta">
          {product.owned ? (
            <button className="btn-secondary" onClick={onOpenLibrary}><Check size={15} /> {t('hs.inLibrary')}</button>
          ) : (
            <>
              <Price minor={plan?.priceMinor || product.priceFromMinor} compareAt={plan?.compareAtMinor || product.compareAtMinor} currency={product.currency} />
              <button className="btn-primary btn-lg" onClick={buyClick} disabled={purchaseOn && !plan}>
                {purchaseOn ? <><ShoppingCart size={16} /> {t('hs.buy')}</> : <><ExternalLink size={16} /> {t('hs.openStore')}</>}
              </button>
            </>
          )}
        </div>
      </header>

      {product.gallery?.length > 0 && <Gallery items={product.gallery} imageHosts={hosts} />}

      <div className="pview-grid">
        <div className="pview-main">
          {product.description && <Markdown source={product.description} onLink={(url) => api.portalOpenUrl(url)} className="pview-desc" />}
          {product.features?.length > 0 && (
            <section className="card pview-card">
              <h3>{t('hs.product.features')}</h3>
              <ul className="check-list">{product.features.map((f, i) => <li key={i}><Check size={14} /> {f}</li>)}</ul>
            </section>
          )}
          {product.reviews?.length > 0 && (
            <section className="card pview-card">
              <h3>{t('hs.product.reviews')}</h3>
              <ul className="reviews">
                {product.reviews.map((r, i) => (
                  <li key={i}>
                    <span className="review-head"><b>{r.author}</b> <Stars value={r.rating} /></span>
                    {r.title && <b className="review-title">{r.title}</b>}
                    {r.text && <p>{r.text}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="pview-side">
          {!product.owned && plans.length > 0 && (
            <section className="card pview-card">
              <h3>{t('hs.product.plans')}</h3>
              <div className="plan-list" role="radiogroup">
                {plans.map((p) => (
                  <button key={p.slug} role="radio" aria-checked={p.slug === plan?.slug} className={`choice${p.slug === plan?.slug ? ' is-selected' : ''}`} onClick={() => setPlanSlug(p.slug)}>
                    <span className="choice-dot" />
                    <span className="choice-text">
                      <b>{p.name}</b>
                      <span>{p.durationDays ? t('hs.plan.days', { n: p.durationDays }) : t('hs.plan.lifetime')} · {t('hs.plan.devices', { n: p.maxActivations ?? 1 })}</span>
                    </span>
                    <span className="plan-price">{formatMinor(p.priceMinor, product.currency, lang)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {(req.minecraft || req.loader || req.ramRecommendedMb) && (
            <section className="card pview-card">
              <h3>{t('hs.product.requirements')}</h3>
              <ul className="req-list">
                {req.minecraft && <li><Gamepad2 size={14} /> Minecraft {req.minecraft}</li>}
                {req.loader && <li><Cpu size={14} /> {req.loader === 'fabric' ? 'Fabric' : req.loader}</li>}
                {req.ramRecommendedMb && <li><MemoryStick size={14} /> {t('hs.product.ram', { min: Math.round((req.ramMinMb || req.ramRecommendedMb) / 1024), rec: Math.round(req.ramRecommendedMb / 1024) })}</li>}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <PurchaseModal open={buying} product={product} plan={plan} onClose={() => { setBuying(false); load(); }} onInstall={onInstall} />
    </div>
  );
}
