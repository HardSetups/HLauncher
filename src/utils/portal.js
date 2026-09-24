// HardSetups portal yardımcıları (renderer).

/** API hatasından kullanıcı metni; varsa "Destek kodu: …" satırı eklenir. */
export function portalErrorText(t, error) {
  if (!error) return '';
  const msg = error.message || t('hs.error.generic');
  return error.requestId ? `${msg}\n${t('hs.supportCode', { code: error.requestId })}` : msg;
}
