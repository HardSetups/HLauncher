import { motion, AnimatePresence } from 'framer-motion';

function Modal({ open, icon, title, accentColor = '#3b82f6', children, footer }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998 }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
            style={{ background: '#0f0f1a', border: `1px solid ${accentColor}4d`, borderRadius: '20px', padding: '40px', maxWidth: '440px', width: '100%', textAlign: 'center' }}
          >
            {icon && <div style={{ fontSize: '44px', marginBottom: '16px' }}>{icon}</div>}
            {title && <h3 style={{ fontSize: '20px', fontWeight: '800', color: accentColor, marginBottom: '12px' }}>{title}</h3>}
            {children}
            {footer}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default Modal;
