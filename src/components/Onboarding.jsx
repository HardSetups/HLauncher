// İlk açılış sihirbazı: dil + renk → hesap → bellek. settings.onboarded=true olunca kapanır.
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { contrastText } from '../utils/color';
import { ACCENTS } from '../utils/accents.js';
import { useI18n } from '../i18n.jsx';
import AccountPanel from './AccountPanel.jsx';

const ACCENT_CHOICES = ACCENTS.map((a) => a.color);
const STEPS = 3;

function Onboarding({ accent, account, setAccount, systemInfo, updateSetting, onError, onFinish }) {
  const { t, lang, setLang } = useI18n();
  const [step, setStep] = useState(0);

  const totalMem = systemInfo.totalMemGb || 16;
  const recommended = Math.min(8, Math.max(2, Math.floor(totalMem / 2)));

  const finish = () => {
    updateSetting('ram', recommended);
    updateSetting('onboarded', true);
    onFinish();
  };

  const slide = { initial: { opacity: 0, x: 12 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -12 }, transition: { duration: 0.18 } };

  return (
    <motion.div className="modal-backdrop is-solid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="modal modal-md onboarding">
        <div className="ob-progress" aria-hidden>
          {Array.from({ length: STEPS }, (_, i) => <span key={i} className={i <= step ? 'is-done' : ''} />)}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s0" {...slide} className="ob-step">
              <img src="logo.png" alt="" className="ob-logo" />
              <h2 className="modal-title">{t('ob.welcome')}</h2>
              <p className="ob-text">{t('ob.welcome.desc')}</p>

              <div className="field">
                <span>{t('set.language')}</span>
                <div className="seg">
                  {[{ id: 'tr', label: 'Türkçe' }, { id: 'en', label: 'English' }].map((l) => (
                    <button key={l.id} className={`seg-btn${lang === l.id ? ' is-active' : ''}`}
                      onClick={() => { setLang(l.id); updateSetting('language', l.id); }}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>{t('set.accent')}</span>
                <div className="swatches">
                  {ACCENT_CHOICES.map((c) => (
                    <button key={c} className={`swatch${accent === c ? ' is-selected' : ''}`} style={{ background: c }}
                      onClick={() => updateSetting('accent', c)} aria-label={c} aria-pressed={accent === c}>
                      {accent === c && <Check size={15} color={contrastText(c)} strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="modal-foot">
                <button className="btn-primary" onClick={() => setStep(1)}>{t('common.continue')}</button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="s1" {...slide} className="ob-step">
              <h2 className="modal-title">{t('ob.account.title')}</h2>
              <AccountPanel account={account} setAccount={setAccount} onError={onError} onDone={() => setStep(2)} />
              <div className="modal-foot">
                <button className="btn-ghost" onClick={() => setStep(0)}>{t('common.back')}</button>
                <button className={account ? 'btn-primary' : 'btn-ghost'} onClick={() => setStep(2)}>
                  {account ? t('common.continue') : t('ob.account.skip')}
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" {...slide} className="ob-step">
              <h2 className="modal-title">{t('ob.ram.title')}</h2>
              <p className="ob-text">{t('ob.ram.desc', { total: totalMem, rec: recommended })}</p>
              <div className="ob-ram">{recommended} GB</div>
              <p className="ob-text">{t('ob.done')}</p>
              <div className="modal-foot">
                <button className="btn-ghost" onClick={() => setStep(1)}>{t('common.back')}</button>
                <button className="btn-primary" onClick={finish}>{t('common.finish')}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default Onboarding;
