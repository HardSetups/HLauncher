// "Sorun bildir" (sözleşme §10): konu + açıklama + günlük dosyaları.
// Gönderilecek içerik ÖNCEDEN gösterilir (temizlenmiş hâli), onay kutusu varsayılan
// olarak işaretsizdir; onaysız hiçbir şey gönderilmez.
import { useState, useEffect } from 'react';
import { LifeBuoy, Loader2, Send, ChevronRight, ExternalLink, Link2 } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import Modal from './Modal.jsx';
import { formatSize } from '../utils/format.js';
import { portalErrorText } from '../utils/portal.js';

// §10 hataları → oyuncu metni (bilinmeyenler sunucunun mesajı + destek kodu)
function reportErrorText(t, error) {
  const d = error?.details || {};
  switch (error?.code) {
    case 'REPORT_DISABLED': return t('hs.report.disabled');
    case 'TICKET_DUPLICATE': return t('hs.report.duplicate', { ticket: d.ticketNo ?? '' });
    case 'TICKET_OPEN_LIMIT': return t('hs.report.openLimit');
    case 'ATTACHMENT_LIMIT': return t('hs.report.tooManyFiles'); // v1.7.1 (sunucu v0.9.1+)
    case 'ATTACHMENT_REJECTED': return d.reason === 'tooManyFiles' ? t('hs.report.tooManyFiles') : t('hs.report.fileRejected'); // v0.9.0 5+ dosyayı da böyle döndürür
    case 'PAYLOAD_TOO_LARGE': return t('hs.report.tooLarge');
    case 'RATE_LIMITED': return t('hs.report.rateLimited');
    default: return portalErrorText(t, error);
  }
}

const SUBJECT_MIN = 5;
const MESSAGE_MIN = 10;

export default function ReportModal({ open, onClose, portal, instance = null, defaultSubject = '', onConnect, onNotice }) {
  const { t } = useI18n();
  const api = window.electronAPI;
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [openPreview, setOpenPreview] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSubject(defaultSubject); setMessage(''); setConsent(false); setError(null); setFiles(null); setOpenPreview(null);
    api.portalReportPreview(instance?.id || null).then((res) => {
      const list = res.ok ? res.files : [];
      setFiles(list);
      setSelected(new Set(list.map((f) => f.id)));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instance?.id]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const send = async () => {
    setBusy(true); setError(null);
    try {
      const res = await api.portalReportSend({ instanceId: instance?.id || null, subject, message, fileIds: [...selected], consent });
      if (!res.ok) { setError(reportErrorText(t, res.error)); return; }
      onClose();
      onNotice(t('hs.report.sent', { ticket: res.ticketNo || '' }));
      if (res.url) api.portalOpenUrl(res.url);
    } finally { setBusy(false); }
  };

  const signedIn = !!portal?.signedIn && !portal?.outdated;
  const tooShort = subject.trim().length < SUBJECT_MIN || message.trim().length < MESSAGE_MIN;
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      icon={<LifeBuoy size={18} />}
      size="md"
      title={t('hs.report.title')}
      footer={signedIn ? (
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={send} disabled={busy || !consent || tooShort}>
            {busy ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {t('hs.report.send')}
          </button>
        </>
      ) : (
        <>
          <button className="btn-ghost" onClick={() => api.portalOpenLink('support')}><ExternalLink size={15} /> {t('hs.report.site')}</button>
          <button className="btn-primary" onClick={() => { onClose(); onConnect(); }}><Link2 size={15} /> {t('hs.connect')}</button>
        </>
      )}
    >
      {!signedIn ? (
        <p className="modal-text">{t('hs.report.needAccount')}</p>
      ) : (
        <div className="report">
          <label className="field">
            <span>{t('hs.report.subject')}</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} autoFocus />
          </label>
          <label className="field">
            <span>{t('hs.report.message')}</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={20000} rows={4} placeholder={t('hs.report.messagePh')} />
            {tooShort && (subject || message) && <span className="field-hint">{t('hs.report.minLength', { subject: SUBJECT_MIN, message: MESSAGE_MIN })}</span>}
          </label>
          <div className="field">
            <span>{t('hs.report.files')}</span>
            {files === null ? <Loader2 size={16} className="spin" /> : files.length === 0 ? <em className="field-hint">{t('hs.report.noFiles')}</em> : (
              <ul className="report-files">
                {files.map((f) => (
                  <li key={f.id}>
                    <label className="check-row report-file">
                      <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
                      <span>{f.name} <em>{formatSize(f.size)}</em></span>
                      <button type="button" className="link-btn" onClick={(e) => { e.preventDefault(); setOpenPreview(openPreview === f.id ? null : f.id); }}>
                        <ChevronRight size={13} className={openPreview === f.id ? 'rot90' : ''} /> {t('hs.report.preview')}
                      </button>
                    </label>
                    {openPreview === f.id && <pre className="report-preview">{f.preview}</pre>}
                  </li>
                ))}
              </ul>
            )}
            <span className="field-hint">{t('hs.report.cleaned')}</span>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t('hs.report.consent')}</span>
          </label>
          {error && <p className="buy-warn" style={{ whiteSpace: 'pre-wrap' }}>{error}</p>}
        </div>
      )}
    </Modal>
  );
}
