// HardSetups kütüphanesi (sözleşme §6): lisanslı ürünler + imzalı çevrimdışı zarf.
// Son yanıt <veri kökü>\hardsetups-library.json'da tutulur (gizli değer içermez:
// lisans kimliği, durum, son 4 hane). Zarf yalnızca imzası gömülü anahtarla
// doğrulanırsa saklanır; saat referansı doğrulanmış zarfların en büyük issuedAt'idir.
const fs = require('fs');
const path = require('path');
const offline = require('./offline.cjs');

const ONLINE_FRESH_MS = 10 * 60 * 1000; // bu süreden yeni çevrimiçi yanıt varsa yeniden sorulmaz

function createLibrary({ api, dataRoot, getDeviceId, log, keyring = undefined, now = Date.now, getChannel = () => 'STABLE' }) {
    const file = path.join(dataRoot, 'hardsetups-library.json');
    let cache = load();

    function load() {
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            return data && data.v === 1 ? data : null;
        } catch { return null; }
    }

    function persist() {
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(cache), 'utf8');
        fs.renameSync(tmp, file);
    }

    function clear() {
        cache = null;
        try { fs.rmSync(file, { force: true }); } catch { /* yoksa geç */ }
    }

    /** Sunucudan tazeler; zarfı doğrular ve saklar. */
    async function refresh() {
        // Oyuncu beta sürümleri de istiyorsa (Ayarlar) sunucu en yeni sürümü BETA dahil hesaplar
        const { data } = await api.get(`/v1/launcher/library${getChannel() === 'BETA' ? '?channel=BETA' : ''}`);
        const items = Array.isArray(data?.items) ? data.items : [];
        let envelope = cache?.envelope || null;
        let referenceIssuedAt = cache?.referenceIssuedAt || null;
        if (data?.offline) {
            const check = offline.verifyEnvelope(data.offline, { deviceId: getDeviceId(), now: now(), ...(keyring ? { keyring } : {}) });
            if (check.signatureValid && check.reason !== 'deviceMismatch') {
                envelope = data.offline;
                if (!referenceIssuedAt || Date.parse(data.offline.issuedAt) > Date.parse(referenceIssuedAt)) referenceIssuedAt = data.offline.issuedAt;
            } else {
                log?.warn(`[LIBRARY] Çevrimdışı zarf kabul edilmedi: ${check.reason}`);
            }
        }
        cache = { v: 1, fetchedAt: now(), items: items.map(publicItem), envelope, referenceIssuedAt };
        try { persist(); } catch (err) { log?.warn(`[LIBRARY] Kütüphane kaydedilemedi: ${err.message}`); }
        return cache.items;
    }

    function publicItem(it) {
        return {
            licenseId: String(it.licenseId || ''),
            keyLast4: it.keyLast4 ? String(it.keyLast4).slice(0, 8) : null,
            product: {
                slug: String(it.product?.slug || ''),
                name: String(it.product?.name || it.product?.slug || ''),
                iconUrl: typeof it.product?.iconUrl === 'string' ? it.product.iconUrl : null,
                coverUrl: typeof it.product?.coverUrl === 'string' ? it.product.coverUrl : null,
            },
            status: String(it.status || ''),
            expiresAt: it.expiresAt || null,
            latestVersion: it.latestVersion ? { id: String(it.latestVersion.id || ''), version: String(it.latestVersion.version || ''), channel: String(it.latestVersion.channel || 'STABLE') } : null,
            installable: it.installable !== false,
            reason: it.reason || null,
        };
    }

    const cachedItems = () => cache?.items || [];

    /**
     * Hesapla kurulmuş bir ürün açılabilir mi? (§6.3) Önce çevrimiçi durum,
     * ağ yoksa imzalı zarf + saat geri alma koruması.
     * @returns {Promise<{allowed: boolean, reason?: string, offline?: boolean}>}
     */
    async function launchCheck(productSlug) {
        const findItem = () => cachedItems().find((it) => it.product.slug === productSlug);
        const activeOnline = (it) => it && it.status === 'ACTIVE' && (!it.expiresAt || Date.parse(it.expiresAt) > now());

        // Negatif yaş = saat geri alınmış: önbellek "taze" sayılmaz (yoksa süresi dolmuş
        // lisans eski çevrimiçi yanıtla açılırdı); yenileme olmazsa zarf + saat denetimine düşer
        const age = cache ? now() - cache.fetchedAt : Infinity;
        if (age > ONLINE_FRESH_MS || age < 0) {
            try { await refresh(); } catch (err) {
                if (err?.code !== 'NETWORK' && err?.status !== 503 && !(err?.status >= 500)) {
                    return { allowed: false, reason: err?.code || 'LIBRARY_ERROR' };
                }
                // Ağ / bakım: çevrimdışı zarfa düş
                return offlineCheck(productSlug);
            }
        }
        const item = findItem();
        if (!item) return { allowed: false, reason: 'LICENSE_REQUIRED' };
        return activeOnline(item) ? { allowed: true } : { allowed: false, reason: `LICENSE_${item.status || 'INACTIVE'}` };
    }

    function offlineCheck(productSlug) {
        if (!cache?.envelope) return { allowed: false, reason: 'OFFLINE_NO_ENVELOPE', offline: true };
        const t = now();
        if (!offline.clockTrusted(t, cache.referenceIssuedAt)) return { allowed: false, reason: 'OFFLINE_CLOCK', offline: true };
        const check = offline.verifyEnvelope(cache.envelope, { deviceId: getDeviceId(), now: t, ...(keyring ? { keyring } : {}) });
        if (!check.usable) return { allowed: false, reason: check.reason === 'expired' ? 'OFFLINE_EXPIRED' : 'OFFLINE_INVALID', offline: true };
        const lic = (cache.envelope.licenses || []).find((l) => l.product === productSlug);
        if (!lic || !check.playable[lic.licenseId]) return { allowed: false, reason: 'LICENSE_INACTIVE', offline: true };
        return { allowed: true, offline: true };
    }

    return { refresh, cachedItems, launchCheck, clear, fetchedAt: () => cache?.fetchedAt || null };
}

module.exports = { createLibrary };
