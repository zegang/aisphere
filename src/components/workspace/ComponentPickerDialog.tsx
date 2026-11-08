// Shared "Browse" dialog for the workspace right panel. Each panel (Agents,
// Skills, MCP) lists only what the current workspace has attached, and this
// dialog is the single place where the user discovers everything installed in
// AiSphere and opts components in or out of the workspace.

import { useMemo, useState, type ReactNode } from 'react';
import { Check, Search, X } from 'lucide-react';
import { useTranslation } from '@/i18n';

export type PickerKind = 'agents' | 'skills' | 'mcp';

export interface PickerItem {
  id: string;
  title: string;
  description?: string;
  /** Emoji or icon rendered in the leading square. */
  leading?: ReactNode;
  /** Optional badge next to the title (built-in, transport, source…). */
  badge?: ReactNode;
  /** Optional footnote, e.g. "2 skills · 2 tools". */
  meta?: string;
}

interface ComponentPickerDialogProps {
  kind: PickerKind;
  items: PickerItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  /** Agents are single-select: choosing one binds it and closes the dialog. */
  singleSelect?: boolean;
}

export function ComponentPickerDialog({
  kind,
  items,
  selectedIds,
  onToggle,
  onClose,
  singleSelect = false,
}: ComponentPickerDialogProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      item.title.toLowerCase().includes(needle)
      || (item.description ?? '').toLowerCase().includes(needle));
  }, [items, search]);

  const selectedCount = selectedIds.length;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t(`workspace.picker.${kind}_title`)}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-light-border bg-light-surface shadow-2xl dark:border-dark-border dark:bg-dark-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-light-border px-5 pt-4 pb-3 dark:border-dark-border">
          <div className="min-w-0">
            <h3 className="font-bold">{t(`workspace.picker.${kind}_title`)}</h3>
            <p className="mt-0.5 text-xs text-light-subtle dark:text-dark-subtle">
              {t(`workspace.picker.${kind}_hint`)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t('workspace.picker.close')}
            className="rounded-md p-1 transition-colors hover:bg-light-muted dark:hover:bg-dark-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-light-border px-4 py-3 dark:border-dark-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-light-muted dark:text-dark-muted" />
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t(`workspace.picker.${kind}_search`)}
              className="w-full rounded-lg border border-light-border bg-light-bg py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-500 dark:border-dark-border dark:bg-dark-bg"
            />
          </div>
        </div>

        <div className="min-h-[12rem] flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-6 py-10 text-center text-xs text-light-subtle dark:text-dark-subtle">
              {search.trim() ? t('workspace.picker.no_results') : t(`workspace.picker.${kind}_empty`)}
            </div>
          ) : (
            filtered.map((item) => {
              const selected = selectedIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    onToggle(item.id);
                    if (singleSelect) onClose();
                  }}
                  className={`flex w-full items-start gap-3 border-b border-light-border/60 px-4 py-3 text-left transition-colors last:border-b-0 dark:border-dark-border/60 ${
                    selected
                      ? 'bg-blue-50/70 dark:bg-blue-900/20'
                      : 'hover:bg-light-muted dark:hover:bg-dark-muted'
                  }`}
                >
                  {item.leading}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{item.title}</span>
                      {item.badge}
                    </span>
                    {item.description && (
                      <span className="mt-0.5 line-clamp-2 block text-[11px] text-light-subtle dark:text-dark-subtle">
                        {item.description}
                      </span>
                    )}
                    {item.meta && (
                      <span className="mt-1 block text-[10px] text-light-muted dark:text-dark-muted">
                        {item.meta}
                      </span>
                    )}
                  </span>
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border transition-colors ${
                      singleSelect ? 'rounded-full' : 'rounded-md'
                    } ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-light-border dark:border-dark-border'}`}
                  >
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-light-border px-5 py-3 dark:border-dark-border">
          <span className="text-[11px] text-light-subtle dark:text-dark-subtle">
            {t('workspace.picker.selected', { count: selectedCount })}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {t('workspace.picker.done')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ComponentPickerDialog;
