const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Pencere
    closeApp:     () => ipcRenderer.send('close-app'),
    minimizeApp:  () => ipcRenderer.send('minimize-app'),
    hideLauncher: () => ipcRenderer.send('hide-launcher'),
    showLauncher: () => ipcRenderer.send('show-launcher'),

    // Oyun
    launchGame: (options) => ipcRenderer.send('launch-game', options),
    stopGame:   () => ipcRenderer.send('stop-game'),

    onLaunchProgress: (cb) => ipcRenderer.on('launch-progress', (_, data) => cb(data)),
    onLaunchFinished: (cb) => ipcRenderer.on('launch-finished', () => cb()),
    onLaunchError:    (cb) => ipcRenderer.on('launch-error',    (_, err)  => cb(err)),
    onGameClosed:     (cb) => ipcRenderer.on('game-closed',     () => cb()),
    onJavaStatus:     (cb) => ipcRenderer.on('java-status',     (_, data) => cb(data)),
    onModProgress:    (cb) => ipcRenderer.on('mod-progress',    (_, data) => cb(data)),

    removeGameListeners: () => {
        ['launch-progress', 'launch-finished', 'launch-error', 'game-closed', 'java-status', 'mod-progress']
            .forEach((ch) => ipcRenderer.removeAllListeners(ch));
    },

    // Sistem / ayarlar
    getSystemInfo:  () => ipcRenderer.invoke('system:info'),
    openLogs:       () => ipcRenderer.invoke('system:open-logs'),
    getStoreData:   () => ipcRenderer.invoke('store:all'),
    patchSettings:  (patch) => ipcRenderer.invoke('settings:patch', patch),
    setServers:     (servers) => ipcRenderer.invoke('servers:set', servers),
    selectJavaPath: () => ipcRenderer.invoke('select-java-path'),
    getVersionManifest: () => ipcRenderer.invoke('get-version-manifest'),

    // Hesap
    loginMicrosoft: () => ipcRenderer.invoke('account:login-microsoft'),
    loginOffline:   (name) => ipcRenderer.invoke('account:login-offline', name),
    logout:         () => ipcRenderer.invoke('account:logout'),

    // Profiller
    listInstances:    () => ipcRenderer.invoke('instances:list'),
    createInstance:   (data) => ipcRenderer.invoke('instances:create', data),
    updateInstance:   (id, patch) => ipcRenderer.invoke('instances:update', id, patch),
    deleteInstance:   (id) => ipcRenderer.invoke('instances:delete', id),
    setActiveInstance:(id) => ipcRenderer.invoke('instances:set-active', id),

    // Modlar
    searchMods:       (params) => ipcRenderer.invoke('mods:search', params),
    listMods:         (instanceId) => ipcRenderer.invoke('mods:list', instanceId),
    removeMod:        (instanceId, fileName) => ipcRenderer.invoke('mods:remove', instanceId, fileName),
    installMod:       (instanceId, projectId) => ipcRenderer.invoke('mods:install', { instanceId, projectId }),
    installPerformancePreset: (instanceId) => ipcRenderer.invoke('mods:performance-preset', instanceId),
    importMrpack:     () => ipcRenderer.invoke('mrpack:import'),

    // Sunucu manifesti / OptiFine manuel
    applyServerManifest: (url) => ipcRenderer.invoke('server:apply-manifest', url),
    installOptiFineManual: (mcVersion) => ipcRenderer.invoke('optifine:manual-install', mcVersion),
});
