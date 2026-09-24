// Uyumluluk geri dönüşleri (saf, testli).
//
// Chromium sandbox'ı varsayılan olarak AÇIK. alpha.1–5'te paketli sürümde
// sandbox tamamen kapatılıyordu: bazı Windows makinelerinde (sürücü/antivirüs
// etkileşimi) korumalı alt süreçler STATUS_BREAKPOINT ile çöküp pencereyi
// görünmez bırakıyordu. Artık sandbox yalnızca bu çökme gerçekten görülen
// makinede kapanır: açılışın ilk 30 sn'sinde bir alt süreç STATUS_BREAKPOINT ile
// düşerse compat.noSandbox kalıcı olarak açılır ve launcher bir kez yeniden başlar.

const STATUS_BREAKPOINT = 0x80000003;
const EARLY_WINDOW_MS = 30 * 1000;
const CRASH_REASONS = new Set(['crashed', 'launch-failed', 'abnormal-exit']);

/**
 * @param {{reason?: string, exitCode?: number}} details child-process-gone / render-process-gone ayrıntısı
 * @param {number} uptimeMs uygulama açılalı geçen süre
 */
function isSandboxCrash(details, uptimeMs) {
    if (!details || !(uptimeMs <= EARLY_WINDOW_MS)) return false;
    if (!CRASH_REASONS.has(details.reason)) return false;
    // exitCode işaretli (-2147483645) ya da işaretsiz (2147483651) gelebilir
    return (Number(details.exitCode) >>> 0) === STATUS_BREAKPOINT;
}

/** Sandbox bu makinede kapalı mı çalışmalı? (env ile elle de zorlanabilir) */
function sandboxDisabled(store, env = process.env) {
    if (env.HL_NO_SANDBOX === '1') return true;
    try { return store.get('compat')?.noSandbox === true; } catch { return false; }
}

module.exports = { isSandboxCrash, sandboxDisabled, STATUS_BREAKPOINT };
