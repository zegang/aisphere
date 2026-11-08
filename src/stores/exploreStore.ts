import { create } from 'zustand';
import {
  EXPLORE_LIST,
  EXPLORE_INSTALL,
  RUNTIME_CHECK,
  SETTING_GET,
  type RuntimeKind,
} from '@/shared/channel-types';
import { Application } from '@/types/api';
import { useWorkspaceStore } from './workspaceStore';
import { useAiSphereStore, type AiSphereView } from './aiSphereStore';
import { SettingKey } from '@/shared/types';

export interface RuntimeInstallPrompt {
  app: Application;
  runtime: RuntimeKind;
  returnView: AiSphereView;
  stage: 'ask' | 'installing' | 'error';
  error?: string;
}

interface ExploreState {
  applications: Application[];
  loading: boolean;
  installingId: string | null;
  installProgress: Record<string, number | null>;
  installLogs: Record<string, string[]>;
  installErrors: Record<string, string>;
  runtimeInstallPrompt: RuntimeInstallPrompt | null;
  selectedAppId: string | null;
  search: string;
  selectedKind: string;
  selectedCategory: string;
  selectedType: string;
  selectedPlatform: string;
  selectedRuntime: string;

  // Actions
  loadApplications: () => Promise<void>;
  setSearch: (search: string) => void;
  setKind: (kind: string) => void;
  setCategory: (category: string) => void;
  setType: (type: string) => void;
  setPlatform: (platform: string) => void;
  setRuntime: (runtime: string) => void;
  clearFilters: () => void;
  installApplication: (app: Application, runtimeReady?: boolean) => Promise<boolean>;
  setRuntimeInstallPrompt: (prompt: RuntimeInstallPrompt | null) => void;
  setSelectedAppId: (id: string | null) => void;
}

export const useExploreStore = create<ExploreState>((set, get) => ({
  applications: [],
  loading: false,
  installingId: null,
  installProgress: {},
  installLogs: {},
  installErrors: {},
  runtimeInstallPrompt: null,
  selectedAppId: null,
  search: '',
  selectedKind: 'All',
  selectedCategory: 'All',
  selectedType: 'All',
  selectedPlatform: 'All',
  selectedRuntime: 'All',

  loadApplications: async () => {
    set({ loading: true });
    try {
      const result = await window.electron.invoke(EXPLORE_LIST);
      if (result.success) {
        set({ applications: result.data?.apps || [], loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error) {
      console.error('Failed to load applications:', error);
      set({ loading: false });
    }
  },

  setSearch: (search) => set({ search }),
  setKind: (selectedKind) => set({ selectedKind }),
  setCategory: (selectedCategory) => set({ selectedCategory }),
  setType: (selectedType) => set({ selectedType }),
  setPlatform: (selectedPlatform) => set({ selectedPlatform }),
  setRuntime: (selectedRuntime) => set({ selectedRuntime }),
  clearFilters: () => set({ search: '', selectedKind: 'All', selectedCategory: 'All', selectedType: 'All', selectedPlatform: 'All', selectedRuntime: 'All' }),

  installApplication: async (app, runtimeReady = false) => {
    if (get().installingId || app.install?.installed) return false;
    const appId = app.id;
    const requestRuntimeInstall = async (runtime: RuntimeKind) => {
      const setting = await window.electron.invoke(SETTING_GET, SettingKey.RuntimeAutoInstall);
      if (!setting.success) throw new Error(setting.error ?? 'Could not read the runtime auto-install preference.');
      const preference = setting.data?.value === 'always' || setting.data?.value === 'never'
        ? setting.data.value
        : 'ask';
      if (preference === 'never') {
        const message = `${runtime} is required to install ${app.name}. Install it from the Runtimes page or change Runtime auto-install in Settings.`;
        set((state) => ({ installErrors: { ...state.installErrors, [appId]: message } }));
        return false;
      }

      const returnView = useAiSphereStore.getState().view;
      set((state) => ({
        installErrors: { ...state.installErrors, [appId]: '' },
        runtimeInstallPrompt: {
          app,
          runtime,
          returnView,
          stage: preference === 'always' ? 'installing' : 'ask',
        },
      }));
      return false;
    };

    const logChannel = `app:install:log:${appId}`;
    const progressChannel = `app:install:progress:${appId}`;
    const logHandler = (value: unknown) => {
      const line = String(value ?? '');
      if (!line) return;
      set((state) => ({
        installLogs: {
          ...state.installLogs,
          [appId]: [...(state.installLogs[appId] ?? []), line].slice(-100),
        },
      }));
    };
    const progressHandler = (value: unknown) => {
      const percentage = (value as { percentage?: unknown } | null)?.percentage;
      if (typeof percentage === 'number' && Number.isFinite(percentage)) {
        set((state) => ({
          installProgress: { ...state.installProgress, [appId]: Math.max(0, Math.min(100, percentage)) },
        }));
      }
    };
    try {
      const runtime = app.runtime?.runtime;
      if (!runtimeReady && runtime && runtime !== 'native') {
        const check = await window.electron.invoke(RUNTIME_CHECK);
        if (!check.success) throw new Error(check.error ?? 'Could not check installed runtimes.');
        const installed = (check.data?.runtimes ?? []).some(
          (item: { type: string; installed: boolean }) => item.type === runtime && item.installed,
        );
        if (!installed) return await requestRuntimeInstall(runtime);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set((state) => ({ installErrors: { ...state.installErrors, [appId]: message } }));
      return false;
    }

    set((state) => ({
      installingId: appId,
      installProgress: { ...state.installProgress, [appId]: 0 },
      installLogs: { ...state.installLogs, [appId]: [] },
      installErrors: { ...state.installErrors, [appId]: '' },
      applications: state.applications.map((item) =>
        item.id === appId
          ? { ...item, install: { ...item.install, installed: false, status: 'installing' } }
          : item
      ),
    }));
    window.electron.on(logChannel, logHandler);
    window.electron.on(progressChannel, progressHandler);
    try {
      const result = await window.electron.invoke(EXPLORE_INSTALL, app);
      if (result.success && result.data) {
        const installedInfo = { ...result.data, id: appId };
        set((state) => ({
          applications: state.applications.map((a) =>
            a.id === appId ? { ...a, ...installedInfo, id: appId } : a
          ),
        }));
        // Ingest the installed components (MCP servers, skills, agents,
        // hooks, instructions…) into the workspace registry so every
        // workspace can immediately use what the new app provides.
        useWorkspaceStore.getState().registerAppComponents(result.data as Application);
        return true;
      } else {
        const missingRuntime = result.data?.runtimeMissing as RuntimeKind | undefined;
        if (missingRuntime) return await requestRuntimeInstall(missingRuntime);
        const aborted = result.data?.install?.status === 'aborted';
        const error = aborted ? '' : result.error ?? `Installation of ${app.name} failed.`;
        set((state) => ({
          installErrors: { ...state.installErrors, [appId]: error },
          applications: result.data
            ? state.applications.map((a) =>
                a.id === appId ? { ...a, ...result.data, id: appId } : a
              )
            : state.applications,
        }));
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to install ${app.name}:`, error);
      set((state) => ({ installErrors: { ...state.installErrors, [appId]: message } }));
      return false;
    } finally {
      window.electron.removeListener(logChannel, logHandler);
      window.electron.removeListener(progressChannel, progressHandler);
      set({ installingId: null });
    }
  },
  setRuntimeInstallPrompt: (runtimeInstallPrompt) => set({ runtimeInstallPrompt }),
  setSelectedAppId: (selectedAppId) => set({ selectedAppId }),
}));