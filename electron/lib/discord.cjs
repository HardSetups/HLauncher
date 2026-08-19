// Discord Rich Presence (opsiyonel). Ayarlardan kapalıysa veya Discord açık
// değilse sessizce devre dışı kalır; launcher'ı asla bloke etmez.
const log = require('./logger.cjs');

// HLauncher'ın Discord uygulama kimliği (discord.com/developers).
// Boşsa veya geçersizse RPC sessizce devre dışı kalır.
const DISCORD_CLIENT_ID = '1314991416434229319';

let client = null;
let disabled = false;

async function ensureClient() {
    if (disabled || client) return client;
    if (!DISCORD_CLIENT_ID) { disabled = true; return null; }
    try {
        const { Client } = require('@xhayper/discord-rpc');
        const c = new Client({ clientId: DISCORD_CLIENT_ID });
        await c.login();
        client = c;
        c.on('disconnected', () => { client = null; });
        return client;
    } catch (err) {
        log.info(`[DISCORD] RPC bağlanamadı (Discord kapalı olabilir): ${err.message}`);
        disabled = true; // bu oturumda tekrar deneme
        return null;
    }
}

async function setPlaying({ version, serverAddress }) {
    const c = await ensureClient();
    if (!c) return;
    try {
        await c.user?.setActivity({
            details: serverAddress ? `${serverAddress} sunucusunda` : 'Tek oyunculu',
            state: `Minecraft ${version}`,
            largeImageKey: 'logo',
            startTimestamp: Date.now(),
        });
    } catch (err) {
        log.info(`[DISCORD] Aktivite ayarlanamadı: ${err.message}`);
    }
}

async function clear() {
    if (!client) return;
    try { await client.user?.clearActivity(); } catch { /* önemsiz */ }
}

module.exports = { setPlaying, clear };
