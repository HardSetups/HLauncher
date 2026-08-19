// İlk açılış sihirbazı: dil → hesap → RAM önerisi. settings.onboarded=true olunca kapanır.
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { contrastText } from '../utils/color';
import { useI18n } from '../i18n.jsx';
import AccountPanel from './AccountPanel.jsx';

function Onboarding({ accent, account, setAccount, systemInfo, updateSetting, onError, onFinish }) {
  const { t, lang, setLang } = useI18n();
  const [step, setStep] = useState(0);

  const totalMem = systemInfo.totalMemGb || 16;
  const recommended = Math.min(8, Math.max(2, Math.floor(totalMem / 2)));
  const onAccent = contrastText(accent);

  const finish = () => {
    updateSetting('ram', recommended);
    updateSetting('onboarded', true);
    onFinish();
  };

  const btnStyle = {
    background: accent, color: onAccent, border: 'none', borderRadius: '12px',
    padding: '14px 32px', fontWeight: '700', cursor: 'pointer', fontSize: '15px',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }}
        style={{ background: '#101115', border: `1px solid ${accent}4d`, borderTop: `3px solid ${accent}`, borderRadius: '14px', padding: '44px', maxWidth: '540px', width: '100%' }}
      >
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} style={{ textAlign: 'center' }}>
              <img src="logo.png" alt="" style={{ width: '80px', marginBottom: '20px' }} />
              <h2 style={{ fontSize: '26px', fontWeight: '800', marginBottom: '12px' }}>{t('ob.welcome')}</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '28px', lineHeight: 1.6 }}>{t('ob.welcome.desc')}</p>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '32px' }}>
                {[{ id: 'tr', label: '🇹🇷 Türkçe' }, { id: 'en', label: '🇬🇧 English' }].map((l) => (
                  <button
                    key={l.id}
                    onClick={() => { setLang(l.id); updateSetting('language', l.id); }}
                    style={{
                      padding: '12px 24px', borderRadius: '12px', fontWeight: '700', fontSize: '14px',
                      background: lang === l.id ? accent : 'rgba(255,255,255,0.06)',
                      color: lang === l.id ? onAccent : 'rgba(255,255,255,0.7)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(1)} style={btnStyle}>{t('common.continue')}</button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '20px', textAlign: 'center' }}>{t('ob.account.title')}</h2>
              <AccountPanel
                account={account}
                setAccount={setAccount}
                accent={accent}
                onError={onError}
                onDone={() => setStep(2)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                <button onClick={() => setStep(0)} style={{ background: 'none', color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>← {t('common.back')}</button>
                <button onClick={() => setStep(2)} style={{ background: 'none', color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>
                  {account ? t('common.continue') : t('ob.account.skip')} →
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '16px' }}>{t('ob.ram.title')}</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '20px', lineHeight: 1.6 }}>
                {t('ob.ram.desc', { total: totalMem, rec: recommended })}
              </p>
              <div style={{ fontSize: '44px', fontWeight: '900', color: accent, marginBottom: '28px' }}>{recommended} GB</div>
              <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '28px' }}>{t('ob.done')}</p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                <button onClick={() => setStep(1)} style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', borderRadius: '12px', padding: '14px 24px', fontWeight: '700' }}>
                  ← {t('common.back')}
                </button>
                <button onClick={finish} style={btnStyle}>{t('common.finish')}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export default Onboarding;
