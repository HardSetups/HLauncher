// Sağ altta yüzen indirme paneli: süren görevler + oyun hazırlığı.
// Başlıkta toplam ilerleme; açılınca her görev ayrı satırda.
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, X, AlertCircle, Loader2, Package, Download, RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import { useTasks } from '../tasks.jsx';
import { IconPlay } from './icons.jsx';

// Tema hareket eğrisi (index.css --ease ile aynı)
const EASE = [0.2, 0.8, 0.2, 1];

function progressText(t, p) {
  if (!p) return '';
  return p.key ? t(p.key, p.params) : (p.message || '');
}

function TaskRow({ task, onDismiss }) {
  const { t } = useI18n();
  const running = task.status === 'running';
  const detail = task.status === 'error'
    ? task.error
    : task.status === 'done'
      ? t('dl.done')
      : (progressText(t, task.progress) || task.subtitle || t('dl.starting'));
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.18, ease: EASE }}
      className={`dl-row is-${task.status}`}
    >
      <span className="dl-icon">
        {task.iconUrl ? <img src={task.iconUrl} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : task.kind === 'launch' ? <IconPlay size={15} /> : task.kind === 'update' ? <RefreshCw size={15} /> : <Package size={15} />}
      </span>
      <span className="dl-body">
        <span className="dl-title ellipsis">{task.title}</span>
        <span className="dl-detail ellipsis" title={detail}>{detail}</span>
        {running && (
          <span className={`dl-track${task.pct == null ? ' is-indeterminate' : ''}`}>
            <span className="dl-fill" style={task.pct == null ? undefined : { width: `${task.pct}%` }} />
          </span>
        )}
      </span>
      <span className="dl-status">
        {running && task.pct != null && <span className="dl-pct">%{task.pct}</span>}
        {task.status === 'done' && <Check size={16} className="dl-ok" />}
        {task.status === 'error' && <AlertCircle size={16} className="dl-err" />}
        {!running && !['launch', 'update'].includes(task.kind) && (
          <button className="icon-btn dl-dismiss" onClick={() => onDismiss(task.id)} aria-label={t('dl.dismiss')}><X size={14} /></button>
        )}
      </span>
    </motion.li>
  );
}

export default function DownloadBar({ extraTasks = [] }) {
  const { t } = useI18n();
  const { tasks, dismissTask } = useTasks();
  const [open, setOpen] = useState(true);

  const all = [...extraTasks, ...tasks];
  const running = all.filter((x) => x.status === 'running');
  const errors = all.filter((x) => x.status === 'error');
  const known = running.filter((x) => x.pct != null);
  const overall = known.length ? Math.round(known.reduce((s, x) => s + x.pct, 0) / known.length) : null;

  // Her şey başarıyla bitince panel başlığa iner: bitmiş satırlar (5 sn kalır) sağ alttaki
  // düğmeleri örtmesin (ör. kurulumdan hemen sonra kütüphane kartındaki "Oyna"). Yeni bir görev
  // başlayınca yeniden açılır; hata varsa açık kalır (ayrıntı okunmalı).
  // (Önceki değere göre çizim sırasında ayarlanır: React'in "prop değişince durum" kalıbı)
  const [prevRunning, setPrevRunning] = useState(running.length);
  if (running.length !== prevRunning) {
    setPrevRunning(running.length);
    if (running.length > prevRunning) setOpen(true);
    else if (running.length === 0 && errors.length === 0) setOpen(false);
  }

  const headline = running.length
    ? t('dl.running', { count: running.length })
    : errors.length ? t('dl.failed', { count: errors.length }) : t('dl.allDone');

  return (
    <AnimatePresence>
      {all.length > 0 && (
        <motion.section
          className="dl-panel"
          aria-label={t('dl.title')}
          initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          <button className="dl-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <span className={`dl-head-icon${running.length ? ' is-busy' : errors.length ? ' is-error' : ' is-done'}`}>
              {running.length ? <Loader2 size={15} className="spin" /> : errors.length ? <AlertCircle size={15} /> : <Download size={15} />}
            </span>
            <span className="dl-head-text">
              <b>{headline}</b>
              {overall != null && <span>%{overall}</span>}
            </span>
            <ChevronDown size={16} className={`dl-chevron${open ? ' is-open' : ''}`} />
          </button>
          {running.length > 0 && !open && (
            <span className={`dl-track dl-head-track${overall == null ? ' is-indeterminate' : ''}`}>
              <span className="dl-fill" style={overall == null ? undefined : { width: `${overall}%` }} />
            </span>
          )}
          <AnimatePresence initial={false}>
            {open && (
              <motion.ul
                className="dl-list"
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
              >
                <AnimatePresence initial={false}>
                  {all.map((task) => <TaskRow key={task.id} task={task} onDismiss={dismissTask} />)}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
