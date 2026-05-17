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
  const fallbackElectron: ElectronAPI = {
    invoke: async () => ({ success: false, error: 'Electron API unavailable in browser' } as any),
    send: () => {},
    on: () => {},
    removeListener: () => {},
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


