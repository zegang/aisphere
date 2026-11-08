// App store

import { create } from 'zustand'; // Import Terminal icon
import {
  APP_LIST,
  APP_START,
  APP_STOP,
  APP_DELETE,
  APP_STATUS,
  APP_OPEN_INTERACTIVE_SHELL,
  APP_UPDATE,
  RUNTIME_ENGINE_START,
  RUNTIME_ENGINE_STATUS,
  SETTING_GET,
  SETTING_UPDATE,
} from '@/shared/channel-types';
import { Application, LifecycleActionResult, AppTask } from '@/types/api';
import { useLifecycleHistoryStore } from '@/stores/lifecycleHistoryStore';

/** Dialog shown when an app needs a runtime whose engine is not running. */
export interface RuntimeStartPrompt {
  appId: string;
  appName: string;
  runtime: string;
  stage: 'ask' | 'starting' | 'error';
  error?: string;
}

const runtimeLabel = (runtime: string) => {
  const label = runtime.charAt(0).toUpperCase() + runtime.slice(1);
  return label === 'Apptainer' ? 'Apptainer' : label;
};

const runtimeAutoStartKey = (runtime: string) => `runtime.autoStart.${runtime}`;

async function readRuntimeAutoStart(runtime: string): Promise<'always' | 'never' | undefined> {
  try {
    const result = await window.electron.invoke(SETTING_GET, runtimeAutoStartKey(runtime));
    const value = result?.data?.value;
    return value === 'always' || value === 'never' ? value : undefined;
  } catch {
    return undefined;
  }
}

async function writeRuntimeAutoStart(runtime: string, value: 'always' | 'never'): Promise<void> {
  try {
    await window.electron.invoke(SETTING_UPDATE, { key: runtimeAutoStartKey(runtime), value });
  } catch {
    // Preference persistence is best-effort; the dialog still works.
  }
}

interface AppStore {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  activeTerminalId: string | null;
  setActiveTerminalId: (id: string | null) => void;

  // Application Data & Lifecycle
  applications: Application[];
  lifecycleResultsByAppId: Record<string, LifecycleActionResult[]>;
  dismissLifecycleResults: (id: string) => void;
  isLoading: boolean;
  /** Pending "runtime is not running" dialog, if any. */
  runtimePrompt: RuntimeStartPrompt | null;
  fetchApplications: () => Promise<void>;
  startApplication: (id: string, args?: string[]) => Promise<void>;
  launchApplication: (id: string) => Promise<void>;
  confirmRuntimeStart: (remember: boolean) => Promise<void>;
  cancelRuntimeStart: (remember: boolean) => Promise<void>;
  dismissRuntimePrompt: () => void;
  stopApplication: (id: string) => Promise<boolean>;
  uninstallApplication: (id: string, confirmUser?: boolean) => Promise<boolean>;
  openApplicationShell: (id: string) => Promise<void>;
  refreshApplicationStatus: (id: string) => Promise<string>;
  inspectApplication: (id: string) => Promise<any>;
  updateApplication: (id: string, config: Record<string, unknown>) => Promise<boolean>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),
  applications: [],
  lifecycleResultsByAppId: {},
  dismissLifecycleResults: (id) => set((state) => {
    const { [id]: _dismissed, ...remaining } = state.lifecycleResultsByAppId;
    return { lifecycleResultsByAppId: remaining };
  }),
  activeTerminalId: null,
  setActiveTerminalId: (id) => set({ activeTerminalId: id }),
  isLoading: false,
  runtimePrompt: null,
  fetchApplications: async () => {
    set({ isLoading: true });
    try {
      const result = await window.electron.invoke(APP_LIST);
      if (result.success) {
        const apps = (result.data?.apps as Application[]) || [];
        set({ applications: apps });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  startApplication: async (id) => {
    const app = get().applications.find((a) => a.id === id);
    if (!app) return;

    const runtime = app.runtime?.runtime;
    if (runtime && runtime !== 'native') {
      try {
        const result = await window.electron.invoke(RUNTIME_ENGINE_STATUS, runtime);
        const status = result?.data;
        if (result?.success && status?.installed && !status?.running) {
          const preference = await readRuntimeAutoStart(runtime);
          if (preference === 'never') {
            const message = `The ${runtimeLabel(runtime)} runtime is not running. Start it manually, or change the auto-start choice in Settings.`;
            set((state) => ({
              applications: state.applications.map((a) => (a.id === id ? { ...a, error: message } : a)),
            }));
            return;
          }
          if (preference === 'always') {
            set((state) => ({
              applications: state.applications.map((a) =>
                a.id === id ? { ...a, error: undefined, task: { ...(a.task || {}), status: 'starting' } as any } : a
              ),
            }));
            const started = await window.electron.invoke(RUNTIME_ENGINE_START, runtime);
            if (!started.success) {
              const message = started.error || `Failed to start the ${runtimeLabel(runtime)} runtime.`;
              set((state) => ({
                applications: state.applications.map((a) =>
                  a.id === id ? { ...a, task: { status: 'failed' } as any, error: message } : a
                ),
              }));
              return;
            }
            await get().launchApplication(id);
            return;
          }

          // Ask the user (once, or every time) whether AiSphere should start
          // the runtime engine for them.
          set({
            runtimePrompt: {
              appId: id,
              appName: app.name,
              runtime,
              stage: 'ask',
            },
          });
          return;
        }
      } catch {
        // Fall through: APP_START reports a precise error for other failures.
      }
    }

    await get().launchApplication(id);
  },

  launchApplication: async (id) => {
    const appName = get().applications.find((app) => app.id === id)?.name ?? id;
    set((state) => ({
      applications: state.applications.map((a) => (a.id === id ? { ...a, task: { ...(a.task || {}), status: 'starting' } as any, error: undefined } : a)),
    }));
    const result = await window.electron.invoke(APP_START, id);
    if (result.success) {
      await get().fetchApplications();
      const lifecycleRuns = result.data?.lifecycleRuns;
      useLifecycleHistoryStore.getState().recordRuns('app', id, appName, lifecycleRuns);
      const lifecycleResults = lifecycleRuns?.flatMap((run) => run.results);
      if (lifecycleResults?.length) {
        set((state) => ({
          lifecycleResultsByAppId: {
            ...state.lifecycleResultsByAppId,
            [id]: lifecycleResults,
          },
        }));
      }
    } else {
      set((state) => ({
        applications: state.applications.map((a) =>
          a.id === id ? { ...a, task: { status: 'failed' } as any, error: result.error || 'Launch failed' } : a
        ),
      }));
    }
  },

  confirmRuntimeStart: async (remember) => {
    const prompt = get().runtimePrompt;
    if (!prompt || prompt.stage === 'starting') return;

    if (remember) await writeRuntimeAutoStart(prompt.runtime, 'always');

    set((state) => ({
      runtimePrompt: { ...prompt, stage: 'starting', error: undefined },
      applications: state.applications.map((a) =>
        a.id === prompt.appId ? { ...a, error: undefined, task: { ...(a.task || {}), status: 'starting' } as any } : a
      ),
    }));

    const result = await window.electron.invoke(RUNTIME_ENGINE_START, prompt.runtime);
    if (!result.success) {
      const message = result.error || `Failed to start the ${runtimeLabel(prompt.runtime)} runtime.`;
      set((state) => ({
        runtimePrompt: { ...prompt, stage: 'error', error: message },
        applications: state.applications.map((a) =>
          a.id === prompt.appId ? { ...a, task: { status: 'failed' } as any, error: message } : a
        ),
      }));
      return;
    }

    set({ runtimePrompt: null });
    await get().launchApplication(prompt.appId);
  },

  cancelRuntimeStart: async (remember) => {
    const prompt = get().runtimePrompt;
    if (!prompt) return;
    if (remember) await writeRuntimeAutoStart(prompt.runtime, 'never');
    set({ runtimePrompt: null });
  },

  dismissRuntimePrompt: () => set({ runtimePrompt: null }),

  stopApplication: async (id) => {
    const app = get().applications.find((a) => a.id === id);
    if (!app?.task) return false;

    set((state) => ({
      applications: state.applications.map((a) => (a.id === id && a.task ? { ...a, task: { ...a.task, status: 'stopping' } } : a)),
    }));
    const result = await window.electron.invoke(APP_STOP, id);
    if (result.success) {
      const lifecycleRuns = result.data?.lifecycleRuns;
      useLifecycleHistoryStore.getState().recordRuns('app', id, app.name, lifecycleRuns);
      const lifecycleResults = lifecycleRuns?.flatMap((run) => run.results);
      if (lifecycleResults?.length) {
        set((state) => ({
          lifecycleResultsByAppId: {
            ...state.lifecycleResultsByAppId,
            [id]: lifecycleResults,
          },
        }));
      }
      await get().fetchApplications();
    }
    return result.success;
  },
  uninstallApplication: async (id, confirmUser = true): Promise<boolean> => {
    if (confirmUser && !confirm('Are you sure you want to uninstall this application? All data within the app folder will be removed.')) {
      return false;
    }
    const result = await window.electron.invoke(APP_DELETE, id);
    if (result.success) {
      const app = get().applications.find((item) => item.id === id);
      useLifecycleHistoryStore.getState().recordRuns(
        'app',
        id,
        app?.name ?? id,
        result.data?.lifecycleRuns,
      );
      await get().fetchApplications();
    }
    return result.success;
  },
  refreshApplicationStatus: async (id) => {
    try {
      const result = await window.electron.invoke(APP_STATUS, id);
      const status = result.success && result.data ? result.data.status : 'unknown';

      set((state) => ({
        applications: state.applications.map((a) => {
          if (a.id !== id) return a;
          if (status === 'unknown') return { ...a, status: 'unknown', task: undefined };
          return {
            ...a,
            // Keep the backend's answer on the app itself as well as the
            // cached task, so views that read `app.status` stay accurate even
            // if the task metadata has not been (re)fetched yet.
            status,
            task: a.task ? { ...a.task, status: status as AppTask['status'] } : undefined,
          };
        }),
      }));
      return status;
    } catch (error) {
      console.error('Failed to check app status:', error);
      set((state) => ({
        applications: state.applications.map((a) => (a.id === id ? { ...a, status: 'unknown', task: undefined } : a)),
      }));
      return 'unknown';
    }
  },
  openApplicationShell: async (id) => {
    try {
      const result = await window.electron.invoke(APP_OPEN_INTERACTIVE_SHELL, id);
      if (!result.success) {
        console.error('Failed to open interactive shell:', result.error);
      }
    } catch (error) {
      console.error('Failed to open interactive shell:', error);
    }
  },
  inspectApplication: async (id) => {
    try {
      const result = await window.electron.invoke('app:inspect' as any, id);
      if (result.success) return result.data;
      return null;
    } catch (error) {
      console.error('Failed to inspect app:', error);
      return null;
    }
  },
  updateApplication: async (id, config) => {
    const result = await window.electron.invoke(APP_UPDATE, { id, config });
    if (result.success) {
      await get().fetchApplications();
      return true;
    }
    return false;
  },
}));
