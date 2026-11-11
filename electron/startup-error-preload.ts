const { contextBridge: startupErrorContextBridge, ipcRenderer: startupErrorIpcRenderer } = require('electron');

startupErrorContextBridge.exposeInMainWorld('startupError', {
  copy: () => startupErrorIpcRenderer.invoke('startup-error:copy'),
  exit: () => startupErrorIpcRenderer.invoke('startup-error:exit'),
});
