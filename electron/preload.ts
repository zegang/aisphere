// Electron preload script - exposes limited API to renderer

const { contextBridge, ipcRenderer } = require('electron');

// Renderer callbacks are wrapped before being handed to ipcRenderer so the
// Electron event object never crosses the bridge. Keep the wrappers so that
// removeListener can remove the exact listener that was registered; passing the
// original callback to ipcRenderer.removeListener would silently do nothing.
const listenersByChannel = new Map<string, Map<(...args: unknown[]) => void, (...args: unknown[]) => void>>();

// Expose a safe API to the renderer
contextBridge.exposeInMainWorld('electron', {
  // IPC client — payload-style for safety
  invoke: (channel: string, payload?: unknown) => ipcRenderer.invoke(channel, payload),
  send: (channel: string, payload?: unknown) => ipcRenderer.send(channel, payload),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    let channelListeners = listenersByChannel.get(channel);
    if (!channelListeners) {
      channelListeners = new Map();
      listenersByChannel.set(channel, channelListeners);
    }

    // Registering the same callback twice should not cause duplicate delivery.
    const existing = channelListeners.get(callback);
    if (existing) {
      ipcRenderer.removeListener(channel, existing);
    }

    const wrapper = (_event: any, ...args: unknown[]) => callback(...args);
    channelListeners.set(callback, wrapper);
    ipcRenderer.on(channel, wrapper);
  },
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    const channelListeners = listenersByChannel.get(channel);
    const wrapper = channelListeners?.get(callback);
    if (!wrapper) return;
    ipcRenderer.removeListener(channel, wrapper);
    channelListeners?.delete(callback);
    if (channelListeners?.size === 0) {
      listenersByChannel.delete(channel);
    }
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
});
