// Hesap sayfası: büyük 3D sahne + hesap kartı + skin kütüphanesi + pelerinler.
// Skin kütüphanesi herkese açık; oyuna uygulama (skin/pelerin) Microsoft hesabı ister.
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, UserSearch, Save, Trash2, MoreHorizontal, RotateCcw, Check, Loader2, LogOut, Copy,
  Pause, Play as PlayIcon, Shirt, Info,
} from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { Menu, EmptyState } from './ui.jsx';
import SkinViewer3D from './SkinViewer3D.jsx';
import SkinPreview2D, { CapePreview } from './SkinPreview2D.jsx';
import AccountPanel from './AccountPanel.jsx';
import HardSetupsCard from './HardSetupsCard.jsx';
import Modal from './Modal.jsx';

const ANIMS = ['idle', 'walk', 'run', 'wave', 'crouch'];

function UsernameImport({ onImport, close }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const ok = await onImport(name.trim());
    setBusy(false);
    if (ok) { setName(''); close(); }
  };
  return (
    <form className="menu-form" onSubmit={submit}>
      <label className="field">
        <span>{t('skin.fromPlayer')}</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('skin.fromPlayer.ph')} maxLength={16} spellCheck={false} />
      </label>
      <button type="submit" className="btn-primary btn-block" disabled={!name.trim() || busy}>
        {busy ? <Loader2 size={15} className="spin" /> : <UserSearch size={15} />} {t('skin.fetch')}
      </button>
    </form>
  );
}

export default function AccountPage({ account, setAccount, portal, onError }) {
  const { t } = useI18n();
  const api = window.electronAPI;
  const isMs = account?.type === 'microsoft';

  const [library, setLibrary] = useState([]);
  const [profile, setProfile] = useState(null); // Microsoft profili: aktif skin + pelerinler
  const [profileLoading, setProfileLoading] = useState(false);
  const [previewId, setPreviewId] = useState(null);
  const [anim, setAnim] = useState('idle');
  const [rotate, setRotate] = useState(true);
  const [busy, setBusy] = useState(null); // 'apply:<id>' | 'reset' | 'cape:<id>' | 'save' | 'file'
  const [justApplied, setJustApplied] = useState(null);
  const [renaming, setRenaming] = useState(null); // { skin, name }
  const [copied, setCopied] = useState(false);

  const fail = useCallback((err) => onError(String(err?.message || err)), [onError]);

  const loadLibrary = useCallback(async () => {
    try {
      const res = await api.listSkins();
      if (res.ok) setLibrary(res.skins); else onError(res.error);
    } catch (err) { fail(err); }
  }, [api, onError, fail]);

  const loadProfile = useCallback(async () => {
    if (!isMs) return;
    setProfileLoading(true);
    try {
      const res = await api.getSkinProfile();
      if (res.ok) setProfile(res.profile); else onError(res.error);
    } catch (err) { fail(err); } finally { setProfileLoading(false); }
  }, [api, isMs, onError, fail]);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  const preview = library.find((s) => s.id === previewId) || null;
  const stageSkin = preview?.dataUrl || (isMs ? profile?.skin?.dataUrl : undefined);
  const stageVariant = preview?.variant || (isMs ? profile?.skin?.variant : undefined);
  const activeCape = profile?.capes?.find((c) => c.id === profile.activeCapeId)?.dataUrl || null;

  // ── İşlemler ──
  const run = async (key, fn) => {
    setBusy(key);
    try { return await fn(); } catch (err) { fail(err); return null; } finally { setBusy(null); }
  };

  const addFromFile = () => run('file', async () => {
    const res = await api.importSkinFile();
    if (res.canceled) return;
    if (!res.ok) { onError(res.error); return; }
    await loadLibrary();
    setPreviewId(res.skin.id);
  });

  const addFromPlayer = async (name) => {
    try {
      const res = await api.importSkinUsername(name);
      if (!res.ok) { onError(res.error); return false; }
      await loadLibrary();
      setPreviewId(res.skin.id);
      return true;
    } catch (err) { fail(err); return false; }
  };

  const saveCurrent = () => run('save', async () => {
    const res = await api.saveCurrentSkin();
    if (!res.ok) { onError(res.error); return; }
    await loadLibrary();
  });

  const apply = (skin) => run(`apply:${skin.id}`, async () => {
    const res = await api.applySkin(skin.id);
    if (!res.ok) { onError(res.error); return; }
    setProfile(res.profile);
    setPreviewId(null);
    setJustApplied(skin.id);
    setTimeout(() => setJustApplied((v) => (v === skin.id ? null : v)), 2500);
  });

  const resetSkin = () => run('reset', async () => {
    const res = await api.resetSkin();
    if (!res.ok) { onError(res.error); return; }
    setProfile(res.profile);
    setPreviewId(null);
  });

  const chooseCape = (capeId) => run(`cape:${capeId || 'none'}`, async () => {
    const res = await api.setCape(capeId);
    if (!res.ok) { onError(res.error); return; }
    setProfile(res.profile);
  });

  const setVariant = async (skin, variant) => {
    const res = await api.updateSkin(skin.id, { variant });
    if (!res.ok) { onError(res.error); return; }
    setLibrary((prev) => prev.map((s) => (s.id === skin.id ? { ...s, variant } : s)));
  };

  // Electron'da window.prompt yok → küçük diyalog
  const commitRename = async (e) => {
    e?.preventDefault();
    const { skin, name } = renaming || {};
    setRenaming(null);
    if (!skin || !name?.trim() || name.trim() === skin.name) return;
    const res = await api.updateSkin(skin.id, { name: name.trim() });
    if (!res.ok) { onError(res.error); return; }
    setLibrary((prev) => prev.map((s) => (s.id === skin.id ? { ...s, name: res.skin.name } : s)));
  };

  const remove = async (skin) => {
    const res = await api.removeSkin(skin.id);
    if (!res.ok) { onError(res.error); return; }
    if (previewId === skin.id) setPreviewId(null);
    setLibrary((prev) => prev.filter((s) => s.id !== skin.id));
  };

  const copyUuid = () => {
    navigator.clipboard.writeText(account.uuid)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })
      .catch(() => {});
  };

  const logout = async () => {
    try { await api.logout(); setAccount(null); setProfile(null); setPreviewId(null); } catch (err) { fail(err); }
  };

  const avatar = account ? `https://minotar.net/helm/${encodeURIComponent(isMs && account.uuid ? account.uuid : account.name)}/80.png` : null;

  return (
    <div className="acct page-scroll">
      <header className="page-head">
        <div>
          <h1>{t('acc.title')}</h1>
          <p className="page-sub">{t('acc.sub2')}</p>
        </div>
      </header>

      <div className="acct-grid">
        {/* ── Sahne ── */}
        <section className="stage">
          <div className="stage-view">
            <SkinViewer3D
              account={account}
              skin={stageSkin}
              variant={stageVariant}
              cape={activeCape}
              animation={anim}
              rotate={rotate}
              width={300}
              height={420}
            />
            <AnimatePresence>
              {preview && (
                <motion.div className="stage-badge" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  {t('skin.previewing', { name: preview.name })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="stage-bar">
            <div className="seg seg-sm" role="tablist" aria-label={t('skin.animation')}>
              {ANIMS.map((a) => (
                <button key={a} className={`seg-btn${anim === a ? ' is-active' : ''}`} onClick={() => setAnim(a)} aria-pressed={anim === a}>{t(`skin.anim.${a}`)}</button>
              ))}
            </div>
            <button className="icon-btn icon-btn-framed" onClick={() => setRotate((v) => !v)} aria-label={t('skin.rotate')} title={t('skin.rotate')}>
              {rotate ? <Pause size={15} /> : <PlayIcon size={15} />}
            </button>
          </div>
          <AnimatePresence>
            {preview && (
              <motion.div className="stage-actions" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <button className="btn-ghost" onClick={() => setPreviewId(null)}>{t('skin.backToCurrent')}</button>
                <button className="btn-primary" onClick={() => apply(preview)} disabled={!isMs || busy === `apply:${preview.id}`} title={!isMs ? t('skin.msOnly') : undefined}>
                  {busy === `apply:${preview.id}` ? <Loader2 size={15} className="spin" /> : <Check size={15} />} {t('skin.apply')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <div className="acct-side">
          {/* ── Hesap kartı ── */}
          {account ? (
            <section className="card acct-card">
              <img className="acct-avatar" src={avatar} alt="" />
              <div className="acct-info">
                <span className={`acct-type is-${account.type}`}>{isMs ? t('acc.type.microsoft') : t('acc.type.offline')}</span>
                <h2 className="acct-name" title={account.name}>{account.name}</h2>
                {isMs && account.uuid && (
                  <button className="acct-uuid" onClick={copyUuid} title={t('acc.copyUuid')}>
                    <span className="ellipsis">{account.uuid}</span>{copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                )}
              </div>
              <div className="acct-actions">
                {isMs && (
                  <button className="btn-secondary" onClick={resetSkin} disabled={busy === 'reset' || profile?.skin?.isDefault} title={t('skin.reset.desc')}>
                    {busy === 'reset' ? <Loader2 size={15} className="spin" /> : <RotateCcw size={15} />} {t('skin.reset')}
                  </button>
                )}
                <button className="btn-ghost" onClick={logout}><LogOut size={15} /> {t('acc.logout')}</button>
              </div>
            </section>
          ) : (
            <section className="acct-login">
              <AccountPanel account={account} setAccount={setAccount} onError={onError} />
            </section>
          )}

          {/* ── HardSetups hesabı (Minecraft hesabından ayrı giriş) ── */}
          <HardSetupsCard portal={portal} onError={onError} />

          {account && !isMs && (
            <div className="callout">
              <Info size={16} />
              <div>
                <b>{t('skin.offline.title')}</b>
                <span>{t('skin.offline.text')}</span>
              </div>
            </div>
          )}

          {/* ── Skin kütüphanesi ── */}
          <section className="card lib">
            <header className="lib-head">
              <div>
                <h3>{t('skin.library')} <span className="count">{library.length}</span></h3>
                <p>{t('skin.library.desc')}</p>
              </div>
              <div className="lib-tools">
                <button className="btn-secondary" onClick={addFromFile} disabled={busy === 'file'}>
                  <Upload size={15} /> {t('skin.fromFile')}
                </button>
                <Menu
                  align="end"
                  width={260}
                  trigger={({ toggle, open }) => (
                    <button className="btn-secondary" onClick={toggle} aria-expanded={open}><UserSearch size={15} /> {t('skin.fromPlayerShort')}</button>
                  )}
                >
                  {(close) => <UsernameImport onImport={addFromPlayer} close={close} />}
                </Menu>
                {isMs && (
                  <button className="icon-btn icon-btn-framed" onClick={saveCurrent} disabled={busy === 'save'} title={t('skin.saveCurrent')} aria-label={t('skin.saveCurrent')}>
                    {busy === 'save' ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                  </button>
                )}
              </div>
            </header>

            {library.length === 0 ? (
              <EmptyState icon={<Shirt size={26} />} title={t('skin.empty.title')} text={t('skin.empty.text')} />
            ) : (
              <motion.div className="skin-grid" layout>
                <AnimatePresence initial={false}>
                  {library.map((skin) => {
                    const selected = previewId === skin.id;
                    const applying = busy === `apply:${skin.id}`;
                    return (
                      <motion.div
                        key={skin.id}
                        layout
                        initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}
                        transition={{ duration: 0.16 }}
                        className={`skin-tile${selected ? ' is-selected' : ''}`}
                        role="button" tabIndex={0}
                        onClick={() => setPreviewId(selected ? null : skin.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setPreviewId(selected ? null : skin.id); }}
                      >
                        <div className="skin-art">
                          <SkinPreview2D src={skin.dataUrl} variant={skin.variant} scale={3} />
                          {justApplied === skin.id && <span className="skin-applied"><Check size={13} /> {t('skin.applied')}</span>}
                        </div>
                        <div className="skin-meta">
                          <span className="skin-name ellipsis" title={skin.name}>{skin.name}</span>
                          <span className="skin-variant">{t(`skin.variant.${skin.variant}`)}</span>
                        </div>
                        <div className="skin-actions">
                          <button className="btn-primary btn-xs" onClick={(e) => { e.stopPropagation(); apply(skin); }} disabled={!isMs || applying} title={!isMs ? t('skin.msOnly') : undefined}>
                            {applying ? <Loader2 size={13} className="spin" /> : t('skin.use')}
                          </button>
                          <Menu
                            align="end"
                            trigger={({ toggle, open }) => (
                              <button className="icon-btn" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-expanded={open} aria-label={t('common.more')}>
                                <MoreHorizontal size={16} />
                              </button>
                            )}
                            items={[
                              { label: skin.variant === 'slim' ? t('skin.makeClassic') : t('skin.makeSlim'), icon: <Shirt size={15} />, onSelect: () => setVariant(skin, skin.variant === 'slim' ? 'classic' : 'slim') },
                              { label: t('skin.rename'), icon: <span className="menu-icon-space" />, onSelect: () => setRenaming({ skin, name: skin.name }) },
                              { label: t('common.delete'), icon: <Trash2 size={15} />, danger: true, onSelect: () => remove(skin) },
                            ]}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}
          </section>

          {/* ── Pelerinler ── */}
          {isMs && (
            <section className="card capes">
              <header className="lib-head">
                <div>
                  <h3>{t('cape.title')}</h3>
                  <p>{profile?.capes?.length ? t('cape.desc') : profileLoading ? t('common.loading') : t('cape.none')}</p>
                </div>
              </header>
              {profile?.capes?.length > 0 && (
                <div className="cape-row">
                  <button className={`cape-tile${!profile.activeCapeId ? ' is-selected' : ''}`} onClick={() => chooseCape(null)} disabled={!!busy}>
                    <span className="cape-art is-empty">—</span>
                    <span className="cape-name">{t('cape.hide')}</span>
                  </button>
                  {profile.capes.map((c) => (
                    <button key={c.id} className={`cape-tile${c.active ? ' is-selected' : ''}`} onClick={() => chooseCape(c.id)} disabled={!!busy} title={c.alias}>
                      <span className="cape-art">
                        {busy === `cape:${c.id}` ? <Loader2 size={16} className="spin" /> : c.dataUrl ? <CapePreview src={c.dataUrl} /> : null}
                      </span>
                      <span className="cape-name ellipsis">{c.alias}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title={t('skin.rename')}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setRenaming(null)}>{t('common.cancel')}</button>
            <button className="btn-primary" onClick={commitRename} disabled={!renaming?.name?.trim()}>{t('common.save')}</button>
          </>
        }
      >
        <form onSubmit={commitRename}>
          <input autoFocus maxLength={32} value={renaming?.name || ''} onChange={(e) => setRenaming((r) => ({ ...r, name: e.target.value }))} />
        </form>
      </Modal>
    </div>
  );
}
