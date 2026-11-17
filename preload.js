const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('backup', {
  status: () => ipcRenderer.invoke('backup:status'),
  setup: () => ipcRenderer.invoke('backup:setup'),
  manage: () => ipcRenderer.invoke('backup:manage'),
  write: json => ipcRenderer.invoke('backup:write', json),
  readMain: () => ipcRenderer.invoke('backup:read')
});
