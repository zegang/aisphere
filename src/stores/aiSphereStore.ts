import { create } from 'zustand';
import { useAppStore } from './appStore';

export type AiSphereView = 'home' | 'apps' | 'explore' | 'settings' | 'appworkspace' | 'runtimes' | 'exploredetail';

interface AiSphereStore {
  view: AiSphereView;
  setView: (view: AiSphereView) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  openWorkspace: (id: string) => void;
}

export const useAiSphereStore = create<AiSphereStore>((set) => ({
  view: 'home',
  setView: (view) => set({ view }),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openWorkspace: (id) => {
    useAppStore.setState({ selectedId: id });
    set({ view: 'appworkspace' });
  },
}));