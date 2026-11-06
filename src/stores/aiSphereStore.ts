import { create } from 'zustand';
import { useAppStore } from './appStore';
import type { RuntimeKind } from '@/shared/channel-types';

export type AiSphereView =
  | 'home'
  | 'apps'
  | 'explore'
  | 'settings'
  | 'appworkspace'
  | 'runtimes'
  | 'runtimedetail'
  | 'exploredetail'
  | 'note';

interface AiSphereStore {
  view: AiSphereView;
  setView: (view: AiSphereView) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  selectedRuntime: RuntimeKind | null;
  openRuntimeDetail: (type: RuntimeKind) => void;
  openWorkspace: (id: string) => void;
}

export const useAiSphereStore = create<AiSphereStore>((set) => ({
  view: 'home',
  setView: (view) => set({ view }),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  selectedRuntime: null,
  openRuntimeDetail: (type) => set({ selectedRuntime: type, view: 'runtimedetail' }),
  openWorkspace: (id) => {
    useAppStore.setState({ selectedId: id });
    set({ view: 'appworkspace' });
  },
}));
