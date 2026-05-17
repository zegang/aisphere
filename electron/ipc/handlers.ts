// IPC handler registrations

import { ipcMain } from 'electron';

export function registerHandlers(
  ipc: typeof ipcMain,
): void {
  // Handlers are now registered within their respective manager classes
}
