// HardSetups portal yardımcıları (renderer).

/** API hatasından kullanıcı metni; varsa "Destek kodu: …" satırı eklenir. */
export function portalErrorText(t, error) {
  if (!error) return '';
  const msg = error.message || t('hs.error.generic');
  return error.requestId ? `${msg}\n${t('hs.supportCode', { code: error.requestId })}` : msg;
}

/**
 * Sunucunun verdiği resim adresi gösterilebilir mi? (sözleşme §2: yalnızca imageHosts)
 * Listede olmayan adres hiç yüklenmez; kart yerine yedek ikon gösterir.
 */
export function allowedImage(url, hosts) {
  if (typeof url !== 'string' || !Array.isArray(hosts) || !hosts.length) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname))) return null;
  const host = u.hostname.toLowerCase();
  const ok = hosts.some((h) => {
    const p = String(h).toLowerCase();
    return p.startsWith('*.') ? host.endsWith(p.slice(1)) : host === p;
  });
  return ok ? url : null;
}
