// Giriş kapısı (alpha.7): HardSetups hesabı zorunlu. Saf yardımcılar; tests/unit.test.cjs sınar
// (dosya CJS testinde metin olarak okunur: yalnızca düz `export function` kullan, import yok).

/**
 * Portal özetinden hangi ekranın görüneceği.
 * 'loading'     → ilk IPC yanıtı henüz gelmedi: kısa açılış ekranı (giriş yapmış oyuncu giriş ekranını hiç görmez)
 * 'app'         → oturum var. Oturum ana süreçte şifreli dosyadan yüklenir ve ağ hatası onu kapatmaz,
 *                 yani daha önce giriş yapmış oyuncu internetsiz de launcher'ı açar.
 * 'outdated'    → launcher sürümü sunucunun en düşük sürümünün altında: giriş yapılamaz, güncelleme gerekir
 * 'maintenance' → HardSetups bakımda: giriş düğmeleri pasif
 * 'unavailable' → sunucu hesap uçlarını henüz açmadı (404): giriş denenemez, yeniden denetlenebilir
 * 'login'       → giriş / kayıt ekranı
 */
export function authView(portal) {
  if (!portal) return 'loading';
  if (portal.signedIn) return 'app';
  if (portal.outdated) return 'outdated';
  if (portal.maintenance) return 'maintenance';
  if (portal.accountAvailable === false) return 'unavailable';
  return 'login';
}

/**
 * Oturum kapanış nedeni giriş ekranında "bu cihazın bağlantısı kaldırıldı" bildirimi gerektiriyor mu?
 * Oyuncunun kendi çıkışı ('logout') ve bilinmeyen nedenler bildirim göstermez.
 */
export function isRevokedReason(reason) {
  return reason === 'DEVICE_REVOKED' || reason === 'REFRESH_TOKEN_INVALID';
}

/** Başlatma hatası giriş kartında gösterilsin mi? Bu kodlar zaten ekranın kendisini değiştirir. */
export function isStateError(error) {
  return ['PORTAL_UNAVAILABLE', 'MAINTENANCE_MODE', 'LAUNCHER_OUTDATED'].includes(error?.code);
}
