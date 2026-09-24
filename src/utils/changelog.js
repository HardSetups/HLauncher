// "Bu sürümde neler var" (sözleşme C4): notlar derleme sırasında CHANGELOG.md'den
// pakete gömülür; ağa gerek yok, launcher'daki sürümle birebir aynı metin.
import changelog from '../../CHANGELOG.md?raw';

/** "## <sürüm>" bölümünün gövdesi; yoksa null. */
export function notesFor(version) {
  if (!version) return null;
  const start = changelog.indexOf(`## ${version}`);
  if (start < 0) return null;
  const next = changelog.indexOf('\n## ', start + 3);
  const body = changelog.slice(changelog.indexOf('\n', start) + 1, next < 0 ? undefined : next).trim();
  return body || null;
}
