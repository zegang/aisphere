import { contextBridge, ipcRenderer } from 'electron';

export type ElectronAPI = {
  app: Record<string, any>;
  llm: Record<string, any>;
  download: Record<string, any>;
  chat: Record<string, any>;
  config: Record<string, any>;
};

const electronAPI: ElectronAPI = {
  app: new Proxy({} as Record<string, any>, {
    get(_target, prop) {
      return (...args: any[]) => ipcRenderer.invoke(`app:${String(prop)}`);
    },
  }),
  llm: new Proxy({} as Record<string, any>, {
    get(_target, prop) {
      return (...args: any[]) => ipcRenderer.invoke(`llm:${String(prop)}`);
    },
  }),
  download: new Proxy({} as Record<string, any>, {
    get(_target, prop) {
      return (...args: any[]) => ipcRenderer.invoke(`download:${String(prop)}`);
    },
  }),
  chat: new Proxy({} as Record<string, any>, {
    get(_target, prop) {
      return (...args: any[]) => ipcRenderer.invoke(`chat:${String(prop)}`);
    },
  }),
  config: new Proxy({} as Record<string, any>, {
    get(_target, prop) {
      return (...args: any[]) => ipcRenderer.invoke(`config:${String(prop)}`);
    },
  }),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export { electronAPI };
