const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getData: () => ipcRenderer.invoke('get-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  resetCloseAction: () => ipcRenderer.invoke('reset-close-action'),
  sendNotification: (opts) => ipcRenderer.invoke('send-notification', opts),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
  updateTrayTooltip: (text) => ipcRenderer.invoke('update-tray-tooltip', text),
  onTrayToggle: (callback) => ipcRenderer.on('tray-toggle', callback)
});
