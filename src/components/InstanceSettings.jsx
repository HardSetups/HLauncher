// Profil ayarları: kart bölümler. Her değişiklik anında kaydedilir; metin
// alanları odak çıkınca/Enter'da, RAM kaydırıcısı bırakınca yazılır.
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Trash2, Minus, Plus, Check, AlertTriangle } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { Switch } from './ui.jsx';
import VersionMenu from './VersionMenu.jsx';

const LOADERS = ['release', 'fabric', 'quilt', 'forge', 'neoforge', 'optifine'];
const LOADER_NAMES = { release: 'Vanilla', optifine: 'OptiFine', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

// Metin alanı: yazarken yerel, odak çıkınca/Enter'da kaydeder
function CommitInput({ value, onCommit, transform = (v) => v.trim(), ...rest }) {
  const [draft, setDraft] = useState(value ?? '');
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setDraft(value ?? ''); }
  const commit = () => {
    const next = transform(draft);
    if (next !== (value ?? '')) onCommit(next);
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      {...rest}
    />
  );
}

function Card({ title, desc, aside, children, tone }) {
  return (
    <section className={`iset-card${tone ? ` is-${tone}` : ''}`}>
      <header className="iset-head">
        <div>
          <h3>{title}</h3>
          {desc && <p>{desc}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

// RAM: sürüklerken yerel değer, bırakınca kaydeder (her pikselde diske yazmaz)
function RamSlider({ value, max, recommended, onCommit }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (value !== prev) { setPrev(value); setDraft(value); }

  const clamp = (n) => Math.min(max, Math.max(1, n));
  const commit = (n) => { const v = clamp(n); setDraft(v); if (v !== value) onCommit(v); };
  const ratio = draft / (max + 2); // toplam RAM'e oran (max = toplam - 2)
  const level = ratio > 0.8 ? 'danger' : ratio > 0.6 ? 'warn' : 'ok';
  const fill = ((draft - 1) / (max - 1)) * 100;
  const recPos = ((recommended - 1) / (max - 1)) * 100;
  const ticks = [];
  for (let g = 2; g <= max; g += max > 16 ? 4 : 2) ticks.push(g);

  return (
    <div className="ram">
      <div className="ram-top">
        <button className="icon-btn icon-btn-framed" onClick={() => commit(draft - 1)} disabled={draft <= 1} aria-label={t('inst.ram.less')}><Minus size={16} /></button>
        <div className="ram-readout">
          <b>{draft}</b><span>GB</span>
        </div>
        <button className="icon-btn icon-btn-framed" onClick={() => commit(draft + 1)} disabled={draft >= max} aria-label={t('inst.ram.more')}><Plus size={16} /></button>
      </div>
      <div className="ram-slider">
        <input
          type="range" min={1} max={max} step={1} value={draft}
          onChange={(e) => setDraft(parseInt(e.target.value, 10))}
          onPointerUp={() => commit(draft)}
          onKeyUp={() => commit(draft)}
          onBlur={() => commit(draft)}
          aria-label={t('inst.set.ram')}
          style={{ background: `linear-gradient(to right, var(--accent) ${fill}%, var(--raised-3) ${fill}%)` }}
        />
        <span className="ram-rec" style={{ left: `${recPos}%` }} title={t('inst.ram.recommended', { rec: recommended })} />
        <div className="ram-ticks">
          {ticks.map((g) => (
            <button key={g} style={{ left: `${((g - 1) / (max - 1)) * 100}%` }} onClick={() => commit(g)} className={g === draft ? 'is-on' : ''}>{g}</button>
          ))}
        </div>
      </div>
      <p className={`ram-hint is-${level}`}>
        {level !== 'ok' && <AlertTriangle size={14} />}
        {level === 'danger' ? t('inst.ram.danger') : level === 'warn' ? t('inst.ram.warn') : t('inst.ram.ok', { rec: recommended })}
      </p>
    </div>
  );
}

export default function InstanceSettings({
  instance, versionManifest, versionManifestLoading, versionManifestError, latestVersionId,
  systemInfo, globalRam, servers, statuses, onUpdate, onDelete,
}) {
  const { t } = useI18n();
  const totalMem = systemInfo?.totalMemGb || 16;
  const ramMax = Math.max(4, totalMem - 2);
  const recommended = Math.min(8, Math.max(2, Math.floor(totalMem / 2)));
  const customRam = !!instance.ram;
  // Kayıtlı sunucu yoksa anahtar açılınca adres yazılana kadar yerel "açık" durumda kalır
  const [wantAuto, setWantAuto] = useState(false);
  const autoConnect = !!instance.serverAddress || wantAuto;
  const [customAddress, setCustomAddress] = useState(false);
  const toggleAuto = (on) => {
    setWantAuto(on);
    if (!on) { setCustomAddress(false); onUpdate({ serverAddress: null }); return; }
    if (servers.length) onUpdate({ serverAddress: servers[0].address });
    else setCustomAddress(true);
  };
  const savedMatch = servers.some((s) => s.address === instance.serverAddress);

  return (
    <div className="iset">
      <Card title={t('inst.set.general')}>
        <label className="field">
          <span>{t('inst.set.name')}</span>
          <CommitInput value={instance.name} onCommit={(name) => name && onUpdate({ name })} maxLength={48} />
        </label>
      </Card>

      {instance.origin === 'hardsetups' ? (
        // HardSetups ürünü: sürüm ve loader sunucunun kurulum bildiriminden gelir (değiştirilemez)
        <Card title={t('inst.set.game')} desc={t('hs.managed.gameDesc')}>
          <p className="iset-readonly">
            Minecraft {instance.mcVersion} · {LOADER_NAMES[instance.loader] || instance.loader}{instance.loaderVersion ? ` ${instance.loaderVersion}` : ''}
            {instance.installedVersion ? ` · ${t('hs.managed.version', { v: instance.installedVersion })}` : ''}
          </p>
        </Card>
      ) : (
      <Card title={t('inst.set.game')} desc={t('inst.set.game.desc')}>
        <div className="loader-grid" role="radiogroup" aria-label="Loader">
          {LOADERS.map((id) => (
            <button
              key={id}
              role="radio"
              aria-checked={instance.loader === id}
              className={`loader-card${instance.loader === id ? ' is-selected' : ''}`}
              onClick={() => instance.loader !== id && onUpdate({ loader: id })}
            >
              <span className="loader-name">
                {LOADER_NAMES[id]}
                {id === 'neoforge' && <em className="beta">{t('vp.experimental')}</em>}
                {instance.loader === id && <Check size={15} className="loader-check" />}
              </span>
              <span className="loader-desc">{t(`loader.${id}.desc`)}</span>
            </button>
          ))}
        </div>
        <div className="field">
          <span>{t('inst.set.mcVersion')}</span>
          <VersionMenu
            hideLoaders
            allowLatest
            block
            loaderType={instance.loader}
            setLoaderType={() => {}}
            versionManifest={versionManifest}
            versionManifestLoading={versionManifestLoading}
            versionManifestError={versionManifestError}
            selectedVersion={instance.mcVersion}
            latestVersionId={latestVersionId}
            setSelectedVersion={(mcVersion) => onUpdate({ mcVersion })}
          />
        </div>
      </Card>
      )}

      <Card title={t('inst.set.ram')} desc={t('inst.set.ram.question')}>
        <div className="choice-row" role="radiogroup">
          <button role="radio" aria-checked={!customRam} className={`choice${!customRam ? ' is-selected' : ''}`} onClick={() => customRam && onUpdate({ ram: null })}>
            <span className="choice-dot" />
            <span className="choice-text">
              <b>{t('inst.ram.global')}</b>
              <span>{t('inst.ram.global.desc', { gb: globalRam })}</span>
            </span>
          </button>
          <button role="radio" aria-checked={customRam} className={`choice${customRam ? ' is-selected' : ''}`} onClick={() => !customRam && onUpdate({ ram: Math.min(ramMax, Math.max(globalRam || recommended, 2)) })}>
            <span className="choice-dot" />
            <span className="choice-text">
              <b>{t('inst.ram.custom')}</b>
              <span>{t('inst.ram.custom.desc')}</span>
            </span>
          </button>
        </div>
        <AnimatePresence initial={false}>
          {customRam && (
            <motion.div key="ram" className="collapse" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
              <RamSlider value={instance.ram} max={ramMax} recommended={recommended} onCommit={(ram) => onUpdate({ ram })} />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <Card
        title={t('inst.set.server')}
        desc={t('inst.set.server.desc')}
        aside={<Switch checked={autoConnect} onChange={toggleAuto} label={t('inst.set.server')} />}
      >
        <AnimatePresence initial={false}>
          {autoConnect && (
            <motion.div key="srv" className="collapse" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}>
              <div className="server-pick" role="radiogroup">
                {servers.map((s) => {
                  const selected = !customAddress && instance.serverAddress === s.address;
                  const st = statuses[s.id];
                  return (
                    <button key={s.id} role="radio" aria-checked={selected} className={`server-opt${selected ? ' is-selected' : ''}`}
                      onClick={() => { setCustomAddress(false); onUpdate({ serverAddress: s.address }); }}>
                      <span className="choice-dot" />
                      <span className={`status-dot status-${st?.state || 'loading'}`} />
                      <span className="server-opt-text ellipsis"><b>{s.name || s.address}</b> <span>{s.address}</span></span>
                    </button>
                  );
                })}
                <div className={`server-opt is-custom${customAddress || (!savedMatch && instance.serverAddress) ? ' is-selected' : ''}`}>
                  <span className="choice-dot" />
                  <CommitInput
                    value={savedMatch && !customAddress ? '' : (instance.serverAddress || '')}
                    placeholder={t('inst.set.server.other')}
                    spellCheck={false}
                    onFocus={() => setCustomAddress(true)}
                    onCommit={(v) => v && onUpdate({ serverAddress: v })}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <Card title={t('inst.set.more')}>
        <div className="iset-actions">
          <div className="iset-action">
            <div><b>{t('prof.openFolder')}</b><span>{t('inst.set.folder.desc')}</span></div>
            <button className="btn-secondary" onClick={() => window.electronAPI.openInstanceDir(instance.id)}><FolderOpen size={15} /> {t('inst.set.folder.btn')}</button>
          </div>
          {instance.id !== 'default' && (
            <div className="iset-action is-danger">
              <div><b>{t('inst.set.delete')}</b><span>{t('inst.set.delete.desc')}</span></div>
              <button className="btn-danger-ghost" onClick={onDelete}><Trash2 size={15} /> {t('inst.set.delete.btn')}</button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
