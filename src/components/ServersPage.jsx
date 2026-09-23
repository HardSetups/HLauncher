// Sunucular: canlı durum listesi, ekleme formu, "şu profille oyna" menüsü.
import { useState } from 'react';
import { Plus, Star, Trash2, PackageCheck, Users, ChevronDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../i18n.jsx';
import { InstanceIcon, Menu, EmptyState } from './ui.jsx';
import { IconPlay, IconServers } from './icons.jsx';
import { fullNumber, instanceSubtitle } from '../utils/format.js';

function AddServerForm({ onAdd, onCancel }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [manifestUrl, setManifestUrl] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!address.trim()) return;
    // Hata (kopya/limit) olursa yazılanı silme — kullanıcı düzeltebilsin
    if (onAdd(name.trim(), address.trim(), manifestUrl.trim()) === false) return;
    onCancel();
  };
  return (
    <form className="add-form" onSubmit={submit}>
      <label className="field">
        <span>{t('srv.form.address')}</span>
        <input autoFocus value={address} onChange={(e) => setAddress(e.target.value)} placeholder="mc.example.com" spellCheck={false} />
      </label>
      <label className="field">
        <span>{t('srv.form.name')} <em>{t('common.optional')}</em></span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('srv.form.namePh')} />
      </label>
      <label className="field field-wide">
        <span>{t('srv.form.manifest')} <em>{t('common.optional')}</em></span>
        <input value={manifestUrl} onChange={(e) => setManifestUrl(e.target.value)} placeholder="https://…/hlauncher.json" spellCheck={false} />
      </label>
      <div className="add-form-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="submit" className="btn-primary" disabled={!address.trim()}><Plus size={16} /> {t('common.add')}</button>
      </div>
    </form>
  );
}

export default function ServersPage({
  servers, statuses, instances, latestVersionId, launch,
  onAdd, onRemove, onToggleFavorite, onApplyManifest, onPlayServer,
}) {
  const { t, lang } = useI18n();
  const [adding, setAdding] = useState(false);
  const sorted = [...servers].sort((a, b) => (b.favorite === true) - (a.favorite === true));
  const totalOnline = Object.values(statuses).reduce((sum, s) => sum + (s.state === 'online' ? (s.players?.online || 0) : 0), 0);
  const busy = !!(launch.launchingId || launch.runningId);

  // Bu sunucu için önerilen profil: adresi eşleşen profil başa
  const orderedFor = (server) => [...instances].sort((a, b) =>
    (b.serverAddress === server.address) - (a.serverAddress === server.address) || (b.lastPlayed || 0) - (a.lastPlayed || 0));

  return (
    <div className="servers page-scroll">
      <header className="page-head">
        <div>
          <h1>{t('srv.title')}</h1>
          <p className="page-sub">
            {servers.length
              ? t('srv.summary', { count: servers.length, online: fullNumber(totalOnline, lang) })
              : t('srv.subtitle')}
          </p>
        </div>
        {!adding && <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> {t('srv.add')}</button>}
      </header>

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div key="add" className="collapse" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
            <AddServerForm onAdd={onAdd} onCancel={() => setAdding(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {sorted.length === 0 ? (
        !adding && (
          <EmptyState
            icon={<IconServers size={28} />}
            title={t('srv.empty.title')}
            text={t('srv.empty.grid')}
            action={<button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> {t('srv.add')}</button>}
          />
        )
      ) : (
        <div className="server-list">
          {sorted.map((server) => {
            const st = statuses[server.id];
            const online = st?.state === 'online';
            return (
              <div key={server.id} className="server-row">
                <span className="server-icon">
                  {st?.icon ? <img src={st.icon} alt="" /> : <IconServers size={20} />}
                </span>
                <div className="server-body">
                  <div className="server-title">
                    <span className="ellipsis">{server.name || server.address}</span>
                    {server.favorite && <Star size={13} className="fav-star" fill="currentColor" />}
                  </div>
                  <div className="server-sub ellipsis">{server.address}</div>
                  <div className="server-motd ellipsis" title={st?.motd || undefined}>
                    {online ? (st.motd || '—') : st?.state === 'loading' ? t('srv.checking') : t('srv.offline')}
                  </div>
                </div>
                <div className="server-stats">
                  <span className={`server-state is-${st?.state || 'loading'}`}>
                    <span className={`status-dot status-${st?.state || 'loading'}`} />
                    {online ? t('srv.online') : st?.state === 'loading' ? t('srv.checkingShort') : t('srv.offlineShort')}
                  </span>
                  {online && <span className="server-players"><Users size={13} /> {fullNumber(st.players?.online, lang)} / {fullNumber(st.players?.max, lang)}</span>}
                  {online && st.version && <span className="server-version ellipsis" title={st.version}>{st.version}</span>}
                </div>
                <div className="server-actions">
                  {server.manifestUrl && (
                    <button className="icon-btn" onClick={() => onApplyManifest(server)} title={t('srv.applyManifest')} aria-label={t('srv.applyManifest')}>
                      <PackageCheck size={17} />
                    </button>
                  )}
                  <button className={`icon-btn${server.favorite ? ' is-fav' : ''}`} onClick={() => onToggleFavorite(server.id)} title={t('srv.favorite')} aria-label={t('srv.favorite')} aria-pressed={!!server.favorite}>
                    <Star size={17} fill={server.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button className="icon-btn icon-btn-danger" onClick={() => onRemove(server.id)} title={t('srv.remove')} aria-label={t('srv.remove')}>
                    <Trash2 size={17} />
                  </button>
                  <Menu
                    align="end"
                    width={300}
                    trigger={({ toggle, open }) => (
                      <button className="btn-play btn-play-md" onClick={toggle} aria-expanded={open} disabled={busy}>
                        {launch.launchingId && launch.serverAddress === server.address ? <Loader2 size={15} className="spin" /> : <IconPlay size={15} />}
                        <span>{t('play.now')}</span>
                        <ChevronDown size={14} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <p className="menu-caption">{t('srv.playWith')}</p>
                        {orderedFor(server).map((inst) => (
                          <button key={inst.id} className="menu-item menu-item-inst" onClick={() => { close(); onPlayServer(server, inst); }}>
                            <InstanceIcon instance={inst} size={26} />
                            <span className="target-text">
                              <b className="ellipsis">{inst.name}</b>
                              <span className="ellipsis">{instanceSubtitle(inst, latestVersionId)}</span>
                            </span>
                            {inst.serverAddress === server.address && <span className="tag-mini">{t('srv.linked')}</span>}
                          </button>
                        ))}
                      </>
                    )}
                  </Menu>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
