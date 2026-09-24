const { contextBridge, ipcRenderer } = require('electron');

// Olay aboneliği: dinleyiciyi kaydeder ve kaldırma fonksiyonu döndürür.
// Bileşenler unmount olurken bunu çağırmalı — aksi halde her sekme ziyaretinde
// dinleyiciler birikir (MaxListenersExceeded + ölü bileşene setState).
function subscribe(channel, cb) {
    const handler = (_, data) => cb(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
    // Pencere
    closeApp:       () => ipcRenderer.send('close-app'),
    minimizeApp:    () => ipcRenderer.send('minimize-app'),
    toggleMaximize: () => ipcRenderer.send('toggle-maximize'),
    onWindowMaximized: (cb) => subscribe('window-maximized', cb),
    isMaximized:    () => ipcRenderer.invoke('window:is-maximized'),
    hideLauncher:   () => ipcRenderer.send('hide-launcher'),
    showLauncher:   () => ipcRenderer.send('show-launcher'),

    // Oyun
    launchGame: (options) => ipcRenderer.send('launch-game', options),
    stopGame:   () => ipcRenderer.send('stop-game'),

    onLaunchProgress: (cb) => subscribe('launch-progress', cb),
    onLaunchFinished: (cb) => subscribe('launch-finished', cb),
    onLaunchError: (cb) => subscribe('launch-error', cb),
    onGameClosed: (cb) => subscribe('game-closed', cb),
    onGameCrashed: (cb) => subscribe('game-crashed', cb),
    onJavaStatus: (cb) => subscribe('java-status', cb),
    onModProgress: (cb) => subscribe('mod-progress', cb),

    // Sistem / ayarlar
    getSystemInfo:  () => ipcRenderer.invoke('system:info'),
    openLogs:       () => ipcRenderer.invoke('system:open-logs'),
    openScreenshots:() => ipcRenderer.invoke('system:open-screenshots'),
    clearCache:     () => ipcRenderer.invoke('system:clear-cache'),
    openInstanceDir:(id) => ipcRenderer.invoke('instances:open-dir', id),
    getStoreData:   () => ipcRenderer.invoke('store:all'),
    getNews:        () => ipcRenderer.invoke('news:get'),

    // Launcher güncellemeleri
    getUpdaterStatus: () => ipcRenderer.invoke('updates:status'),
    checkAppUpdate:   () => ipcRenderer.invoke('updates:check'),
    installAppUpdate: () => ipcRenderer.send('updates:install'),
    onUpdaterStatus: (cb) => subscribe('updater-status', cb),
    patchSettings:  (patch) => ipcRenderer.invoke('settings:patch', patch),
    setServers:     (servers) => ipcRenderer.invoke('servers:set', servers),
    selectJavaPath: () => ipcRenderer.invoke('select-java-path'),
    getVersionManifest: () => ipcRenderer.invoke('get-version-manifest'),

    // Hesap
    loginMicrosoft: () => ipcRenderer.invoke('account:login-microsoft'),
    loginOffline:   (name) => ipcRenderer.invoke('account:login-offline', name),
    logout:         () => ipcRenderer.invoke('account:logout'),

    // HardSetups hesabı (portal) — token'lar ana süreçte kalır, burada yalnızca özet
    portalState:        () => ipcRenderer.invoke('portal:state'),
    portalRefresh:      () => ipcRenderer.invoke('portal:refresh'),
    portalLoginStart:   () => ipcRenderer.invoke('portal:login-start'),
    portalLoginCancel:  () => ipcRenderer.invoke('portal:login-cancel'),
    portalOpenVerification: () => ipcRenderer.invoke('portal:open-verification'),
    portalCopyVerification: () => ipcRenderer.invoke('portal:copy-verification'),
    portalLogout:       () => ipcRenderer.invoke('portal:logout'),
    portalOpenLink:     (kind) => ipcRenderer.invoke('portal:open-link', kind),
    portalLibrary:      (opts) => ipcRenderer.invoke('portal:library', opts),
    portalInstall:      (slug, action, taskId) => ipcRenderer.invoke('portal:install', slug, action, taskId),
    portalInstallKey:   (licenseKey, taskId) => ipcRenderer.invoke('portal:install-key', licenseKey, taskId),
    portalUninstall:    (slug, opts) => ipcRenderer.invoke('portal:uninstall', slug, opts),
    portalOpenBackups:  () => ipcRenderer.invoke('portal:open-backups'),
    onPortalState:      (cb) => subscribe('portal:state', cb),
    onPortalLogin:      (cb) => subscribe('portal:login', cb),
    onPortalSession:    (cb) => subscribe('portal:session', cb),

    // Profiller
    listInstances:    () => ipcRenderer.invoke('instances:list'),
    createInstance:   (data) => ipcRenderer.invoke('instances:create', data),
    updateInstance:   (id, patch) => ipcRenderer.invoke('instances:update', id, patch),
    deleteInstance:   (id) => ipcRenderer.invoke('instances:delete', id),
    setActiveInstance:(id) => ipcRenderer.invoke('instances:set-active', id),

    // Profil içeriği: type = 'mod' | 'resourcepack' | 'shader'
    listContent:      (instanceId, type, opts) => ipcRenderer.invoke('content:list', instanceId, type, opts),
    toggleContent:    (instanceId, type, file, enabled) => ipcRenderer.invoke('content:toggle', instanceId, type, file, enabled),
    removeContent:    (instanceId, type, file) => ipcRenderer.invoke('content:remove', instanceId, type, file),
    openContentDir:   (instanceId, type) => ipcRenderer.invoke('content:open-dir', instanceId, type),
    searchContent:    (params) => ipcRenderer.invoke('content:search', params),
    installContent:   (instanceId, type, projectId, taskId) => ipcRenderer.invoke('content:install', instanceId, type, projectId, taskId),
    checkContentUpdates: (instanceId, type) => ipcRenderer.invoke('content:check-updates', instanceId, type),
    applyContentUpdate:  (instanceId, type, update) => ipcRenderer.invoke('content:apply-update', instanceId, type, update),
    installModpack:   (projectId, taskId) => ipcRenderer.invoke('modpack:install', projectId, taskId),
    installPerformancePreset: (instanceId, taskId) => ipcRenderer.invoke('mods:performance-preset', instanceId, taskId),
    importMrpack:     (taskId) => ipcRenderer.invoke('mrpack:import', taskId),

    // Skinler (kütüphane herkes için; profil/uygula/pelerin yalnız Microsoft)
    listSkins:        () => ipcRenderer.invoke('skins:list'),
    importSkinFile:   () => ipcRenderer.invoke('skins:import-file'),
    importSkinUsername: (name) => ipcRenderer.invoke('skins:import-username', name),
    updateSkin:       (id, patch) => ipcRenderer.invoke('skins:update', id, patch),
    removeSkin:       (id) => ipcRenderer.invoke('skins:remove', id),
    getSkinProfile:   () => ipcRenderer.invoke('skins:profile'),
    applySkin:        (id) => ipcRenderer.invoke('skins:apply', id),
    resetSkin:        () => ipcRenderer.invoke('skins:reset'),
    setCape:          (capeId) => ipcRenderer.invoke('skins:cape', capeId),
    saveCurrentSkin:  () => ipcRenderer.invoke('skins:save-current'),

    // Sunucu manifesti / OptiFine manuel
    applyServerManifest: (url, taskId) => ipcRenderer.invoke('server:apply-manifest', url, taskId),
    installOptiFineManual: (mcVersion) => ipcRenderer.invoke('optifine:manual-install', mcVersion),
});
