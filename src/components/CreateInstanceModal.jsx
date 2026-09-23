// Yeni profil: ad + sürüm/loader. Alternatifler: .mrpack içe aktar, Modrinth'te modpack keşfet.
import { useState } from 'react';
import { FileArchive, Compass, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n.jsx';
import Modal from './Modal.jsx';
import VersionMenu from './VersionMenu.jsx';

export default function CreateInstanceModal({
  open, onClose, versionManifest, versionManifestLoading, versionManifestError,
  onCreate, onImportMrpack, onBrowseModpacks,
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [loader, setLoader] = useState('fabric');
  const [mcVersion, setMcVersion] = useState(null); // null → en yeni
  const [busy, setBusy] = useState(null); // 'create'

  const reset = () => { setName(''); setLoader('fabric'); setMcVersion(null); };
  const close = () => { if (!busy) { reset(); onClose(); } };

  const create = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setBusy('create');
    try {
      const ok = await onCreate({ name: name.trim(), mcVersion, loader });
      if (ok) { reset(); onClose(); }
    } finally {
      setBusy(null);
    }
  };

  // İçe aktarma görev olarak sürer (indirme panelinde); pencere beklemeden kapanır
  const importPack = () => {
    reset();
    onClose();
    onImportMrpack();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('inst.create.title')}
      size="md"
      footer={
        <>
          <button className="btn-ghost" onClick={close} disabled={!!busy}>{t('common.cancel')}</button>
          <button className="btn-primary" onClick={create} disabled={!name.trim() || !!busy}>
            {busy === 'create' && <Loader2 size={15} className="spin" />} {t('prof.create')}
          </button>
        </>
      }
    >
      <form className="form-stack" onSubmit={create}>
        <label className="field">
          <span>{t('inst.set.name')}</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={48} placeholder={t('prof.name.placeholder')} />
        </label>
        <div className="field">
          <span>{t('inst.set.version')}</span>
          <VersionMenu
            loaderType={loader}
            setLoaderType={setLoader}
            versionManifest={versionManifest}
            versionManifestLoading={versionManifestLoading}
            versionManifestError={versionManifestError}
            selectedVersion={mcVersion}
            setSelectedVersion={setMcVersion}
            allowLatest
            block
          />
          <em className="field-hint">{mcVersion ? t('inst.create.pinned') : t('inst.create.latest')}</em>
        </div>
      </form>

      <div className="divider-label"><span>{t('common.or')}</span></div>

      <div className="alt-actions">
        <button className="alt-action" onClick={importPack} disabled={!!busy}>
          <FileArchive size={18} />
          <span><b>{t('mods.mrpack')}</b><em>{t('mods.mrpack.desc')}</em></span>
        </button>
        <button className="alt-action" onClick={() => { close(); onBrowseModpacks(); }} disabled={!!busy}>
          <Compass size={18} />
          <span><b>{t('inst.create.browse')}</b><em>{t('inst.create.browse.desc')}</em></span>
        </button>
      </div>
    </Modal>
  );
}
