const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    closeApp:    () => ipcRenderer.send('close-app'),
    minimizeApp: () => ipcRenderer.send('minimize-app'),
    launchGame:  (options) => ipcRenderer.send('launch-game', options),
    stopGame:    () => ipcRenderer.send('stop-game'),

    onLaunchProgress: (cb) => ipcRenderer.on('launch-progress', (_, data) => cb(data)),
    onLaunchFinished: (cb) => ipcRenderer.on('launch-finished', () => cb()),
    onLaunchError:    (cb) => ipcRenderer.on('launch-error',    (_, err)  => cb(err)),
    onGameClosed:     (cb) => ipcRenderer.on('game-closed',     () => cb()),
    onJavaStatus:     (cb) => ipcRenderer.on('java-status',     (_, data) => cb(data)),

    selectJavaPath: () => ipcRenderer.invoke('select-java-path'),
    getVersionManifest: () => ipcRenderer.invoke('get-version-manifest'),
    hideLauncher: () => ipcRenderer.send('hide-launcher'),
    showLauncher: () => ipcRenderer.send('show-launcher'),

    removeGameListeners: () => {
        ['launch-progress', 'launch-finished', 'launch-error', 'game-closed', 'java-status']
            .forEach(ch => ipcRenderer.removeAllListeners(ch));
    },
});
