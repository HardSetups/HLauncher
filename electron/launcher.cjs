// Oyun başlatma orkestrasyonu: profil çözümü → loader kurulumu → Java →
// hesap → MCLC. Tüm alt işler lib/ modüllerinde.
const fs = require('fs');
const { Client } = require('minecraft-launcher-core');

const log = require('./lib/logger.cjs');
const { getRootPath, getInstanceDir } = require('./lib/paths.cjs');
const { getStore } = require('./lib/store.cjs');
const { friendlyError } = require('./lib/errors.cjs');
const { ensureJava, getRequiredJava } = require('./lib/java.cjs');
const { getLatestRelease } = require('./lib/versions.cjs');
const instances = require('./lib/instances.cjs');
const accounts = require('./lib/accounts.cjs');
const optifine = require('./lib/loaders/optifine.cjs');
const fabriclike = require('./lib/loaders/fabriclike.cjs');
const forge = require('./lib/loaders/forge.cjs');
const discord = require('./lib/discord.cjs');

const launcher = new Client();
let gameProcess = null;

const stopGame = () => {
    if (gameProcess) {
        gameProcess.kill();
        gameProcess = null;
    }
};

const isGameRunning = () => gameProcess !== null;

// ─── JVM argüman preset'leri ────────────────────────────────────────────────

const JVM_PRESETS = {
    balanced: [
        '-XX:+UnlockExperimentalVMOptions', '-XX:+UseG1GC',
        '-XX:G1NewSizePercent=20', '-XX:G1ReservePercent=20',
        '-XX:MaxGCPauseMillis=50', '-XX:G1HeapRegionSize=32M',
    ],
    lowram: [
        '-XX:+UnlockExperimentalVMOptions', '-XX:+UseG1GC',
        '-XX:MaxGCPauseMillis=40', '-XX:G1HeapRegionSize=16M',
    ],
    zgc: ['-XX:+UseZGC'], // yalnızca Java 17+ (aşağıda korunur)
};

function jvmArgsFor(preset, customArgs, requiredJava) {
    if (preset === 'custom') {
        return String(customArgs || '').split(/\s+/).filter(Boolean);
    }
    if (preset === 'zgc' && requiredJava < 17) return JVM_PRESETS.balanced;
    return JVM_PRESETS[preset] || JVM_PRESETS.balanced;
}

// ─── Sunucuya otomatik bağlanma ─────────────────────────────────────────────

// 1.20+ Quick Play destekler; öncesinde eski --server/--port bayrakları gerekir.
function supportsQuickPlay(mcVersion) {
    const m = String(mcVersion).match(/^(\d+)\.(\d+)/);
    if (!m) return true;
    const major = parseInt(m[1], 10);
    const minor = parseInt(m[2], 10);
    return major > 1 || minor >= 20;
}

function parseAddress(address) {
    const idx = address.lastIndexOf(':');
    if (idx > 0 && /^\d+$/.test(address.slice(idx + 1))) {
        return { host: address.slice(0, idx), port: address.slice(idx + 1) };
    }
    return { host: address, port: '25565' };
}

// ─── Loader kurulumu ────────────────────────────────────────────────────────

const LOADER_LABELS = { optifine: 'OptiFine', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

/** Loader'ı kurar; MCLC için { customVersionId } veya { forgeInstaller } döndürür. */
async function prepareLoader(loader, rootPath, mcVersion, onProgress) {
    switch (loader) {
        case 'release':
            return {};
        case 'optifine':
            return { customVersionId: await optifine.install(rootPath, mcVersion, onProgress) };
        case 'fabric':
        case 'quilt':
            return { customVersionId: await fabriclike.install(loader, rootPath, mcVersion, onProgress) };
        case 'forge':
        case 'neoforge':
            return { forgeInstaller: await forge.ensureInstaller(loader, mcVersion, onProgress) };
        default:
            throw new Error(`Bilinmeyen loader: ${loader}`);
    }
}

// ─── Başlatma ───────────────────────────────────────────────────────────────

/**
 * @param {Electron.IpcMainEvent} event
 * @param {{ instanceId?: string, serverIp?: string }} options
 */
const launchGame = async (event, options = {}) => {
    const startedAt = Date.now();
    const rootPath = getRootPath();
    const store = getStore();
    const settings = store.get('settings');

    const instance = instances.get(options.instanceId || store.get('activeInstanceId')) || instances.get('default');
    const loader = instance.loader || 'release';
    const mcVersion = instance.mcVersion || await getLatestRelease();
    const ramGb = instance.ram || settings.ram || 4;

    log.info(`[LAUNCH] Profil "${instance.name}" — MC ${mcVersion} (${loader}), ${ramGb} GB`);

    // 1. Loader kurulumu
    let loaderResult = {};
    if (loader !== 'release') {
        const label = LOADER_LABELS[loader];
        event.reply('java-status', { type: loader, percent: 0, message: `${label} kontrol ediliyor...` });
        try {
            loaderResult = await prepareLoader(loader, rootPath, mcVersion, (p) => event.reply('java-status', p));
            event.reply('java-status', { type: 'done', percent: 100, message: `${label} hazır!` });
        } catch (err) {
            log.error(`[LAUNCH] ${label} kurulum hatası: ${err.stack || err.message}`);
            event.reply('java-status', { type: 'done', percent: 100, message: '' });
            event.reply('launch-error', friendlyError(err,
                `${label} bu sürüm için kurulamadı.` +
                (loader === 'optifine' ? '\nİsterseniz resmi siteden indirdiğiniz OptiFine jar\'ı ile manuel kurulum yapabilir ya da Fabric + performans paketini deneyebilirsiniz.' : '')));
            return;
        }
    }

    // 2. Java
    const trimmedJava = (settings.javaPath || '').trim();
    let selectedJava;
    if (trimmedJava && trimmedJava !== 'java') {
        if (!fs.existsSync(trimmedJava)) {
            event.reply('launch-error', `Belirtilen Java bulunamadı:\n${trimmedJava}\n\nAyarlar'dan geçerli bir java.exe seçin veya alanı boş bırakın.`);
            return;
        }
        selectedJava = trimmedJava;
    } else {
        try {
            selectedJava = await ensureJava(mcVersion, rootPath, (p) => event.reply('java-status', p));
        } catch (err) {
            log.error(`[LAUNCH] Java hatası: ${err.stack || err.message}`);
            event.reply('java-status', { type: 'error', message: err.message });
            event.reply('launch-error', friendlyError(err, 'Java kurulamadı.'));
            return;
        }
    }
    log.info(`[LAUNCH] Java: ${selectedJava}`);

    // 3. Hesap
    let authorization;
    try {
        authorization = await accounts.getMclcAuth();
    } catch (err) {
        event.reply('launch-error', err.message);
        return;
    }

    // 4. MCLC seçenekleri
    launcher.removeAllListeners();
    launcher.on('debug', (e) => log.debug(`[MCLC] ${e}`));
    launcher.on('data', (e) => log.debug(`[GAME] ${String(e).trimEnd()}`));
    launcher.on('progress', (e) => event.reply('launch-progress', e));
    launcher.on('close', (code) => {
        log.info(`[LAUNCH] Oyun kapandı: ${code}`);
        gameProcess = null;
        discord.clear();
        event.reply('game-closed');
    });

    const gameArgs = [];
    if (settings.fullscreen) gameArgs.push('--fullscreen');

    const serverIp = (options.serverIp || '').trim();
    let quickPlay;
    if (serverIp) {
        if (supportsQuickPlay(mcVersion)) {
            quickPlay = { type: 'multiplayer', identifier: serverIp };
        } else {
            const { host, port } = parseAddress(serverIp);
            gameArgs.push('--server', host, '--port', port);
        }
    }

    const requiredJava = getRequiredJava(mcVersion);
    const customArgs = jvmArgsFor(settings.jvmPreset, settings.customJvmArgs, requiredJava);

    const opts = {
        clientPackage: null,
        authorization,
        root: rootPath,
        version: {
            number: mcVersion,
            type: 'release',
            custom: loaderResult.customVersionId,
        },
        ...(loaderResult.forgeInstaller ? { forge: loaderResult.forgeInstaller } : {}),
        memory: { max: `${ramGb}G`, min: '1G' },
        javaPath: selectedJava,
        customArgs,
        ...(quickPlay ? { quickPlay } : {}),
        overrides: {
            gameDirectory: getInstanceDir(instance.id),
            maxSockets: 8,
            gameArgs,
        },
    };

    try {
        gameProcess = await launcher.launch(opts);
        if (!gameProcess) throw new Error('Oyun süreci başlatılamadı (ayrıntı için loglara bakın)');
        const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
        log.info(`[LAUNCH] Oyun başladı (${seconds} sn)`);
        discord.setPlaying({ version: mcVersion, serverAddress: serverIp || null });
        event.reply('launch-finished');
    } catch (err) {
        log.error(`[LAUNCH] Başlatma hatası: ${err.stack || err.message}`);
        event.reply('launch-error', friendlyError(err, 'Oyun başlatılamadı.'));
    }
};

module.exports = { launchGame, stopGame, isGameRunning, supportsQuickPlay, parseAddress, jvmArgsFor };
