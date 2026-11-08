import { create } from 'zustand';
import type { LifecycleActionRun, LifecycleActionResult } from '@/types/api';

export interface LifecycleHistoryEntry {
  id: string;
  ownerType: 'app' | 'runtime';
  ownerId: string;
  ownerName: string;
  hook: LifecycleActionRun['hook'];
  occurredAt: number;
  results: LifecycleActionResult[];
}

interface LifecycleHistoryStore {
  entries: LifecycleHistoryEntry[];
  recordRuns: (
    ownerType: LifecycleHistoryEntry['ownerType'],
    ownerId: string,
    ownerName: string,
    runs?: LifecycleActionRun[],
  ) => void;
}

const MAX_HISTORY_ENTRIES = 200;

export const useLifecycleHistoryStore = create<LifecycleHistoryStore>((set) => ({
  entries: [],
  recordRuns: (ownerType, ownerId, ownerName, runs) => {
    const occurredAt = Date.now();
    const records = (runs ?? [])
      .filter((run) => run.results.length > 0)
      .map((run, index) => ({
        id: `${occurredAt}-${index}-${Math.random().toString(36).slice(2)}`,
        ownerType,
        ownerId,
        ownerName,
        hook: run.hook,
        occurredAt,
        results: run.results,
      }));
    if (records.length === 0) return;
    set((state) => ({ entries: [...records, ...state.entries].slice(0, MAX_HISTORY_ENTRIES) }));
  },
}));
