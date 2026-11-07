import { create } from 'zustand';
import { EXPLORE_LIST, EXPLORE_INSTALL  } from '@/shared/channel-types';
import { Application } from '@/types/api';
import { useWorkspaceStore } from './workspaceStore';

interface ExploreState {
  applications: Application[];
  loading: boolean;
  installingId: string | null;
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
  installApplication: (app: Application) => Promise<void>;
  setSelectedAppId: (id: string | null) => void;
}

export const useExploreStore = create<ExploreState>((set) => ({
  applications: [],
  loading: false,
  installingId: null,
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

  installApplication: async (app) => {
    set({ installingId: app.id });
    try {
      const result = await window.electron.invoke(EXPLORE_INSTALL, app);
      if (result.success && result.data) {
        // Update the local applications list with the returned installed info
        set((state) => ({
          installingId: null,
          applications: state.applications.map((a) =>
            a.id === app.id ? { ...a, ...result.data } : a
          ),
        }));
        // Ingest the installed components (MCP servers, skills, agents,
        // hooks, instructions…) into the workspace registry so every
        // workspace can immediately use what the new app provides.
        useWorkspaceStore.getState().registerAppComponents(result.data as Application);
        console.log(`Installation for ${app.name} initiated successfully.`);
      } else {
        set({ installingId: null });
      }
    } catch (error) {
      console.error('Failed to initiate installation:', error);
      set({ installingId: null });
    }
  },
  setSelectedAppId: (selectedAppId) => set({ selectedAppId }),
}));