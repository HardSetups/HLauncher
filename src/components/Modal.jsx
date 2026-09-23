import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// Sola hizalı diyalog: başlık + (ikon) + içerik + sağda aksiyonlar.
// onClose verilirse Escape, arka plan tıklaması ve X düğmesi kapatır.
// tone: 'default' | 'danger' | 'success' — yalnızca ikon rengini etkiler.
function Modal({ open, onClose, icon, title, tone = 'default', size = 'sm', children, footer }) {
  useEffect(() => {
    if (!open || !onClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
        >
          <motion.div
            className={`modal modal-${size}`}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.16 }}
          >
            <div className="modal-head">
              {icon && <span className={`modal-icon tone-${tone}`}>{icon}</span>}
              {title && <h2 className="modal-title">{title}</h2>}
              {onClose && (
                <button className="icon-btn modal-close" onClick={onClose} aria-label="Kapat">
                  <X size={17} />
                </button>
              )}
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Modal;
