// Sol ray: üstte gezinme, ortada profiller (son oynanan üstte), altta yeni
// profil / ayarlar / hesap. Etiketler ipucu balonunda.
import { useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { IconHome, IconBrowse, IconServers, IconSettings, IconAdd, IconAccount } from './icons.jsx';
import { InstanceIcon } from './ui.jsx';

function RailButton({ active, label, onClick, children, className = '' }) {
  return (
    <button
      className={`rail-btn${active ? ' is-active' : ''} ${className}`}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      data-tip={label}
    >
      {children}
    </button>
  );
}

export default function Rail({ view, navigate, instances, runningId, account, onCreateInstance }) {
  const { t } = useI18n();
  const page = view.page;
  // İpucu balonu sabit konumlu: kaydırılan profil listesinde kırpılmasın
  const [tip, setTip] = useState(null);
  const showTip = (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) { setTip(null); return; }
    const r = el.getBoundingClientRect();
    setTip({ text: el.dataset.tip, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const avatar = account ? `https://minotar.net/helm/${encodeURIComponent(account.type === 'microsoft' && account.uuid ? account.uuid : account.name)}/48.png` : null;

  return (
    <nav className="rail" aria-label={t('nav.menu')} onMouseOver={showTip} onMouseLeave={() => setTip(null)} onFocus={showTip} onBlur={() => setTip(null)}>
      <div className="rail-brand" aria-hidden>
        <img src="logo.png" alt="" />
      </div>

      <div className="rail-group">
        <RailButton active={page === 'home'} label={t('nav.home')} onClick={() => navigate({ page: 'home' })}><IconHome /></RailButton>
        <RailButton active={page === 'browse'} label={t('nav.browse')} onClick={() => navigate({ page: 'browse' })}><IconBrowse /></RailButton>
        <RailButton active={page === 'servers'} label={t('nav.servers')} onClick={() => navigate({ page: 'servers' })}><IconServers /></RailButton>
      </div>

      <div className="rail-sep" />

      <div className="rail-instances">
        {instances.map((inst) => {
          const active = page === 'instance' && view.id === inst.id;
          return (
            <RailButton
              key={inst.id}
              active={active}
              label={inst.name}
              className="rail-inst"
              onClick={() => navigate({ page: 'instance', id: inst.id })}
            >
              <InstanceIcon instance={inst} size={34} />
              {runningId === inst.id && <span className="rail-running" />}
            </RailButton>
          );
        })}
        <RailButton label={t('inst.new')} onClick={onCreateInstance} className="rail-add"><IconAdd size={20} /></RailButton>
      </div>

      <div className="rail-group rail-bottom">
        <RailButton active={page === 'settings'} label={t('nav.settings')} onClick={() => navigate({ page: 'settings' })}><IconSettings /></RailButton>
        <RailButton active={page === 'account'} label={account?.name || t('nav.account')} onClick={() => navigate({ page: 'account' })} className="rail-account">
          {avatar ? <img className="rail-avatar" src={avatar} alt="" /> : <IconAccount />}
        </RailButton>
      </div>

      {tip && <div className="rail-tip" style={{ top: tip.top, left: tip.left }} role="tooltip">{tip.text}</div>}
    </nav>
  );
}
