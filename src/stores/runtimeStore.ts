// Runtime store
//
// Installation progress lives here instead of inside RuntimePage so that it
// survives navigating to another page and back. IPC subscriptions are set up
// once, when this module is loaded, and keep collecting output while no runtime
// page is mounted.

import { create } from 'zustand';
import {
  RUNTIME_CHECK,
  RUNTIME_ENGINE_START,
  RUNTIME_ENGINE_STATUS,
  RUNTIME_ENGINE_STOP,
  RUNTIME_INSTALL,
  RUNTIME_INSTALL_ABORT,
  RUNTIME_INSTALL_STATUS,
  RUNTIME_UNINSTALL,
  runtimeInstallOutputChannel,
  runtimeInstallStatusChannel,
  type RuntimeEngineStatus,
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
  /** True when the runtime lives inside the AiSphere data folder. */
  managed?: boolean;
  version?: string;
  loading?: boolean;
  /** True for runtimes that have a background engine (Docker / Podman). */
  hasEngine?: boolean;
  /** Engine/daemon state. Undefined when it has not been checked yet. */
  running?: boolean;
  /** Last error from starting this runtime's engine. */
  engineError?: string;
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
  return RUNTIME_KINDS.map((type) => ({
    type,
    installed: false,
    loading: true,
    hasEngine: type === 'docker' || type === 'podman',
  }));
}

interface RuntimeStore {
  statuses: RuntimeCheckStatus[];
  installs: Partial<Record<RuntimeKind, RuntimeInstallStatusEvent>>;
  logs: Record<string, RuntimeLogBuffer>;
  /** Runtime whose installation terminal is open, or null when hidden. */
  logPanelType: RuntimeKind | null;
  /** True when the user closed the terminal; do not reopen it automatically. */
  logPanelDismissed: boolean;
  /** Runtimes whose uninstall is currently running. */
  uninstalling: Partial<Record<RuntimeKind, boolean>>;
  /** Runtimes whose engine is currently being started. */
  starting: Partial<Record<RuntimeKind, boolean>>;
  /** Runtimes whose engine is currently being stopped. */
  stopping: Partial<Record<RuntimeKind, boolean>>;

  checkRuntimes: () => Promise<void>;
  startEngine: (type: RuntimeKind) => Promise<boolean>;
  stopEngine: (type: RuntimeKind) => Promise<boolean>;
  syncInstallStatus: () => Promise<void>;
  installRuntime: (type: RuntimeKind) => Promise<void>;
  uninstallRuntime: (type: RuntimeKind) => Promise<boolean>;
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
  uninstalling: {},
  starting: {},
  stopping: {},

  checkRuntimes: async () => {
    set((state) => ({
      statuses: state.statuses.map((status) => ({ ...status, loading: true })),
    }));
    try {
      const result = await window.electron.invoke(RUNTIME_CHECK);
      if (result.success) {
        const runtimes = (result.data?.runtimes ?? []) as RuntimeCheckStatus[];

        // Engine state is not part of the lightweight install check, so probe
        // Docker/Podman daemons (and CLI-only runtimes) separately. A failure
        // leaves the state unknown instead of claiming the engine is stopped.
        const engineStatuses: Partial<Record<RuntimeKind, RuntimeEngineStatus>> = {};
        await Promise.all(
          runtimes
            .filter((runtime) => runtime.installed)
            .map(async (runtime) => {
              try {
                const engine = await window.electron.invoke(RUNTIME_ENGINE_STATUS, runtime.type);
                if (engine.success && engine.data) {
                  engineStatuses[runtime.type] = engine.data;
                }
              } catch {
                // Keep the state unknown.
              }
            }),
        );

        set({
          statuses: RUNTIME_KINDS.map((type) => {
            const found = runtimes.find((runtime) => runtime.type === type);
            const engine = engineStatuses[type];
            return {
              type,
              installed: !!found?.installed,
              managed: !!found?.managed,
              version: found?.version,
              hasEngine: type === 'docker' || type === 'podman',
              running: found?.installed ? engine?.running : false,
              loading: false,
            };
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

  startEngine: async (type) => {
    if (get().starting[type]) return false;
    set((state) => ({
      starting: { ...state.starting, [type]: true },
      statuses: state.statuses.map((status) =>
        status.type === type ? { ...status, engineError: undefined } : status,
      ),
    }));

    try {
      const result = await window.electron.invoke(RUNTIME_ENGINE_START, type);
      if (!result.success) {
        const message = result.error || 'Failed to start the runtime engine.';
        set((state) => ({
          statuses: state.statuses.map((status) =>
            status.type === type ? { ...status, engineError: message } : status,
          ),
        }));
        return false;
      }
      await get().checkRuntimes();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => ({
        statuses: state.statuses.map((status) =>
          status.type === type ? { ...status, engineError: message } : status,
        ),
      }));
      return false;
    } finally {
      set((state) => ({ starting: { ...state.starting, [type]: false } }));
    }
  },

  stopEngine: async (type) => {
    if (get().stopping[type]) return false;
    set((state) => ({
      stopping: { ...state.stopping, [type]: true },
      statuses: state.statuses.map((status) =>
        status.type === type ? { ...status, engineError: undefined } : status,
      ),
    }));

    try {
      const result = await window.electron.invoke(RUNTIME_ENGINE_STOP, type);
      if (!result.success) {
        const message = result.error || 'Failed to stop the runtime engine.';
        set((state) => ({
          statuses: state.statuses.map((status) =>
            status.type === type ? { ...status, engineError: message } : status,
          ),
        }));
        return false;
      }
      await get().checkRuntimes();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => ({
        statuses: state.statuses.map((status) =>
          status.type === type ? { ...status, engineError: message } : status,
        ),
      }));
      return false;
    } finally {
      set((state) => ({ stopping: { ...state.stopping, [type]: false } }));
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

  uninstallRuntime: async (type: RuntimeKind) => {
    ensureSubscriptions();
    if (isRuntimeInstallActive(get().installs[type])) {
      set({ logPanelType: type, logPanelDismissed: false });
      return false;
    }

    const append = (chunk: string) => {
      set((state) => ({
        logs: { ...state.logs, [type]: appendToLogBuffer(state.logs[type], chunk) },
      }));
    };

    set((state) => ({
      uninstalling: { ...state.uninstalling, [type]: true },
      logPanelType: type,
      logPanelDismissed: false,
      logs: { ...state.logs, [type]: { text: '', start: 0 } },
      installs: {
        ...state.installs,
        [type]: { type, state: 'installing', message: `Uninstalling ${type}...`, at: Date.now() },
      },
    }));
    append(`\x1b[1;33mUninstalling ${type}...\x1b[0m\r\n`);

    try {
      const result = await window.electron.invoke(RUNTIME_UNINSTALL, type);
      if (!result.success) {
        const message = result.error || 'Uninstall failed';
        append(`\r\n\x1b[1;31m${message}\x1b[0m\r\n`);
        set((state) => ({
          installs: {
            ...state.installs,
            [type]: { type, state: 'failed', message, at: Date.now() },
          },
        }));
        return false;
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      append(`\r\n\x1b[1;31m${message}\x1b[0m\r\n`);
      set((state) => ({
        installs: {
          ...state.installs,
          [type]: { type, state: 'failed', message, at: Date.now() },
        },
      }));
      return false;
    } finally {
      set((state) => ({ uninstalling: { ...state.uninstalling, [type]: false } }));
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
