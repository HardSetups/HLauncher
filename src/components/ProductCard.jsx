// Vitrin ürün kartı (sözleşme §4 ProductCard): kapak, ad, kısa açıklama, fiyat
// (indirimliyse eski fiyat üstü çizili), rozetler (Yeni / İndirimde), sahipsen işaret.
// Kapak yoksa ya da izinli host'ta değilse markalı desen + ürün ikonu gösterilir.
// Stiller kendi dosyasında: ana sayfa kartı PortalPage (hub.css) yüklenmeden de gösterir.
import { useState } from 'react';
import '../styles/product-card.css';
import { Check, ArrowRight } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { formatMinor } from '../utils/money.js';
import { imgSrc } from '../utils/portal.js';
import { InstanceIcon } from './ui.jsx';

export function Badges({ badges, className = '' }) {
  const { t } = useI18n();
  if (!badges?.length) return null;
  return (
    <span className={`badges ${className}`}>
      {badges.map((b) => <span key={b} className={`badge is-${b.toLowerCase()}`}>{t(`hs.badge.${b}`)}</span>)}
    </span>
  );
}

export function Price({ minor, compareAt, currency, from = false }) {
  const { t, lang } = useI18n();
  const price = formatMinor(minor, currency, lang);
  if (!price) return null;
  const old = compareAt ? formatMinor(compareAt, currency, lang) : '';
  return (
    <span className="price">
      {from && <span className="price-from">{t('hs.priceFrom')}</span>}
      {old && <s className="price-old">{old}</s>}
      <b>{price}</b>
    </span>
  );
}

/**
 * Kapak görseli ya da markalı desen. src: zaten süzülmüş (imgSrc) adres ya da null.
 * seed: desendeki ürün ikonu için kimlik; icon: süzülmüş ikon adresi (isteğe bağlı).
 */
export function CoverArt({ src, seed, icon = null, iconSize = 56, className = '', children }) {
  const [failed, setFailed] = useState(null);
  const show = src && failed !== src;
  return (
    <span className={`hub-cover${show ? '' : ' is-pattern'} ${className}`}>
      {show
        ? <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(src)} />
        : <span className="hub-cover-mark"><InstanceIcon instance={{ id: seed, iconUrl: icon }} size={iconSize} /></span>}
      {children}
    </span>
  );
}

/** Ürün rafı: tek ürün geniş kart, iki ürün yan yana, fazlası ızgara. onOpen(slug). */
export function ProductShelf({ products, imageHosts, onOpen }) {
  if (products.length === 1) return <ProductCard product={products[0]} imageHosts={imageHosts} onOpen={() => onOpen(products[0].slug)} layout="wide" />;
  return (
    <div className={`pgrid${products.length === 2 ? ' is-duo' : ''}`}>
      {products.map((p) => <ProductCard key={p.slug} product={p} imageHosts={imageHosts} onOpen={() => onOpen(p.slug)} />)}
    </div>
  );
}

/**
 * Tek ürün kartı tasarımı (vitrin, kütüphane önerileri, ana sayfa). Zorunlu: product, imageHosts,
 * onOpen(product). İsteğe bağlı: layout 'grid' (dikey) | 'wide' (tek ürün: yatay, geniş);
 * size 'default' | 'compact' (dar şeritler: tek satır açıklama, yalnızca ok).
 */
export default function ProductCard({ product, imageHosts, onOpen, layout = 'grid', size = 'default' }) {
  const { t } = useI18n();
  const cover = imgSrc(product.coverUrl, imageHosts);
  const icon = imgSrc(product.iconUrl, imageHosts);
  const wide = layout === 'wide';
  const compact = size === 'compact' && !wide;
  return (
    <button type="button" className={`pcard${wide ? ' is-wide' : ''}${compact ? ' is-compact' : ''}${product.owned ? ' is-owned' : ''}`} onClick={() => onOpen(product)}>
      <CoverArt src={cover} seed={product.slug} icon={icon} iconSize={wide ? 72 : compact ? 40 : 52} className="pcard-cover">
        <Badges badges={product.badges} />
      </CoverArt>
      <span className="pcard-body">
        {wide && <InstanceIcon instance={{ id: product.slug, iconUrl: icon }} size={44} className="pcard-icon" />}
        <span className="pcard-name ellipsis">{product.name}</span>
        {product.shortDescription && <span className="pcard-desc">{product.shortDescription}</span>}
        <span className="pcard-foot">
          {product.owned
            ? <span className="pcard-owned"><Check size={13} /> {t('hs.owned')}</span>
            : <Price minor={product.priceFromMinor} compareAt={product.compareAtMinor} currency={product.currency} from />}
          <span className={`pcard-go${wide ? ' btn-secondary' : ''}`} aria-hidden="true"><span className="pcard-go-text">{product.owned ? t('hub.card.view') : t('hub.card.details')}</span> <ArrowRight size={14} /></span>
        </span>
      </span>
    </button>
  );
}
