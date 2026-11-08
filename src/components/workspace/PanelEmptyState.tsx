// Consistent empty state for the workspace right panel tabs. Keeps the
// "nothing attached yet" screen useful: icon, explanation and a primary action
// that opens the Browse catalog.

import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';

interface PanelEmptyStateProps {
  icon: ReactNode;
  title: string;
  hint: string;
  actionLabel: string;
  onAction: () => void;
}

export function PanelEmptyState({ icon, title, hint, actionLabel, onAction }: PanelEmptyStateProps) {
  return (
    <div className="mx-1 mt-2 rounded-2xl border border-dashed border-light-border bg-light-bg/60 px-5 py-8 text-center dark:border-dark-border dark:bg-dark-bg/40">
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
        {icon}
      </span>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="mx-auto mt-1 max-w-[15rem] text-[11px] leading-relaxed text-light-subtle dark:text-dark-subtle">
        {hint}
      </p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
      >
        <Plus className="h-3.5 w-3.5" /> {actionLabel}
      </button>
    </div>
  );
}

export default PanelEmptyState;
