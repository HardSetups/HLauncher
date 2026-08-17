const { Client, Authenticator } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');

const launcher = new Client();
let gameProcess = null;

const stopGame = () => {
    if (gameProcess) {
        gameProcess.kill();
        gameProcess = null;
    }
};

const getVersionInfo = (rootPath, versionId) => {
    const versionPath = path.join(rootPath, 'versions', versionId, `${versionId}.json`);

    if (!fs.existsSync(versionPath)) {
        console.log(`[LAUNCHER] Version JSON not found: ${versionPath}`);
        return null;
    }

    try {
        const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
        console.log(`[LAUNCHER] Loaded version: ${versionId}`);

        if (versionData.inheritsFrom) {
            console.log(`[LAUNCHER] Version inherits from: ${versionData.inheritsFrom}`);
            const parentVersion = getVersionInfo(rootPath, versionData.inheritsFrom);

            if (parentVersion) {
                return {
                    ...parentVersion,
                    ...versionData,
                    libraries: [
                        ...(versionData.libraries || []),
                        ...(parentVersion.libraries || [])
                    ],
                    arguments: {
                        game: [
                            ...(parentVersion.arguments?.game || []),
                            ...(versionData.arguments?.game || [])
                        ],
                        jvm: [
                            ...(parentVersion.arguments?.jvm || []),
                            ...(versionData.arguments?.jvm || [])
                        ]
                    },
                    assetIndex: parentVersion.assetIndex,
                    assets: parentVersion.assets
                };
            }
        }

        return versionData;
    } catch (error) {
        console.error(`[LAUNCHER] Error parsing version JSON: ${error.message}`);
        return null;
    }
};

const isOptiFineVersion = (version) => {
    return version.includes('OptiFine') || version.includes('optifine');
};

const getBaseVersion = (version) => {
    if (version.includes('-OptiFine')) {
        return version.split('-OptiFine')[0];
    }
    if (version.startsWith('OptiFine ')) {
        return version.replace('OptiFine ', '').split('_')[0];
    }
    return version;
};

const getJavaPath = (baseVersion, rootPath) => {
    const versionParts = baseVersion.split('.').map(Number);
    const majorVersion = versionParts[1] || 0;

    console.log(`[LAUNCHER] Determining Java for version ${baseVersion} (major: ${majorVersion})`);

    let requiredJavaVersion;
    if (majorVersion >= 21) {
        requiredJavaVersion = 21;
    } else if (majorVersion >= 17) {
        requiredJavaVersion = 17;
    } else {
        requiredJavaVersion = 8;
    }

    console.log(`[LAUNCHER] Required Java version: ${requiredJavaVersion}`);

    const possiblePaths = [];

    const launcherRuntime = path.join(rootPath, 'runtime', `java-runtime-gamma`, 'bin', 'java.exe');
    possiblePaths.push(launcherRuntime);

    const mojangRuntime = path.join(process.env.APPDATA, '.minecraft', 'runtime',
        requiredJavaVersion >= 21 ? 'java-runtime-delta' :
            requiredJavaVersion >= 17 ? 'java-runtime-gamma' : 'java-runtime-alpha',
        'windows-x64',
        requiredJavaVersion >= 21 ? 'java-runtime-delta' :
            requiredJavaVersion >= 17 ? 'java-runtime-gamma' : 'java-runtime-alpha',
        'bin', 'java.exe');
    possiblePaths.push(mojangRuntime);

    const adoptiumPaths = [
        `C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.9.10-hotspot\\bin\\java.exe`,
        `C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.5.11-hotspot\\bin\\java.exe`,
        `C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.4.7-hotspot\\bin\\java.exe`,
        `C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.17.10-hotspot\\bin\\java.exe`,
        `C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.12.7-hotspot\\bin\\java.exe`,
        `C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.11.9-hotspot\\bin\\java.exe`,
        `C:\\Program Files\\Eclipse Adoptium\\jdk-11.0.29.7-hotspot\\bin\\java.exe`,
    ];

    const oraclePaths = [
        `C:\\Program Files\\Java\\jdk-21\\bin\\java.exe`,
        `C:\\Program Files\\Java\\jdk-17\\bin\\java.exe`,
        `C:\\Program Files\\Java\\jre-17\\bin\\java.exe`,
        `C:\\Program Files\\Java\\jdk-11\\bin\\java.exe`,
        `C:\\Program Files\\Java\\jre-11\\bin\\java.exe`,
        `C:\\Program Files\\Java\\jdk1.8.0_411\\bin\\java.exe`,
        `C:\\Program Files\\Java\\jre1.8.0_411\\bin\\java.exe`,
    ];

    const zuluPaths = [
        `C:\\Program Files\\Zulu\\zulu-21\\bin\\java.exe`,
        `C:\\Program Files\\Zulu\\zulu-17\\bin\\java.exe`,
        `C:\\Program Files\\Zulu\\zulu-11\\bin\\java.exe`,
    ];

    const msftPaths = [
        `C:\\Program Files\\Microsoft\\jdk-21.0.4.7-hotspot\\bin\\java.exe`,
        `C:\\Program Files\\Microsoft\\jdk-17.0.12.7-hotspot\\bin\\java.exe`,
    ];

    if (requiredJavaVersion >= 21) {
        possiblePaths.push(...adoptiumPaths.filter(p => p.includes('21')));
        possiblePaths.push(...oraclePaths.filter(p => p.includes('21')));
        possiblePaths.push(...zuluPaths.filter(p => p.includes('21')));
        possiblePaths.push(...msftPaths.filter(p => p.includes('21')));
    }
    if (requiredJavaVersion >= 17) {
        possiblePaths.push(...adoptiumPaths.filter(p => p.includes('17')));
        possiblePaths.push(...oraclePaths.filter(p => p.includes('17')));
        possiblePaths.push(...zuluPaths.filter(p => p.includes('17')));
        possiblePaths.push(...msftPaths.filter(p => p.includes('17')));
    }
    possiblePaths.push(...adoptiumPaths.filter(p => p.includes('11') || p.includes('1.8')));
    possiblePaths.push(...oraclePaths.filter(p => p.includes('11') || p.includes('1.8')));

    for (const javaPath of possiblePaths) {
        if (fs.existsSync(javaPath)) {
            console.log(`[LAUNCHER] Found Java at: ${javaPath}`);
            return javaPath;
        }
    }

    console.log(`[LAUNCHER] No local Java found, using system 'java' command`);
    return 'java';
};

const launchGame = async (event, options) => {
    const { username, ramMax, version, serverIp, gameType, javaPath } = options;

    const rootPath = path.join(process.env.APPDATA, '.thehardcraft');

    console.log(`[LAUNCHER] Starting game launch...`);
    console.log(`[LAUNCHER] Version: ${version}`);
    console.log(`[LAUNCHER] Username: ${username}`);
    console.log(`[LAUNCHER] Root: ${rootPath}`);

    const versionInfo = getVersionInfo(rootPath, version);

    if (!versionInfo) {
        console.error(`[LAUNCHER] Could not load version info for: ${version}`);
        event.reply('launch-error', { error: `Version not found: ${version}` });
        return;
    }

    console.log(`[LAUNCHER] Version info loaded successfully`);
    console.log(`[LAUNCHER] Asset Index: ${versionInfo.assetIndex?.id || 'N/A'}`);
    console.log(`[LAUNCHER] Main Class: ${versionInfo.mainClass}`);

    const baseVersion = getBaseVersion(version);
    console.log(`[LAUNCHER] Base version: ${baseVersion}`);

    const isCustomJavaPath = javaPath && javaPath !== 'java' && (javaPath.includes(':') || javaPath.startsWith('/'));
    const selectedJavaPath = isCustomJavaPath ? javaPath : getJavaPath(baseVersion, rootPath);
    console.log(`[LAUNCHER] Selected Java path: ${selectedJavaPath}`);

    let opts = {
        clientPackage: null,
        authorization: Authenticator.getAuth(username),
        root: rootPath,
        version: {
            number: baseVersion,
            type: "release",
            custom: isOptiFineVersion(version) ? version : undefined
        },
        memory: {
            max: ramMax || "4G",
            min: "1G"
        },
        javaPath: selectedJavaPath,
        quickPlay: {
            type: "multiplayer",
            identifier: serverIp || 'mc.thehardcraft.com.tr'
        }
    };

    launcher.on('debug', (e) => {
        console.log('[MCLC]', e);
    });

    launcher.on('data', (e) => {
        console.log('[GAME]', e);
    });

    launcher.on('progress', (e) => {
        console.log('[PROGRESS]', e);
        event.reply('launch-progress', e);
    });

    launcher.on('finished', () => {
        console.log('[LAUNCHER] Launch finished');
        event.reply('launch-finished');
    });

    launcher.on('close', (code) => {
        console.log(`[LAUNCHER] Game closed with code: ${code}`);
        gameProcess = null;
        event.reply('game-closed');
    });

    try {
        console.log('[LAUNCHER] Launching with options:', JSON.stringify(opts, null, 2));
        gameProcess = await launcher.launch(opts);
        console.log('[LAUNCHER] Game process started');
    } catch (error) {
        console.error('[LAUNCHER] Launch error:', error);
        event.reply('launch-error', { error: error.message });
    }
};

module.exports = { launchGame, stopGame };
