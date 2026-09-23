// Launcher güncellemesi hazır: sürüm notları + "şimdi yeniden başlat / sonra".
// Oyun açıkken yeniden başlatma kapalı (launcher kapanınca oyun da kapanabilir);
// "Sonra" seçilirse güncelleme launcher kapanırken sessizce kurulur.
import { RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import Modal from './Modal.jsx';

export default function UpdateModal({ open, status, gameBusy, onClose }) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<RefreshCw size={18} />}
      tone="success"
      size="md"
      title={t('upd.modal.title', { version: status?.version || '' })}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>{t('upd.later')}</button>
          <button
            className="btn-primary"
            onClick={() => window.electronAPI.installAppUpdate()}
            disabled={gameBusy}
            title={gameBusy ? t('upd.gameRunning') : undefined}
            autoFocus
          >
            {t('upd.installNow')}
          </button>
        </>
      }
    >
      <p className="modal-text">{gameBusy ? t('upd.gameRunning') : t('upd.modal.text')}</p>
      {status?.notes && (
        <div className="release-notes">
          <span className="release-notes-title">{t('upd.notes')}</span>
          <p>{status.notes}</p>
        </div>
      )}
    </Modal>
  );
}
