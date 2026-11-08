import { useEffect, useState } from 'react';
import { LoaderCircle, Server, Box } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { APP_SHUTDOWN_PROGRESS, type AppShutdownProgressEvent } from '@/shared/channel-types';

export function AppShutdownProgress() {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<AppShutdownProgressEvent | null>(null);

  useEffect(() => {
    const listener = (value: unknown) => setProgress(value as AppShutdownProgressEvent);
    window.electron.on(APP_SHUTDOWN_PROGRESS, listener);
    return () => window.electron.removeListener(APP_SHUTDOWN_PROGRESS, listener);
  }, []);

  if (!progress) return null;

  const phaseKey = progress.phase === 'cancelling-install'
    ? 'apps.shutdown.cancelling_install'
    : progress.phase === 'stopping-app'
      ? 'apps.shutdown.stopping_app'
      : progress.phase === 'stopping-runtime'
        ? 'apps.shutdown.stopping_runtime'
        : progress.phase === 'completed'
          ? 'apps.shutdown.completed'
          : 'apps.shutdown.preparing';
  const percent = progress.total > 0 ? Math.min(100, Math.round(progress.current / progress.total * 100)) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <section role="status" aria-live="polite" className="w-full max-w-lg overflow-hidden rounded-2xl border border-light-border bg-light-surface shadow-2xl dark:border-dark-border dark:bg-dark-surface">
        <div className="h-1.5 bg-blue-600 transition-all duration-500" style={{ width: `${percent}%` }} />
        <div className="p-7">
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              <LoaderCircle className="h-6 w-6 animate-spin" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{t('apps.shutdown.title')}</h2>
              <p className="text-sm text-light-subtle dark:text-dark-subtle">{t(phaseKey)}</p>
            </div>
          </div>
          {progress.name && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-light-muted px-4 py-3 text-sm dark:bg-dark-muted">
              {progress.phase === 'stopping-runtime'
                ? <Server className="h-4 w-4 text-blue-500" />
                : <Box className="h-4 w-4 text-blue-500" />}
              <span className="truncate">{progress.name}</span>
            </div>
          )}
          <div className="mb-2 flex justify-between text-xs text-light-subtle dark:text-dark-subtle">
            <span>{t('apps.shutdown.keep_open')}</span>
            {progress.total > 0 && <span>{progress.current} / {progress.total}</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-light-muted dark:bg-dark-muted">
            <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </section>
    </div>
  );
}
