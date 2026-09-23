// Profil sayfası: başlık (ikon, ad, özet, Oyna) + sekmeler: modlar, kaynak
// paketleri, shaderlar, ayarlar. Oyun buradan başlatılır.
import { useState, useCallback, useEffect } from 'react';
import { FolderOpen, MoreHorizontal, Trash2, Loader2, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useI18n } from '../i18n.jsx';
import { InstanceIcon, Menu } from './ui.jsx';
import { IconPlay, IconStop } from './icons.jsx';
import ContentList from './ContentList.jsx';
import InstanceSettings from './InstanceSettings.jsx';
import { instanceSubtitle, relativeTime } from '../utils/format.js';

const TABS = ['mod', 'resourcepack', 'shader', 'settings'];

export default function InstancePage({
  instance, tab, setTab, latestVersionId, versionManifest, versionManifestLoading, versionManifestError,
  launch, launchPct, systemInfo, globalRam, servers, statuses,
  onPlay, onStop, onUpdate, onDelete, onError, onNotice, onAddContent,
}) {
  const { t, lang } = useI18n();
  const [counts, setCounts] = useState({});
  const onCountChange = useCallback((type, n) => setCounts((prev) => (prev[type] === n ? prev : { ...prev, [type]: n })), []);

  // Sekme sayıları: sekmeye girmeden de görünsün (yalnızca yerel dosya sayımı, ağsız hızlı)
  useEffect(() => {
    let cancelled = false;
    for (const type of ['mod', 'resourcepack', 'shader']) {
      window.electronAPI.listContent(instance.id, type, { meta: false })
        .then((res) => { if (!cancelled && res.ok) onCountChange(type, res.items.length); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [instance.id, onCountChange]);

  const launchingThis = launch.launchingId === instance.id;
  const runningThis = launch.runningId === instance.id;
  const busyElsewhere = !!(launch.launchingId || launch.runningId) && !launchingThis && !runningThis;

  const update = (patch) => onUpdate(instance.id, patch);

  return (
    <div className="inst page-scroll">
      <header className="inst-head">
        <InstanceIcon instance={instance} size={76} />
        <div className="inst-title">
          <h1 className="ellipsis">{instance.name}</h1>
          <p className="inst-meta">
            <span>{instanceSubtitle(instance, latestVersionId)}</span>
            <span className="dot-sep" />
            <span>{instance.lastPlayed ? t('inst.lastPlayed', { when: relativeTime(instance.lastPlayed, lang) }) : t('home.neverPlayed')}</span>
            {instance.serverAddress && <><span className="dot-sep" /><span>{instance.serverAddress}</span></>}
          </p>
        </div>
        <div className="inst-actions">
          <button
            className={`btn-play btn-play-lg${runningThis ? ' is-running' : ''}`}
            onClick={runningThis ? onStop : () => onPlay(instance)}
            disabled={launchingThis || busyElsewhere}
            title={busyElsewhere ? t('play.busyOther') : undefined}
          >
            {launchingThis ? <Loader2 size={18} className="spin" /> : runningThis ? <IconStop size={17} /> : <IconPlay size={18} />}
            <span>{runningThis ? t('play.stop') : launchingThis ? `%${launchPct ?? 0}` : t('play.now')}</span>
          </button>
          <button className="icon-btn icon-btn-framed icon-btn-lg" onClick={() => window.electronAPI.openInstanceDir(instance.id)} title={t('prof.openFolder')} aria-label={t('prof.openFolder')}>
            <FolderOpen size={18} />
          </button>
          <Menu
            trigger={({ toggle, open }) => (
              <button className="icon-btn icon-btn-framed icon-btn-lg" aria-label={t('common.more')} aria-expanded={open} onClick={toggle}>
                <MoreHorizontal size={18} />
              </button>
            )}
            items={[
              { label: t('inst.settings'), icon: <Settings2 size={15} />, onSelect: () => setTab('settings') },
              ...(instance.id !== 'default' ? [{ label: t('inst.set.delete.btn'), icon: <Trash2 size={15} />, danger: true, onSelect: onDelete }] : []),
            ]}
          />
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
            {t(`inst.tab.${id}`)}
            {tab === id && <motion.span layoutId="tab-underline" className="tab-underline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            {id !== 'settings' && counts[id] > 0 && <span className="tab-count">{counts[id]}</span>}
          </button>
        ))}
      </nav>

      <div className="inst-body">
        {tab === 'settings' ? (
          <InstanceSettings
            instance={instance}
            versionManifest={versionManifest}
            versionManifestLoading={versionManifestLoading}
            versionManifestError={versionManifestError}
            latestVersionId={latestVersionId}
            systemInfo={systemInfo}
            globalRam={globalRam}
            servers={servers}
            statuses={statuses}
            onUpdate={update}
            onDelete={onDelete}
          />
        ) : (
          <ContentList
            key={`${instance.id}-${tab}-${instance.loader}`}
            instance={instance}
            type={tab}
            onError={onError}
            onNotice={onNotice}
            onCountChange={onCountChange}
            onAdd={() => onAddContent(instance.id, tab)}
            onOpenSettings={() => setTab('settings')}
          />
        )}
      </div>
    </div>
  );
}
