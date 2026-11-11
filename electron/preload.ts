// Electron preload script - exposes limited API to renderer

const { contextBridge: preloadContextBridge, ipcRenderer: preloadIpcRenderer } = require('electron');

// Renderer callbacks are wrapped before being handed to ipcRenderer so the
// Electron event object never crosses the bridge. Keep the wrappers so that
// removeListener can remove the exact listener that was registered; passing the
// original callback to ipcRenderer.removeListener would silently do nothing.
const listenersByChannel = new Map<string, Map<(...args: unknown[]) => void, (...args: unknown[]) => void>>();

// Expose a safe API to the renderer
preloadContextBridge.exposeInMainWorld('electron', {
  // IPC client — payload-style for safety
  invoke: (channel: string, payload?: unknown) => preloadIpcRenderer.invoke(channel, payload),
  send: (channel: string, payload?: unknown) => preloadIpcRenderer.send(channel, payload),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    let channelListeners = listenersByChannel.get(channel);
    if (!channelListeners) {
      channelListeners = new Map();
      listenersByChannel.set(channel, channelListeners);
    }

    // Registering the same callback twice should not cause duplicate delivery.
    const existing = channelListeners.get(callback);
    if (existing) {
      preloadIpcRenderer.removeListener(channel, existing);
    }

    const wrapper = (_event: any, ...args: unknown[]) => callback(...args);
    channelListeners.set(callback, wrapper);
    preloadIpcRenderer.on(channel, wrapper);
  },
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    const channelListeners = listenersByChannel.get(channel);
    const wrapper = channelListeners?.get(callback);
    if (!wrapper) return;
    preloadIpcRenderer.removeListener(channel, wrapper);
    channelListeners?.delete(callback);
    if (channelListeners?.size === 0) {
      listenersByChannel.delete(channel);
    }
  },

  // Window controls
  minimizeWindow: () => preloadIpcRenderer.send('window:minimize'),
  maximizeWindow: () => preloadIpcRenderer.send('window:maximize'),
  closeWindow: () => preloadIpcRenderer.send('window:close'),
});
