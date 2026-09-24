// Para gösterimi (sözleşme §0): tutarlar minor birimde STRING gelir ("12990" = 129,90 TL).
// Hesap BigInt ile yapılır, float'a hiç çevrilmez; Intl.NumberFormat ondalıklı
// dizeyi tam değer olarak biçimlendirir.

/** "12990" → "129,90 ₺" (tr) | "₺129.90" (en). Geçersiz girdide boş dize. */
export function formatMinor(minor, currency = 'TRY', lang = 'tr') {
  if (typeof minor !== 'string' || !/^-?\d+$/.test(minor)) return '';
  const value = BigInt(minor);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const decimal = `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
  try {
    return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'tr-TR', { style: 'currency', currency }).format(decimal);
  } catch {
    return `${decimal} ${currency}`;
  }
}

/** İki minor tutarın farkı (string). */
export function subtractMinor(a, b) {
  return String(BigInt(a) - BigInt(b));
}
