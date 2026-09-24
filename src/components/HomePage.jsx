// Ana sayfa: kaldığın yerden devam (son oynananlar) + profil kütüphanesi.
// Sağda: oynayan hesap, sunucular, haberler.
import { useState } from 'react';
import { Search, Plus, ChevronRight, MoreHorizontal, FolderOpen, Settings2, ExternalLink, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { InstanceIcon, Menu, EmptyState } from './ui.jsx';
import { IconPlay, IconProfiles, IconDiscord, IconLibrary } from './icons.jsx';
import { instanceSubtitle, relativeTime, compactNumber } from '../utils/format.js';

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

export default function HomePage({
  instances, latestVersionId, account, servers, statuses, news, launch, hsHighlight = null,
  onPlay, onOpenInstance, onCreateInstance, navigate,
}) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');

  const played = instances.filter((i) => i.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed);
  const recent = (played.length ? played : instances).slice(0, 3);
  const q = query.trim().toLocaleLowerCase('tr-TR');
  const library = [...instances]
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    .filter((i) => !q || i.name.toLocaleLowerCase('tr-TR').includes(q));

  const topServers = [...servers].sort((a, b) => (b.favorite === true) - (a.favorite === true)).slice(0, 4);
  const avatar = account ? `https://minotar.net/helm/${encodeURIComponent(account.type === 'microsoft' && account.uuid ? account.uuid : account.name)}/64.png` : null;

  return (
    <div className="home">
      <div className="home-main page-scroll">
        <section className="section">
          <header className="section-head">
            <h2>{played.length ? t('home.continue') : t('home.start')}</h2>
          </header>
          <div className="recent-list">
            {recent.map((inst) => (
              <div key={inst.id} className="recent-row" role="button" tabIndex={0}
                onClick={() => onOpenInstance(inst.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpenInstance(inst.id); }}
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

        <section className="section">
          <header className="section-head">
            <h2>{t('home.library')} <span className="count">{instances.length}</span></h2>
            <div className="section-tools">
              <label className="search-field">
                <Search size={15} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('home.searchProfiles')} />
              </label>
              <button className="btn-primary" onClick={onCreateInstance}><Plus size={16} /> {t('inst.new')}</button>
            </div>
          </header>

          {library.length === 0 ? (
            <EmptyState title={t('home.noMatch')} />
          ) : (
            <div className="lib-grid">
              {library.map((inst) => (
                <div key={inst.id} className="lib-card" role="button" tabIndex={0}
                  onClick={() => onOpenInstance(inst.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpenInstance(inst.id); }}
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

      <aside className="home-aside page-scroll">
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

        {/* HardSetups'ta yeni: panelden gelen duyuru / kampanya / öne çıkan; yoksa kart hiç görünmez */}
        {hsHighlight && (
          <section className="aside-block">
            <h3 className="aside-title">{t('home.hsNew')}</h3>
            <button className="community-row hs-highlight" onClick={() => navigate(hsHighlight.slug ? { page: 'product', slug: hsHighlight.slug } : { page: 'hardsetups' })}>
              <IconLibrary size={18} />
              <span className="account-text">
                <b>{hsHighlight.title}</b>
                {hsHighlight.text && <span>{hsHighlight.text}</span>}
                {hsHighlight.coupon && <code className="hs-highlight-coupon">{hsHighlight.coupon}</code>}
              </span>
              <ChevronRight size={16} className="muted" />
            </button>
          </section>
        )}

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
          <h3 className="aside-title">{t('news.title')}</h3>
          {(news || []).length === 0 ? (
            <p className="aside-empty">{t('news.empty')}</p>
          ) : (
            <ul className="news-list">
              {news.map((n, i) => {
                const Tag = n.url ? 'button' : 'div';
                return (
                  <li key={`${n.date}-${n.title}-${i}`}>
                    <Tag className="news-item" onClick={n.url ? () => window.open(n.url, '_blank') : undefined}>
                      <span className="news-title">{n.title}{n.url && <ExternalLink size={12} />}</span>
                      {n.text && <span className="news-text">{n.text}</span>}
                      {n.date && <span className="news-date">{n.date}</span>}
                    </Tag>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="aside-block">
          <button className="community-row" onClick={() => window.open('https://discord.com/invite/S4b25eJQtj', '_blank')}>
            <IconDiscord size={18} />
            <span className="account-text">
              <b>{t('home.community')}</b>
              <span>{t('home.community.desc')}</span>
            </span>
            <ExternalLink size={14} className="muted" />
          </button>
        </section>
      </aside>
    </div>
  );
}
