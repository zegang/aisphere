import { useMemo, useState } from 'react';
import { History, X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useLifecycleHistoryStore } from '@/stores/lifecycleHistoryStore';
import type { LifecycleHistoryEntry } from '@/stores/lifecycleHistoryStore';

interface LifecycleHistoryProps {
  ownerType?: LifecycleHistoryEntry['ownerType'];
  ownerId?: string;
}

export function LifecycleHistory({ ownerType, ownerId }: LifecycleHistoryProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const allEntries = useLifecycleHistoryStore((state) => state.entries);
  const entries = useMemo(
    () => allEntries.filter((entry) =>
      (!ownerType || entry.ownerType === ownerType) &&
      (!ownerId || entry.ownerId === ownerId),
    ),
    [allEntries, ownerType, ownerId],
  );

  if (entries.length === 0) return null;

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg border border-light-border bg-light-surface px-3 py-2 text-sm font-medium text-light-text transition-colors hover:border-blue-400 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
      >
        <History className="h-4 w-4 text-blue-500" />
        {t('apps.workspace.lifecycle_history')}
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
          {entries.length}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-light-border bg-light-surface p-4 dark:border-dark-border dark:bg-dark-surface">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t('apps.workspace.lifecycle_history')}</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-light-subtle transition-colors hover:bg-light-muted dark:text-dark-subtle dark:hover:bg-dark-muted"
              title={t('apps.workspace.dismiss')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {entries.map((entry) => (
              <article key={entry.id} className="rounded-lg border border-light-border/70 p-3 dark:border-dark-border/70">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="text-xs font-semibold">
                    {!ownerType && <span className="mr-2 text-light-subtle dark:text-dark-subtle">{entry.ownerName}</span>}
                    {t(`apps.workspace.lifecycle_hooks.${entry.hook}`, { defaultValue: entry.hook })}
                  </div>
                  <time className="text-[10px] text-light-subtle dark:text-dark-subtle">
                    {new Date(entry.occurredAt).toLocaleString(i18n.language)}
                  </time>
                </div>
                <div className="space-y-2">
                  {entry.results.map((result, index) => (
                    <div key={`${entry.id}-${result.id}-${index}`}>
                      <span className={`mr-2 text-[10px] font-semibold uppercase ${
                        result.status === 'failed'
                          ? 'text-red-600 dark:text-red-400'
                          : result.status === 'skipped'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-green-700 dark:text-green-400'
                      }`}>
                        {t(`apps.workspace.lifecycle_status.${result.status}`)}
                      </span>
                      <span className="text-xs font-medium">{result.id}</span>
                      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-light-text dark:text-dark-text">
                        {result.message}
                      </pre>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
