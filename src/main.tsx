// Main entry point for the renderer process
// Renders the React app inside the Electron browser window.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { ElectronAPI } from '@/types/electron';
import { I18nextProvider } from 'react-i18next';
import i18n from './i18n/config'; // Import the configured i18n instance
import AiSphere from './AiSphere';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Could not find root element');

if (typeof window !== 'undefined' && !window.electron) {
  const isRemoteBrowser = window.location.protocol !== 'file:' && window.location.port !== '5173';
  const remoteClientId = (() => {
    try {
      const key = 'aisphere.remote.clientId';
      const existing = window.sessionStorage.getItem(key);
      if (existing) return existing;
      const generated = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(key, generated);
      return generated;
    } catch {
      return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }
  })();
  const remoteListeners = new Map<string, Map<(...args: unknown[]) => void, (...args: unknown[]) => void>>();
  let eventCursor = 0;
  let polling = false;
  const pollRemoteEvents = async () => {
    if (!isRemoteBrowser || polling) return;
    polling = true;
    try {
      while (isRemoteBrowser) {
        const response = await fetch(`/__aisphere/events?clientId=${encodeURIComponent(remoteClientId)}&after=${eventCursor}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (response.status === 401) {
          window.location.reload();
          return;
        }
        const result = await response.json() as { data?: { events?: Array<{ id: number; channel: string; args: unknown[] }> } };
        for (const event of result.data?.events ?? []) {
          eventCursor = Math.max(eventCursor, event.id);
          const callbacks = remoteListeners.get(event.channel);
          callbacks?.forEach((callback) => callback(...event.args));
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      polling = false;
      if (isRemoteBrowser) void pollRemoteEvents();
    }
  };
  if (isRemoteBrowser) void pollRemoteEvents();

  const fallbackElectron: ElectronAPI = {
    invoke: async (channel, payload) => {
      if (!isRemoteBrowser) return { success: false, error: 'Electron API unavailable in browser' } as any;
      try {
        const response = await fetch('/__aisphere/invoke', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel, payload, clientId: remoteClientId }),
        });
        const result = await response.json();
        return response.ok ? result : { success: false, error: result.error || `Remote request failed (${response.status}).` };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    send: (channel, payload) => {
      if (!isRemoteBrowser) return;
      void fetch('/__aisphere/send', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, payload, clientId: remoteClientId }),
      });
    },
    on: (channel, callback) => {
      let callbacks = remoteListeners.get(channel);
      if (!callbacks) {
        callbacks = new Map();
        remoteListeners.set(channel, callbacks);
      }
      callbacks.set(callback, callback);
    },
    removeListener: (channel, callback) => {
      const callbacks = remoteListeners.get(channel);
      callbacks?.delete(callback);
      if (callbacks?.size === 0) remoteListeners.delete(channel);
    },
    minimizeWindow: () => {},
    maximizeWindow: () => {},
    closeWindow: () => {},
  };
  window.electron = fallbackElectron;
} else {
  // Post-render actions for Electron (e.g., IPC to update main process language)
  window.electron.send('i18n-language-changed', i18n.language);
  i18n.on('languageChanged', (lng) => {
    window.electron.send('i18n-language-changed', lng);
  });
}

createRoot(root).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <AiSphere />
    </I18nextProvider>
  </StrictMode>
);

