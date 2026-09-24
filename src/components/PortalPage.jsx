// HardSetups merkezi: Vitrin (sözleşme §4) ve Kütüphanem (§6) sekmeleri; başlıkta
// bakiye ve bildirim zili (§9). Hesap bağlı değilse vitrin yine görünür (girişsiz çalışır).
import { Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { useI18n } from '../i18n.jsx';
import StoreFeed from './StoreFeed.jsx';
import LibraryPage from './LibraryPage.jsx';
import NotificationsBell from './NotificationsBell.jsx';
import { formatMinor } from '../utils/money.js';

const TABS = ['store', 'library'];

export default function PortalPage({ portal, tab = 'store', setTab, autoInstall, onAutoInstallDone, onOpenProduct, ...libraryProps }) {
  const { t, lang } = useI18n();
  const api = window.electronAPI;
  const signedIn = !!portal?.signedIn && !portal?.outdated;
  const balance = signedIn && portal.wallet ? formatMinor(portal.wallet.balanceMinor, portal.wallet.currency, lang) : null;

  return (
    <div className="page-scroll hs-hub">
      <header className="page-head hub-head">
        <div>
          <h1>HardSetups</h1>
          <nav className="tabs hub-tabs" role="tablist">
            {TABS.map((id) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' is-active' : ''} hub-tab-${id}`} onClick={() => setTab(id)}>
                {t(`hs.tab.${id}`)}
                {tab === id && <motion.span layoutId="hub-tab-underline" className="tab-underline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              </button>
            ))}
          </nav>
        </div>
        {signedIn && (
          <div className="page-head-actions">
            {balance && (
              <button className="wallet-chip" onClick={() => api.portalOpenLink('wallet')} title={t('hs.wallet')}>
                <Wallet size={14} /> {balance}
              </button>
            )}
            <NotificationsBell unread={portal.unreadNotifications || 0} onError={libraryProps.onError} />
          </div>
        )}
      </header>

      {tab === 'store'
        ? <StoreFeed portal={portal} onOpenProduct={onOpenProduct} onOpenLibrary={() => setTab('library')} />
        : <LibraryPage portal={portal} embedded autoInstallSlug={autoInstall} onAutoInstallDone={onAutoInstallDone} {...libraryProps} />}
    </div>
  );
}
