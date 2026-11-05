// Runtime store
//
// Installation progress lives here instead of inside RuntimePage so that it
// survives navigating to another page and back. IPC subscriptions are set up
// once, when this module is loaded, and keep collecting output while no runtime
// page is mounted.

import { create } from 'zustand';
import {
  RUNTIME_CHECK,
  RUNTIME_INSTALL,
  RUNTIME_INSTALL_ABORT,
  RUNTIME_INSTALL_STATUS,
  runtimeInstallOutputChannel,
  runtimeInstallStatusChannel,
  type RuntimeInstallState,
  type RuntimeInstallStatusEvent,
  type RuntimeKind,
} from '@/shared/channel-types';

export const RUNTIME_KINDS: RuntimeKind[] = ['docker', 'podman', 'apptainer', 'conda'];

const ACTIVE_INSTALL_STATES: RuntimeInstallState[] = ['starting', 'downloading', 'installing'];

/** Cap the buffered log so a long-running download cannot grow without bound. */
const MAX_LOG_LENGTH = 400_000;

export interface RuntimeCheckStatus {
  type: RuntimeKind;
  installed: boolean;
  version?: string;
  loading?: boolean;
}

/**
 * Buffered terminal output. `start` is the absolute character offset of
 * `text[0]`, which lets the terminal write only newly appended data even after
 * the beginning of the buffer has been trimmed.
 */
export interface RuntimeLogBuffer {
  text: string;
  start: number;
}

export function isRuntimeInstallActive(status?: RuntimeInstallStatusEvent): boolean {
  return !!status && ACTIVE_INSTALL_STATES.includes(status.state);
}

export function appendToLogBuffer(buffer: RuntimeLogBuffer | undefined, chunk: string): RuntimeLogBuffer {
  let text = (buffer?.text ?? '') + chunk;
  let start = buffer?.start ?? 0;
  if (text.length > MAX_LOG_LENGTH) {
    const drop = text.length - MAX_LOG_LENGTH;
    text = text.slice(drop);
    start += drop;
  }
  return { text, start };
}

function createInitialStatuses(): RuntimeCheckStatus[] {
  return RUNTIME_KINDS.map((type) => ({ type, installed: false, loading: true }));
}

interface RuntimeStore {
  statuses: RuntimeCheckStatus[];
  installs: Partial<Record<RuntimeKind, RuntimeInstallStatusEvent>>;
  logs: Record<string, RuntimeLogBuffer>;
  /** Runtime whose installation terminal is open, or null when hidden. */
  logPanelType: RuntimeKind | null;
  /** True when the user closed the terminal; do not reopen it automatically. */
  logPanelDismissed: boolean;

  checkRuntimes: () => Promise<void>;
  syncInstallStatus: () => Promise<void>;
  installRuntime: (type: RuntimeKind) => Promise<void>;
  abortInstall: (type: RuntimeKind) => Promise<void>;
  openLogPanel: (type: RuntimeKind) => void;
  closeLogPanel: () => void;
}

let subscriptionsReady = false;

/**
 * Subscribes to the install output/status channels for every runtime. The
 * listeners intentionally live for the whole renderer session: they are what
 * keeps progress visible after RuntimePage unmounts.
 */
function ensureSubscriptions(): void {
  if (subscriptionsReady) return;
  if (typeof window === 'undefined' || !window.electron?.on) return;
  subscriptionsReady = true;

  for (const type of RUNTIME_KINDS) {
    window.electron.on(runtimeInstallOutputChannel(type), (...args: unknown[]) => {
      const chunk = String(args[0] ?? '');
      if (!chunk) return;
      useRuntimeStore.setState((state) => ({
        logs: { ...state.logs, [type]: appendToLogBuffer(state.logs[type], chunk) },
      }));
    });

    window.electron.on(runtimeInstallStatusChannel(type), (...args: unknown[]) => {
      const status = args[0] as RuntimeInstallStatusEvent | undefined;
      if (!status || status.type !== type) return;
      useRuntimeStore.setState((state) => {
        const previous = state.installs[type];
        // Events can overtake the reply of the status-sync invocation.
        if (previous && previous.at > status.at) return state;
        return { installs: { ...state.installs, [type]: status } };
      });
    });
  }
}

export const useRuntimeStore = create<RuntimeStore>((set, get) => ({
  statuses: createInitialStatuses(),
  installs: {},
  logs: {},
  logPanelType: null,
  logPanelDismissed: false,

  checkRuntimes: async () => {
    set((state) => ({
      statuses: state.statuses.map((status) => ({ ...status, loading: true })),
    }));
    try {
      const result = await window.electron.invoke(RUNTIME_CHECK);
      if (result.success) {
        const runtimes = (result.data?.runtimes ?? []) as RuntimeCheckStatus[];
        set({
          statuses: RUNTIME_KINDS.map((type) => {
            const found = runtimes.find((runtime) => runtime.type === type);
            return { type, installed: !!found?.installed, version: found?.version, loading: false };
          }),
        });
      } else {
        set((state) => ({
          statuses: state.statuses.map((status) => ({ ...status, loading: false })),
        }));
      }
    } catch {
      set((state) => ({
        statuses: state.statuses.map((status) => ({ ...status, loading: false })),
      }));
    }
  },

  syncInstallStatus: async () => {
    ensureSubscriptions();
    try {
      const result = await window.electron.invoke(RUNTIME_INSTALL_STATUS);
      if (!result.success) return;
      const statuses = (result.data?.statuses ?? []) as RuntimeInstallStatusEvent[];

      set((state) => {
        const installs = { ...state.installs };
        for (const status of statuses) {
          const previous = installs[status.type];
          if (!previous || previous.at <= status.at) {
            installs[status.type] = status;
          }
        }
        // Reopen the terminal when an installation is still running, so a user
        // who comes back to the page immediately sees its progress. Respect an
        // explicit close by the user.
        const active = statuses.find((status) => isRuntimeInstallActive(status));
        return {
          installs,
          logPanelType: state.logPanelType
            ?? (state.logPanelDismissed ? null : active?.type ?? null),
        };
      });
    } catch {
      // Status sync is best-effort; the page still works from events alone.
    }
  },

  installRuntime: async (type: RuntimeKind) => {
    ensureSubscriptions();
    const current = get().installs[type];
    if (isRuntimeInstallActive(current)) {
      set({ logPanelType: type, logPanelDismissed: false });
      return;
    }

    set((state) => ({
      logPanelType: type,
      logPanelDismissed: false,
      logs: { ...state.logs, [type]: { text: '', start: 0 } },
      installs: {
        ...state.installs,
        [type]: { type, state: 'starting', message: 'Preparing installation...', at: Date.now() },
      },
    }));

    const append = (chunk: string) => {
      set((state) => ({
        logs: { ...state.logs, [type]: appendToLogBuffer(state.logs[type], chunk) },
      }));
    };

    append(`\x1b[1;34mStarting ${type} installation...\x1b[0m\r\n`);

    try {
      const result = await window.electron.invoke(RUNTIME_INSTALL, type);
      if (!result.success) {
        const message = result.error || 'Installation failed';
        append(`\r\n\x1b[1;31m${message}\x1b[0m\r\n`);
        set((state) => {
          const status = state.installs[type];
          if (status && !isRuntimeInstallActive(status)) return state;
          return {
            installs: {
              ...state.installs,
              [type]: { type, state: 'failed', message, at: Date.now() },
            },
          };
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      append(`\r\n\x1b[1;31m${message}\x1b[0m\r\n`);
      set((state) => ({
        installs: {
          ...state.installs,
          [type]: { type, state: 'failed', message, at: Date.now() },
        },
      }));
    } finally {
      await get().checkRuntimes();
    }
  },

  abortInstall: async (type: RuntimeKind) => {
    const append = (chunk: string) => {
      set((state) => ({
        logs: { ...state.logs, [type]: appendToLogBuffer(state.logs[type], chunk) },
      }));
    };
    append('\r\n\x1b[1;33mAbort requested. Stopping installer...\x1b[0m\r\n');
    try {
      const result = await window.electron.invoke(RUNTIME_INSTALL_ABORT, type);
      if (!result.success) {
        append(`\r\n\x1b[1;31m${result.error || 'Unable to abort the installation'}\x1b[0m\r\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      append(`\r\n\x1b[1;31m${message}\x1b[0m\r\n`);
    }
  },

  openLogPanel: (type) => set({ logPanelType: type, logPanelDismissed: false }),
  closeLogPanel: () => set({ logPanelType: null, logPanelDismissed: true }),
}));

// Register as early as possible so output produced between page switches is
// not lost. In a plain browser there is no electron bridge and this is a no-op.
ensureSubscriptions();
