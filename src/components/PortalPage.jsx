// HardSetups merkezi: marka bandı (hesap, bakiye, bildirimler, hızlı bağlantılar) +
// Vitrin (sözleşme §4) ve Kütüphanem (§6) sekmeleri; zil §9. Hesap bağlı değilse
// vitrin yine görünür (girişsiz çalışır). Bağlantılar ana süreçte izin listesiyle açılır.
import { Wallet, Plus, Globe, Store, LifeBuoy, ExternalLink, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { useI18n } from '../i18n.jsx';
import StoreFeed from './StoreFeed.jsx';
import LibraryPage from './LibraryPage.jsx';
import NotificationsBell from './NotificationsBell.jsx';
import { formatMinor } from '../utils/money.js';
import '../styles/hub.css';

const TABS = ['store', 'library'];
const LINKS = [
  { kind: 'site', Icon: Globe },
  { kind: 'store', Icon: Store },
  { kind: 'support', Icon: LifeBuoy },
];

export default function PortalPage({ portal, tab = 'store', setTab, autoInstall, onAutoInstallDone, onOpenProduct, ...libraryProps }) {
  const { t, lang } = useI18n();
  const api = window.electronAPI;
  const signedIn = !!portal?.signedIn && !portal?.outdated;
  const balance = signedIn && portal.wallet ? formatMinor(portal.wallet.balanceMinor, portal.wallet.currency, lang) : null;
  // Bağlantı adresleri config'ten gelir; config yokken düğme hiçbir şey açmazdı
  const showLinks = !!portal?.configLoaded && !portal?.outdated;

  return (
    <div className="page-scroll hs-hub">
      <header className="hub-band">
        <div className="hub-band-brand">
          <span className="hub-mark" aria-hidden="true">HS</span>
          <div className="hub-band-text">
            <h1>HardSetups</h1>
            <p>{t('hub.tagline')}</p>
          </div>
        </div>

        <div className="hub-band-side">
          {signedIn ? (
            <>
              <span className="hub-who">
                <span>{t('hub.hello')}</span>
                <b className="ellipsis" title={portal.user?.username}>{portal.user?.username}</b>
              </span>
              {balance && (
                <span className="hub-wallet" role="group" aria-label={t('hs.wallet')}>
                  <button type="button" className="hub-wallet-main" onClick={() => api.portalOpenLink('wallet')} title={t('hs.wallet')}>
                    <Wallet size={15} />
                    <span className="hub-wallet-text"><small>{t('hs.balance')}</small><b>{balance}</b></span>
                  </button>
                  <button type="button" className="hub-wallet-add" onClick={() => api.portalOpenLink('topup')} title={t('hs.buy.topup')} aria-label={t('hs.buy.topup')}>
                    <Plus size={15} /> <span>{t('hub.topupShort')}</span>
                  </button>
                </span>
              )}
              <NotificationsBell unread={portal.unreadNotifications || 0} onError={libraryProps.onError} />
            </>
          ) : !portal?.outdated && tab !== 'library' && (
            <button type="button" className="btn-secondary" onClick={() => setTab('library')}>
              <UserRound size={15} /> {t('hs.connect')}
            </button>
          )}
        </div>

        {showLinks && (
          <nav className="hub-links" aria-label={t('hub.links')}>
            {LINKS.map((link) => {
              const Icon = link.Icon;
              return (
                <button key={link.kind} type="button" className="hub-link" onClick={() => api.portalOpenLink(link.kind)}>
                  <Icon size={14} /> {t(`hub.link.${link.kind}`)} <ExternalLink size={11} className="hub-link-ext" />
                </button>
              );
            })}
          </nav>
        )}
      </header>

      <nav className="tabs hub-tabs" role="tablist">
        {TABS.map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' is-active' : ''} hub-tab-${id}`} onClick={() => setTab(id)}>
            {t(`hs.tab.${id}`)}
            {tab === id && <motion.span layoutId="hub-tab-underline" className="tab-underline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          </button>
        ))}
      </nav>

      {tab === 'store'
        ? <StoreFeed portal={portal} onOpenProduct={onOpenProduct} onOpenLibrary={() => setTab('library')} />
        : <LibraryPage portal={portal} embedded autoInstallSlug={autoInstall} onAutoInstallDone={onAutoInstallDone} onOpenProduct={onOpenProduct} {...libraryProps} />}
    </div>
  );
}
