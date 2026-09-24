// Ana sayfa (alpha.7). Oyuncuya ve kaldığı yere odaklanır; mağaza vitrini
// HardSetups sayfasındadır (bant onun kopyası değildir).
// Üst: markalı karşılama bandı — HardSetups adıyla selam, bakiye, bildirim,
// son oynanan profili tek tıkla başlatma. Altında hızlı eylemler (mağaza,
// kütüphanem, yeni profil, sunucular).
// Orta: HardSetups ("HardSetups'ta yeni" kartı, duyurular, ürün şeridi — ortak
// ProductCard) ve haberler. Boş bölüm hiç görünmez, sahte / yer tutucu içerik yok.
// Alt: kaldığın yerden devam + profil kütüphanesi (arama, yeni profil).
// Sağ sütun: oynayan hesap, sunucular, topluluk; dar pencerede ana sütunun altına iner.
import { useState, useEffect } from 'react';
import { Search, Plus, ChevronRight, MoreHorizontal, FolderOpen, Settings2, ExternalLink, Loader2, Wallet, Bell, ArrowRight, Megaphone } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { InstanceIcon, Menu, EmptyState } from './ui.jsx';
import ProductCard from './ProductCard.jsx';
import { IconPlay, IconProfiles, IconDiscord, IconLibrary, IconStore, IconServers, IconAdd, IconAnnounce } from './icons.jsx';
import { instanceSubtitle, relativeTime, compactNumber } from '../utils/format.js';
import { formatMinor } from '../utils/money.js';

// public/bg.png: kiremit tonlu gün batımı. Bant kırpması görselin ortasındaki
// yazıyı dışarıda bırakır.
const BRAND_ART = 'bg.png';
const PRODUCT_LIMIT = 8;
const NEWS_LIMIT = 4;

function greetingKey(hour) {
  if (hour >= 5 && hour < 12) return 'home.greet.morning';
  if (hour >= 12 && hour < 18) return 'home.greet.day';
  if (hour >= 18 && hour < 23) return 'home.greet.evening';
  return 'home.greet.night';
}

/** Haber tarihi: "24 Eylül" (bu yıl) / "24 Eylül 2025". Tarih-yalnız dize UTC gününde kalır. */
function newsDate(value, lang) {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return String(value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const sameYear = new Date(ts).getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: 'numeric', month: 'long', year: sameYear ? undefined : 'numeric', timeZone: dateOnly ? 'UTC' : undefined,
  }).format(ts);
}

function PlayButton({ instance, launch, onPlay, size = 'md' }) {
  const { t } = useI18n();
  const launchingThis = launch.launchingId === instance.id;
  const runningThis = launch.runningId === instance.id;
  const busy = !!(launch.launchingId || launch.runningId);
  return (
    <button
      className={`btn-play btn-play-${size}${runningThis ? ' is-running' : ''}`}
      onClick={(e) => { e.stopPropagation(); onPlay(instance); }}
      disabled={busy && !runningThis}
      title={t('play.withProfile', { name: instance.name })}
    >
      {launchingThis ? <Loader2 size={15} className="spin" /> : <IconPlay size={15} />}
      <span>{runningThis ? t('play.running') : launchingThis ? t('play.launching') : t('play.now')}</span>
    </button>
  );
}

function QuickAction({ icon, title, text, onClick }) {
  return (
    <button type="button" className="quick" onClick={onClick}>
      <span className="quick-icon">{icon}</span>
      <span className="quick-text">
        <b>{title}</b>
        {text && <span>{text}</span>}
      </span>
    </button>
  );
}

export default function HomePage({
  instances, latestVersionId, account, servers, statuses, news, launch, hsHighlight = null,
  portal = null, portalHome = null, onPlay, onOpenInstance, onCreateInstance, navigate,
}) {
  const { t, lang } = useI18n();
  const api = window.electronAPI;
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [artFailed, setArtFailed] = useState(false);
  const [hour] = useState(() => new Date().getHours());

  // Ürün kataloğu (§5): vitrin boşken de dolu. Sahiplik girişe bağlı → oturum değişince tazelenir.
  const portalReady = !!portal?.configLoaded && !portal?.outdated;
  const signedIn = !!portal?.signedIn;
  useEffect(() => {
    if (!portalReady || !api?.portalProducts) return undefined;
    let cancelled = false;
    api.portalProducts()
      .then((res) => { if (!cancelled) setProducts(res?.ok && Array.isArray(res.products) ? res.products : []); })
      .catch(() => { if (!cancelled) setProducts([]); });
    return () => { cancelled = true; };
  }, [api, portalReady, signedIn]);

  // ── Profiller ──
  const played = instances.filter((i) => i.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed);
  // Kaldığın yerden devam yalnızca oynanmış profilleri listeler; hiç oynanmamışsa
  // bantdaki "Oynamaya hazır" kartı ve kütüphane yeter (aynı profil üç kez görünmesin)
  const recent = played.slice(0, 3);
  const quick = played[0] || instances[0] || null;
  const q = query.trim().toLocaleLowerCase('tr-TR');
  const library = [...instances]
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    .filter((i) => !q || i.name.toLocaleLowerCase('tr-TR').includes(q));

  const topServers = [...servers].sort((a, b) => (b.favorite === true) - (a.favorite === true)).slice(0, 4);
  const avatar = account ? `https://minotar.net/helm/${encodeURIComponent(account.type === 'microsoft' && account.uuid ? account.uuid : account.name)}/64.png` : null;

  // ── HardSetups ──
  const hosts = portal?.imageHosts;
  const showHighlight = !!hsHighlight;
  // İlk duyuru zaten "HardSetups'ta yeni" kartındaysa listede tekrarlanmaz
  const anns = (portalHome?.announcements || [])
    .filter((a) => a.text !== hsHighlight?.title)
    .slice(0, 3);
  const shownProducts = portalReady ? products.slice(0, PRODUCT_LIMIT) : [];
  const newsItems = (news || []).slice(0, NEWS_LIMIT);

  const name = (signedIn && portal.user?.username) || account?.name || '';
  const greeting = t(greetingKey(hour));
  const balance = signedIn && portal.wallet ? formatMinor(portal.wallet.balanceMinor, portal.wallet.currency, lang) : '';
  const unread = signedIn ? (portal.unreadNotifications || 0) : 0;
  const canConnect = !!portal?.configLoaded && !signedIn && portal.accountAvailable !== false && !portal.outdated;

  const onKeyOpen = (id) => (e) => { if (e.key === 'Enter') onOpenInstance(id); };

  return (
    <div className="home page-scroll">
      {/* ── Karşılama bandı ── */}
      <section className="home-band" aria-label={t('home.band.label')}>
        {!artFailed && <img className="band-art" src={BRAND_ART} alt="" onError={() => setArtFailed(true)} />}
        <span className="band-shade" aria-hidden />
        <span className="band-grid" aria-hidden />

        <div className="band-main">
          <div className="band-hello">
            <h1 className="band-title">{name ? `${greeting}, ${name}` : greeting}</h1>
            {!signedIn && <p className="band-tagline">{t('home.band.tagline')}</p>}
            {(balance || unread > 0 || canConnect) && (
              <div className="band-chips">
                {balance && (
                  <button type="button" className="band-chip" onClick={() => api.portalOpenLink('wallet')} title={t('home.band.wallet')}>
                    <Wallet size={14} /> <span className="band-chip-label">{t('home.band.balance')}</span> {balance}
                  </button>
                )}
                {unread > 0 && (
                  <button type="button" className="band-chip" onClick={() => navigate({ page: 'hardsetups' })}>
                    <Bell size={14} /> {t('home.band.unread', { count: unread })}
                  </button>
                )}
                {canConnect && (
                  <button type="button" className="band-chip is-link" onClick={() => navigate({ page: 'account' })}>
                    {t('home.band.connect')} <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {quick && (
            <div className="band-quick" role="button" tabIndex={0} onClick={() => onOpenInstance(quick.id)} onKeyDown={onKeyOpen(quick.id)}>
              <InstanceIcon instance={quick} size={42} />
              <span className="band-quick-text">
                <span className="band-quick-label">{played.length ? t('home.quick.last') : t('home.quick.ready')}</span>
                <span className="band-quick-name ellipsis">{quick.name}</span>
                <span className="band-quick-meta ellipsis">
                  {instanceSubtitle(quick, latestVersionId)}
                  {quick.lastPlayed ? ` · ${relativeTime(quick.lastPlayed, lang)}` : ''}
                </span>
              </span>
              <PlayButton instance={quick} launch={launch} onPlay={onPlay} />
            </div>
          )}
        </div>

      </section>

      {/* ── Hızlı eylemler ── */}
      <nav className="quick-grid" aria-label={t('home.act.title')}>
        <QuickAction icon={<IconStore size={20} />} title={t('home.act.store')} text={t('home.act.store.desc')} onClick={() => navigate({ page: 'hardsetups' })} />
        <QuickAction icon={<IconLibrary size={20} />} title={t('home.act.library')} text={t('home.act.library.desc')} onClick={() => navigate({ page: 'hardsetups', tab: 'library' })} />
        <QuickAction icon={<IconAdd size={20} />} title={t('home.act.newProfile')} text={t('home.act.newProfile.desc')} onClick={onCreateInstance} />
        <QuickAction
          icon={<IconServers size={20} />}
          title={t('home.act.servers')}
          text={servers.length ? t('home.act.servers.count', { count: servers.length }) : t('home.act.servers.desc')}
          onClick={() => navigate({ page: 'servers' })}
        />
      </nav>

      <div className="home-body">
        <div className="home-main">
          {/* ── HardSetups: duyuru kartı, diğer duyurular, ürünler ── */}
          {(showHighlight || anns.length > 0 || shownProducts.length > 0) && (
            <section className="section home-hs">
              <header className="section-head">
                <h2>{t('home.hs.title')}</h2>
                <button type="button" className="link-btn" onClick={() => navigate({ page: 'hardsetups' })}>
                  {t('common.all')} <ChevronRight size={14} />
                </button>
              </header>

              {showHighlight && (
                <button
                  type="button"
                  className="home-highlight hs-highlight"
                  onClick={() => navigate(hsHighlight.slug ? { page: 'product', slug: hsHighlight.slug } : { page: 'hardsetups' })}
                >
                  <span className="hl-icon"><IconAnnounce size={18} /></span>
                  <span className="hl-text">
                    <span className="hl-kicker">{t('home.hsNew')}</span>
                    <b>{hsHighlight.title}</b>
                    {hsHighlight.text && <span>{hsHighlight.text}</span>}
                    {hsHighlight.coupon && <code className="hs-highlight-coupon">{hsHighlight.coupon}</code>}
                  </span>
                  <ChevronRight size={16} className="muted" />
                </button>
              )}

              {anns.map((a) => (
                <div key={a.id} className={`home-ann is-${String(a.variant || 'INFO').toLowerCase()}`} role="status">
                  <Megaphone size={15} />
                  <span className="home-ann-text">{a.text}</span>
                  {a.link?.url && (
                    <button type="button" className="btn-ghost btn-xs" onClick={() => api.portalOpenUrl(a.link.url)}>
                      {a.link.label || t('home.more')} <ExternalLink size={12} />
                    </button>
                  )}
                </div>
              ))}

              {shownProducts.length > 0 && (
                <div className="home-products">
                  {shownProducts.map((p) => (
                    <ProductCard key={p.slug} product={p} imageHosts={hosts} onOpen={() => navigate({ page: 'product', slug: p.slug })} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Haberler (panelden ya da news.json'dan) ── */}
          {newsItems.length > 0 && (
            <section className="section">
              <header className="section-head"><h2>{t('home.news')}</h2></header>
              <ul className="news-list">
                {newsItems.map((n, i) => {
                  const El = n.url ? 'button' : 'div';
                  const date = newsDate(n.date, lang);
                  return (
                    <li key={`${n.date}-${n.title}-${i}`}>
                      <El className="news-item" onClick={n.url ? () => window.open(n.url, '_blank') : undefined}>
                        <span className="news-title"><span>{n.title}</span>{n.url && <ExternalLink size={12} />}</span>
                        {n.text && <span className="news-text">{n.text}</span>}
                        {date && <span className="news-date">{date}</span>}
                      </El>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── Kaldığın yerden devam ── */}
          {recent.length > 0 && (
            <section className="section">
              <header className="section-head">
                <h2>{t('home.continue')}</h2>
              </header>
              <div className="recent-list">
                {recent.map((inst) => (
                  <div key={inst.id} className="recent-row" role="button" tabIndex={0}
                    onClick={() => onOpenInstance(inst.id)}
                    onKeyDown={onKeyOpen(inst.id)}
                  >
                    <InstanceIcon instance={inst} size={44} />
                    <div className="recent-body">
                      <span className="recent-name ellipsis">{inst.name}</span>
                      <span className="recent-meta ellipsis">
                        {instanceSubtitle(inst, latestVersionId)}
                        <span className="dot-sep" />
                        {inst.lastPlayed ? relativeTime(inst.lastPlayed, lang) : t('home.neverPlayed')}
                        {inst.serverAddress && <><span className="dot-sep" />{inst.serverAddress}</>}
                      </span>
                    </div>
                    <PlayButton instance={inst} launch={launch} onPlay={onPlay} />
                    <Menu
                      trigger={({ toggle, open }) => (
                        <button className="icon-btn" aria-label={t('common.more')} aria-expanded={open} onClick={(e) => { e.stopPropagation(); toggle(); }}>
                          <MoreHorizontal size={17} />
                        </button>
                      )}
                      items={[
                        { label: t('inst.open'), icon: <IconProfiles size={15} />, onSelect: () => onOpenInstance(inst.id) },
                        { label: t('inst.settings'), icon: <Settings2 size={15} />, onSelect: () => onOpenInstance(inst.id, 'settings') },
                        { label: t('prof.openFolder'), icon: <FolderOpen size={15} />, onSelect: () => window.electronAPI.openInstanceDir(inst.id) },
                      ]}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Profil kütüphanesi ── */}
          <section className="section">
            <header className="section-head">
              <h2>{t('home.library')} <span className="count">{instances.length}</span></h2>
              <div className="section-tools">
                <label className="search-field">
                  <Search size={15} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('home.searchProfiles')} />
                </label>
                <button className="btn-secondary" onClick={onCreateInstance}><Plus size={16} /> {t('inst.new')}</button>
              </div>
            </header>

            {library.length === 0 ? (
              instances.length === 0
                ? <EmptyState icon={<IconProfiles size={22} />} title={t('home.noProfiles')} text={t('home.noProfiles.text')}
                    action={<button className="btn-primary" onClick={onCreateInstance}><Plus size={16} /> {t('inst.new')}</button>} />
                : <EmptyState title={t('home.noMatch')} />
            ) : (
              <div className="lib-grid">
                {library.map((inst) => (
                  <div key={inst.id} className="lib-card" role="button" tabIndex={0}
                    onClick={() => onOpenInstance(inst.id)}
                    onKeyDown={onKeyOpen(inst.id)}
                  >
                    <div className="lib-art">
                      <InstanceIcon instance={inst} fill />
                      <div className="lib-play"><PlayButton instance={inst} launch={launch} onPlay={onPlay} size="sm" /></div>
                    </div>
                    <span className="lib-name ellipsis">{inst.name}</span>
                    <span className="lib-meta ellipsis">{instanceSubtitle(inst, latestVersionId)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Sağ sütun ── */}
        <aside className="home-aside">
          <section className="aside-block">
            <h3 className="aside-title">{t('home.playingAs')}</h3>
            <button className="account-row" onClick={() => navigate({ page: 'account' })}>
              {avatar ? <img className="account-avatar" src={avatar} alt="" /> : <span className="account-avatar is-empty" />}
              <span className="account-text">
                <b className="ellipsis">{account?.name || t('acc.guest')}</b>
                <span className="ellipsis">{account ? (account.type === 'microsoft' ? t('acc.type.microsoft') : t('acc.type.offline')) : t('top.signIn')}</span>
              </span>
              <ChevronRight size={16} className="muted" />
            </button>
          </section>

          <section className="aside-block">
            <div className="aside-head">
              <h3 className="aside-title">{t('nav.servers')}</h3>
              <button className="link-btn" onClick={() => navigate({ page: 'servers' })}>{t('common.all')}</button>
            </div>
            {topServers.length === 0 ? (
              <p className="aside-empty">{t('srv.empty.compact')}</p>
            ) : (
              <ul className="mini-list">
                {topServers.map((s) => {
                  const st = statuses[s.id];
                  return (
                    <li key={s.id} className="mini-server">
                      <span className={`status-dot status-${st?.state || 'loading'}`} />
                      <span className="ellipsis">{s.name || s.address}</span>
                      <span className="mini-count">{st?.state === 'online' ? compactNumber(st.players?.online, lang) : '—'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="aside-block">
            <h3 className="aside-title">{t('home.community')}</h3>
            <button className="community-row" onClick={() => window.open('https://discord.com/invite/S4b25eJQtj', '_blank')}>
              <IconDiscord size={18} />
              <span className="account-text">
                <b>Discord</b>
                <span>{t('home.community.desc')}</span>
              </span>
              <ExternalLink size={14} className="muted" />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
