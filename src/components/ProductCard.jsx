// Vitrin ürün kartı (sözleşme §4 ProductCard): kapak, ad, kısa açıklama, fiyat
// (indirimliyse eski fiyat üstü çizili), rozetler (Yeni / İndirimde), sahipsen işaret.
import { Check } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { formatMinor } from '../utils/money.js';
import { imgSrc } from '../utils/portal.js';

export function Badges({ badges }) {
  const { t } = useI18n();
  if (!badges?.length) return null;
  return (
    <span className="badges">
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

export default function ProductCard({ product, imageHosts, onOpen }) {
  const { t } = useI18n();
  const cover = imgSrc(product.coverUrl || product.iconUrl, imageHosts);
  return (
    <button type="button" className="pcard" onClick={() => onOpen(product)}>
      <span className="pcard-cover">
        {cover ? <img src={cover} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : null}
        <Badges badges={product.badges} />
      </span>
      <span className="pcard-body">
        <span className="pcard-name ellipsis">{product.name}</span>
        {product.shortDescription && <span className="pcard-desc">{product.shortDescription}</span>}
        <span className="pcard-foot">
          {product.owned
            ? <span className="pcard-owned"><Check size={13} /> {t('hs.owned')}</span>
            : <Price minor={product.priceFromMinor} compareAt={product.compareAtMinor} currency={product.currency} from />}
        </span>
      </span>
    </button>
  );
}
