// App store

import { create } from 'zustand'; // Import Terminal icon
import { APP_LIST, APP_START, APP_STOP, APP_DELETE, APP_STATUS, APP_OPEN_INTERACTIVE_SHELL, APP_UPDATE } from '@/shared/channel-types';
import { Application } from '@/types/api';

interface AppStore {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  activeTerminalId: string | null;
  setActiveTerminalId: (id: string | null) => void;

  // Application Data & Lifecycle
  applications: Application[];
  isLoading: boolean;
  fetchApplications: () => Promise<void>;
  startApplication: (id: string, args?: string[]) => Promise<void>;
  stopApplication: (id: string) => Promise<void>;
  uninstallApplication: (id: string) => Promise<boolean>;
  openApplicationShell: (id: string) => Promise<void>;
  refreshApplicationStatus: (id: string) => Promise<string>;
  inspectApplication: (id: string) => Promise<any>;
  updateApplication: (id: string, config: Record<string, unknown>) => Promise<boolean>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  selectedId: null,
  setSelectedId: (id) => set({ selectedId: id }),
  applications: [],
  activeTerminalId: null,
  setActiveTerminalId: (id) => set({ activeTerminalId: id }),
  isLoading: false,
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
    set((state) => ({
      applications: state.applications.map((a) => (a.id === id ? { ...a, task: { ...(a.task || {}), status: 'starting' } as any, error: undefined } : a)),
    }));
    const result = await window.electron.invoke(APP_START, id);
    if (result.success) {
      await get().fetchApplications();
    } else {
      set((state) => ({
        applications: state.applications.map((a) => 
          a.id === id ? { ...a, task: { status: 'failed' } as any, error: result.error || 'Launch failed' } : a
        ),
      }));
    }
  },
  stopApplication: async (id) => {
    const app = get().applications.find((a) => a.id === id);
    if (!app?.task) return;

    set((state) => ({
      applications: state.applications.map((a) => (a.id === id && a.task ? { ...a, task: { ...a.task, status: 'stopping' } } : a)),
    }));
    const result = await window.electron.invoke(APP_STOP, id);
    if (result.success) {
      await get().fetchApplications();
    }
  },
  uninstallApplication: async (id): Promise<boolean> => {
    if (!confirm('Are you sure you want to uninstall this application? All data within the app folder will be removed.')) {
      return false;
    }
    const result = await window.electron.invoke(APP_DELETE, id);
    if (result.success) {
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
          return { ...a, task: a.task ? { ...a.task, status: status as any } : undefined };
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
