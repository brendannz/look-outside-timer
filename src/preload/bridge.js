const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('breaktimer', {
  // Overlay / pre-warning
  onRestData: (cb) => ipcRenderer.on('rest-data', (_e, data) => cb(data)),
  onRestTick: (cb) => ipcRenderer.on('rest-tick', (_e, data) => cb(data)),
  onPrewarn: (cb) => ipcRenderer.on('prewarn-data', (_e, data) => cb(data)),
  skip: () => ipcRenderer.send('rest-skip'),
  postpone: () => ipcRenderer.send('rest-postpone'),

  // Settings
  getVersion: () => ipcRenderer.invoke('app:version'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (patch) => ipcRenderer.invoke('config:save', patch),
  getStatus: () => ipcRenderer.invoke('status:get'),
  detectMicApps: () => ipcRenderer.invoke('calls:detect-all'),
  quoteStats: () => ipcRenderer.invoke('quotes:stats'),
  previewBreak: () => ipcRenderer.send('break:now'),
  closeWindow: () => ipcRenderer.send('window:close')
});
