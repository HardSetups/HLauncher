// Cihaz kodu girişi (sözleşme §1, RFC 8628) için ortak durum makinesi. Giriş ekranı ve Hesap
// sayfasındaki bağlanma penceresi aynı mantığı kullanır. Renderer yalnızca userCode ve onay
// adresini görür; deviceCode ve token'lar ana süreçte kalır.
import { useState, useEffect, useRef, useCallback } from 'react';

const ENDED = new Set(['denied', 'expired', 'error']);

/**
 * status: 'idle' | 'starting' | 'waiting' | 'success' | 'denied' | 'expired' | 'error'
 * flow:   { userCode, verificationUri, expiresIn, register } | null
 * error:  { code, message, requestId } | null — portalErrorText(t, error) ile metne çevrilir
 */
export function useDeviceLogin() {
  const api = window.electronAPI;
  const [status, setStatus] = useState('idle');
  const [flow, setFlow] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  // Bu bileşen bir akış yürütüyor mu? Başkasının başlattığı akışın olayları yok sayılır.
  const active = useRef(false);
  // Her başlatma/iptal sayacı artırır: geç gelen eski yanıtlar böylece ayıklanır.
  const seq = useRef(0);
  const copyTimer = useRef(null);

  useEffect(() => api.onPortalLogin((res) => {
    if (!active.current) return;
    if (res.state === 'success') { active.current = false; setStatus('success'); }
    else if (res.state === 'denied' || res.state === 'expired') { active.current = false; setStatus(res.state); }
    else if (res.state === 'error') { active.current = false; setError(res.error || {}); setStatus('error'); }
    // 'canceled': yeni akış eskisini iptal edince gelir; yok sayılır
  }), [api]);

  // Bileşen kalkarken (ör. oturum açıldı, kapı kalktı) yarım kalan akış ana süreçte iptal edilir.
  // Akış zaten bittiyse ana süreçteki iptal bir şey yapmaz.
  useEffect(() => () => {
    clearTimeout(copyTimer.current);
    if (active.current) {
      active.current = false;
      api.portalLoginCancel().catch(() => {});
    }
  }, [api]);

  const start = useCallback(async ({ register = false } = {}) => {
    const mine = ++seq.current;
    active.current = true;
    setStatus('starting');
    setFlow(null);
    setError(null);
    setCopied(false);
    let res;
    try {
      res = await api.portalLoginStart(register ? { register: true } : undefined);
    } catch (err) {
      res = { ok: false, error: { message: String(err?.message || err) } };
    }
    if (mine !== seq.current) {
      // Yanıt gelmeden iptal edildiyse ana süreçte yeni açılan akış da kapatılsın
      if (res?.ok && !active.current) api.portalLoginCancel().catch(() => {});
      return;
    }
    if (!res?.ok) {
      active.current = false;
      setError(res?.error || {});
      setStatus('error');
      return;
    }
    setFlow({ userCode: res.userCode, verificationUri: res.verificationUri, expiresIn: res.expiresIn, register });
    setStatus('waiting');
  }, [api]);

  const cancel = useCallback(() => {
    seq.current++;
    const wasActive = active.current;
    active.current = false;
    setStatus('idle');
    setFlow(null);
    setError(null);
    setCopied(false);
    if (wasActive) api.portalLoginCancel().catch(() => {});
  }, [api]);

  const openBrowser = useCallback(() => { api.portalOpenVerification().catch(() => {}); }, [api]);

  const copy = useCallback(async () => {
    try {
      const res = await api.portalCopyVerification();
      if (!res?.ok || !res.copied) return;
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch { /* pano kullanılamıyorsa sessiz */ }
  }, [api]);

  return { status, flow, error, copied, ended: ENDED.has(status), start, cancel, openBrowser, copy };
}
