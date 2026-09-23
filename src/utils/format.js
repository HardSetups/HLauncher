// Görüntüleme biçimlendiricileri (dil duyarlı).
const locale = (lang) => (lang === 'tr' ? 'tr-TR' : 'en-US');

export const LOADER_LABELS = { release: 'Vanilla', optifine: 'OptiFine', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
export const MODDED_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];

/** 12.4K / 1,2 Mn gibi kısa sayı. */
export function compactNumber(n, lang) {
  return new Intl.NumberFormat(locale(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);
}

export function fullNumber(n, lang) {
  return new Intl.NumberFormat(locale(lang)).format(n || 0);
}

/** "3 saat önce" — tarih yoksa null. */
export function relativeTime(value, lang) {
  if (!value) return null;
  const ts = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  const diff = (ts - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' });
  const steps = [[60, 'second'], [3600, 'minute'], [86400, 'hour'], [604800, 'day'], [2629800, 'week'], [31557600, 'month'], [Infinity, 'year']];
  const divisors = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 };
  for (const [limit, unit] of steps) {
    if (Math.abs(diff) < limit) return rtf.format(Math.round(diff / divisors[unit]), unit);
  }
  return null;
}

export function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Profilin "Fabric 1.21.4" satırı; sürüm yoksa en yeni release'e düşer. */
export function instanceSubtitle(instance, latestVersionId) {
  if (!instance) return '';
  const version = instance.mcVersion || latestVersionId || '';
  return `${LOADER_LABELS[instance.loader] || instance.loader} ${version}`.trim();
}
