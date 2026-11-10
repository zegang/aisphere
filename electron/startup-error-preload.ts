const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('startupError', {
  copy: () => ipcRenderer.invoke('startup-error:copy'),
  exit: () => ipcRenderer.invoke('startup-error:exit'),
});
