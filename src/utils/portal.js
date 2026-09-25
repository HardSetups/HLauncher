// HardSetups portal yardımcıları (renderer).

/** API hatasından kullanıcı metni; varsa "Destek kodu: …" satırı eklenir. */
export function portalErrorText(t, error) {
  if (!error) return '';
  if (error.code === 'PORTAL_UNAVAILABLE') return t('hs.unavailable');
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

/** Sunucu resmi → ana süreç önbelleği adresi (hlimg://c/<base64url>). Denetim ana süreçte de yapılır. */
export function toImageSrc(url) {
  if (typeof url !== 'string' || !url) return null;
  const bytes = new TextEncoder().encode(url);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return `hlimg://c/${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

/** İzinli host'taysa önbellek adresi, değilse null (yedek ikon gösterilir). */
export function imgSrc(url, hosts) {
  return allowedImage(url, hosts) ? toImageSrc(url) : null;
}
