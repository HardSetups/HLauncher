// Keşfet: Modrinth'te mod / kaynak paketi / shader / modpack ara ve hedef
// profile kur. Modpack kurulumu yeni profil oluşturur.
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Download, Heart, Clock, Check, Loader2, ChevronDown, ArrowUpDown, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useI18n } from '../i18n.jsx';
import { useTasks } from '../tasks.jsx';
import { InstanceIcon, Menu, EmptyState } from './ui.jsx';
import { compactNumber, relativeTime, instanceSubtitle, MODDED_LOADERS } from '../utils/format.js';

const TYPES = ['mod', 'resourcepack', 'shader', 'modpack'];
const SORTS = ['relevance', 'downloads', 'follows', 'updated', 'newest'];
const PAGE = 20;

export default function BrowsePage({
  instances, initialInstanceId, initialType, latestVersionId,
  onError, onInstancesRefresh,
}) {
  const { t, lang } = useI18n();
  const api = window.electronAPI;
  const [type, setType] = useState(initialType || 'mod');
  const [targetId, setTargetId] = useState(initialInstanceId || instances[0]?.id || 'default');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('relevance');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [installed, setInstalled] = useState(new Set()); // hedef profilde kurulu proje id'leri (diskten)
  const reqId = useRef(0);
  const { tasks, runTask } = useTasks();

  const target = instances.find((i) => i.id === targetId) || instances[0];
  const isModpack = type === 'modpack';
  const mcVersion = isModpack ? null : (target?.mcVersion || latestVersionId || null);
  const loader = target?.loader;
  const modsBlocked = type === 'mod' && target && !MODDED_LOADERS.includes(loader);

  // Hedef profilde neler kurulu? (Kur düğmesini "Kurulu" göstermek için)
  useEffect(() => {
    if (isModpack || !target) return undefined;
    let cancelled = false;
    api.listContent(target.id, type)
      .then((res) => { if (!cancelled && res.ok) setInstalled(new Set(res.items.map((i) => i.projectId).filter(Boolean))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [api, target, type, isModpack]);

  const runSearch = useCallback(async (offset) => {
    const id = ++reqId.current;
    if (offset) setLoadingMore(true); else setLoading(true);
    try {
      const res = await api.searchContent({
        query: query.trim(), type, mcVersion, loader,
        sort: sort === 'relevance' && !query.trim() ? 'downloads' : sort,
        limit: PAGE, offset,
      });
      if (id !== reqId.current) return; // daha yeni bir arama başladı
      if (!res.ok) { onError(res.error); return; }
      setTotal(res.total);
      setResults((prev) => (offset ? [...prev, ...res.hits] : res.hits));
    } catch (err) {
      if (id === reqId.current) onError(String(err?.message || err));
    } finally {
      if (id === reqId.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [api, query, type, mcVersion, loader, sort, onError]);

  // Yazarken 350ms bekle; tür/sıralama/hedef değişince hemen ara
  useEffect(() => {
    const timer = setTimeout(() => runSearch(0), query ? 350 : 0);
    return () => clearTimeout(timer);
  }, [runSearch, query]);

  // Kurulumlar uygulama geneli görev olarak yürür: sayfadan çıkılsa da sürer,
  // ilerleme ve sonuç alttaki indirme panelinde görünür.
  const taskFor = (hit) => tasks.find((x) => x.projectId === hit.id && (isModpack ? x.kind === 'modpack' : x.instanceId === target?.id));
  const install = async (hit) => {
    if (isModpack) {
      const res = await runTask(
        { kind: 'modpack', title: hit.title, subtitle: t('browse.type.modpack'), iconUrl: hit.iconUrl, projectId: hit.id },
        (taskId) => api.installModpack(hit.id, taskId),
      );
      if (res?.ok) onInstancesRefresh();
      return;
    }
    const res = await runTask(
      { kind: type, title: hit.title, subtitle: target.name, iconUrl: hit.iconUrl, projectId: hit.id, instanceId: target.id },
      (taskId) => api.installContent(target.id, type, hit.id, taskId),
    );
    if (res?.ok) setInstalled((prev) => new Set(prev).add(hit.id));
  };

  return (
    <div className="browse page-scroll">
      <header className="page-head">
        <div>
          <h1>{t('browse.title')}</h1>
          <p className="page-sub">{t('browse.sub')}</p>
        </div>
        {!isModpack && target && (
          <Menu
            align="end"
            width={300}
            trigger={({ toggle, open }) => (
              <button className="target-picker" onClick={toggle} aria-expanded={open}>
                <span className="target-caption">{t('browse.installTo')}</span>
                <InstanceIcon instance={target} size={28} />
                <span className="target-text">
                  <b className="ellipsis">{target.name}</b>
                  <span className="ellipsis">{instanceSubtitle(target, latestVersionId)}</span>
                </span>
                <ChevronDown size={16} className="muted" />
              </button>
            )}
          >
            {(close) => instances.map((inst) => (
              <button key={inst.id} role="menuitemradio" aria-checked={inst.id === target.id}
                className={`menu-item menu-item-inst${inst.id === target.id ? ' is-selected' : ''}`}
                onClick={() => { setTargetId(inst.id); close(); }}
              >
                <InstanceIcon instance={inst} size={26} />
                <span className="target-text">
                  <b className="ellipsis">{inst.name}</b>
                  <span className="ellipsis">{instanceSubtitle(inst, latestVersionId)}</span>
                </span>
                {inst.id === target.id && <Check size={15} />}
              </button>
            ))}
          </Menu>
        )}
      </header>

      <nav className="tabs" role="tablist">
        {TYPES.map((id) => (
          <button key={id} role="tab" aria-selected={type === id} className={`tab${type === id ? ' is-active' : ''}`} onClick={() => setType(id)}>
            {t(`browse.type.${id}`)}
            {type === id && <motion.span layoutId="tab-underline" className="tab-underline" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          </button>
        ))}
        {!loading && <span className="result-count">{t('browse.results', { count: compactNumber(total, lang) })}</span>}
      </nav>

      <div className="toolbar">
        <label className="search-field search-field-grow">
          <Search size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(`browse.search.${type}`)} />
        </label>
        <Menu
          align="end"
          trigger={({ toggle, open }) => (
            <button className="btn-secondary" onClick={toggle} aria-expanded={open}>
              <ArrowUpDown size={15} /> {t(`browse.sort.${sort}`)} <ChevronDown size={15} className="muted" />
            </button>
          )}
          items={SORTS.map((s) => ({ label: t(`browse.sort.${s}`), icon: sort === s ? <Check size={15} /> : <span className="menu-icon-space" />, onSelect: () => setSort(s) }))}
        />
      </div>

      {modsBlocked && (
        <div className="banner">
          <AlertCircle size={16} />
          <span>{t('browse.modsBlocked', { name: target.name })}</span>
        </div>
      )}
      {loading && results.length === 0 ? (
        <div className="list-skeleton">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton-row is-tall" />)}</div>
      ) : results.length === 0 ? (
        <EmptyState icon={<Search size={26} />} title={t('browse.none')} text={t('browse.noneText')} />
      ) : (
        <div className={`results${loading ? ' is-refreshing' : ''}`}>
          {results.map((hit) => {
            const task = taskFor(hit);
            const busy = task?.status === 'running';
            const isInstalled = installed.has(hit.id) || task?.status === 'done';
            return (
              <article key={hit.id} className="result">
                <span className="result-icon">
                  {hit.iconUrl ? <img src={hit.iconUrl} alt="" loading="lazy" /> : <span className="result-icon-empty" />}
                </span>
                <div className="result-body">
                  <h3 className="result-title">
                    <span className="ellipsis">{hit.title}</span>
                    {hit.author && <span className="result-author">{t('browse.by', { author: hit.author })}</span>}
                  </h3>
                  <p className="result-desc">{hit.description}</p>
                  <div className="result-meta">
                    <span title={t('browse.downloads')}><Download size={13} /> {compactNumber(hit.downloads, lang)}</span>
                    <span title={t('browse.follows')}><Heart size={13} /> {compactNumber(hit.follows, lang)}</span>
                    {hit.updatedAt && <span title={t('browse.updated')}><Clock size={13} /> {relativeTime(hit.updatedAt, lang)}</span>}
                    {hit.categories.map((c) => <span key={c} className="result-cat">{c}</span>)}
                  </div>
                </div>
                <div className="result-action">
                  {isInstalled && !isModpack ? (
                    <span className="installed-label"><Check size={15} /> {t('browse.installed')}</span>
                  ) : (
                    <button className="btn-primary install-btn" onClick={() => install(hit)} disabled={busy || modsBlocked}>
                      {busy ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                      <span>{busy ? (task.pct != null ? `%${task.pct}` : t('mods.installing')) : isModpack ? t('browse.installPack') : t('mods.install')}</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {results.length < total && (
            <button className="btn-secondary load-more" onClick={() => runSearch(results.length)} disabled={loadingMore}>
              {loadingMore ? <Loader2 size={15} className="spin" /> : null} {t('browse.more')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
