// Hesap yönetimi: Microsoft (msmc, premium) ve offline (kullanıcı adı).
// Microsoft yenileme token'ı config.json'da saklanır ve her girişte tazelenir.
const { Authenticator } = require('minecraft-launcher-core');
const { getStore } = require('./store.cjs');
const log = require('./logger.cjs');

/** Electron penceresiyle Microsoft giriş akışı. app ready olduktan sonra çağrılmalı. */
async function loginMicrosoft() {
    const { Auth } = require('msmc');
    const auth = new Auth('select_account');
    const xbox = await auth.launch('electron');
    const mc = await xbox.getMinecraft();

    if (!mc.profile?.name) {
        throw new Error('Bu Microsoft hesabında Minecraft profili yok (oyunu satın almış bir hesapla giriş yapın)');
    }

    const account = {
        type: 'microsoft',
        name: mc.profile.name,
        uuid: mc.profile.id,
        refresh: xbox.save(),
    };
    getStore().set('account', account);
    log.info(`[ACCOUNT] Microsoft girişi: ${account.name}`);
    return { type: 'microsoft', name: account.name, uuid: account.uuid };
}

function loginOffline(name) {
    const trimmed = String(name || '').trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(trimmed)) {
        throw new Error('Kullanıcı adı 3-16 karakter olmalı; harf, rakam ve _ kullanılabilir');
    }
    const account = { type: 'offline', name: trimmed };
    getStore().set('account', account);
    log.info(`[ACCOUNT] Offline giriş: ${trimmed}`);
    return account;
}

function logout() {
    getStore().set('account', null);
}

/** Renderer'a gösterilecek hesap özeti (token sızdırmadan). */
function getCurrent() {
    const account = getStore().get('account');
    if (!account) return null;
    return { type: account.type, name: account.name, uuid: account.uuid || null };
}

/** Başlatma için MCLC auth nesnesi üretir. Microsoft ise token tazelenir. */
async function getMclcAuth() {
    const account = getStore().get('account');
    if (!account) throw new Error('Önce giriş yapın');

    if (account.type === 'offline') {
        return Authenticator.getAuth(account.name);
    }

    try {
        const { Auth } = require('msmc');
        const auth = new Auth('select_account');
        const xbox = await auth.refresh(account.refresh);
        const mc = await xbox.getMinecraft();
        // Tazelenen token'ı sakla ki oturum süresiz devam etsin
        getStore().set('account', { ...account, refresh: xbox.save(), name: mc.profile?.name || account.name });
        return mc.mclc();
    } catch (err) {
        log.error(`[ACCOUNT] Microsoft token yenileme hatası: ${err.message}`);
        throw new Error('Microsoft oturumu yenilenemedi. Hesap sekmesinden tekrar giriş yapın.');
    }
}

module.exports = { loginMicrosoft, loginOffline, logout, getCurrent, getMclcAuth };
