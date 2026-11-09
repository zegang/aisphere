import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';

type InvokeListener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type EventListener = (event: IpcMainEvent, ...args: unknown[]) => void;

const invokeListeners = new Map<string, InvokeListener>();
const eventListeners = new Map<string, EventListener>();
let installed = false;

export function captureRemoteIpcHandlers(): void {
  if (installed) return;
  installed = true;

  const originalHandle = ipcMain.handle.bind(ipcMain);
  const originalOn = ipcMain.on.bind(ipcMain);

  ipcMain.handle = ((channel: string, listener: InvokeListener) => {
    invokeListeners.set(channel, listener);
    return originalHandle(channel, listener);
  }) as typeof ipcMain.handle;

  ipcMain.on = ((channel: string, listener: EventListener) => {
    eventListeners.set(channel, listener);
    return originalOn(channel, listener);
  }) as typeof ipcMain.on;
}

export function getRemoteInvokeListener(channel: string): InvokeListener | undefined {
  return invokeListeners.get(channel);
}

export function dispatchRemoteEvent(channel: string, event: IpcMainEvent, ...args: unknown[]): boolean {
  const listener = eventListeners.get(channel);
  if (!listener) return false;
  listener(event, ...args);
  return true;
}
