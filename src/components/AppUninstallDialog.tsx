import { useEffect } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useTranslation } from '@/i18n';

interface AppUninstallDialogProps {
  appName?: string;
  count?: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function AppUninstallDialog({ appName, count, onCancel, onConfirm }: AppUninstallDialogProps) {
  const { t } = useTranslation();
  const isBatch = count !== undefined;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]" onClick={onCancel}>
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-uninstall-title"
        aria-describedby="app-uninstall-message"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-light-border bg-light-surface shadow-2xl dark:border-dark-border dark:bg-dark-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-4 p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="app-uninstall-title" className="text-lg font-semibold">
              {isBatch
                ? t('apps.uninstall_dialog.batch_title', { count })
                : t('apps.uninstall_dialog.title', { name: appName })}
            </h2>
            <p id="app-uninstall-message" className="mt-2 text-sm leading-relaxed text-light-subtle dark:text-dark-subtle">
              {isBatch
                ? t('apps.uninstall_dialog.batch_message', { count })
                : t('apps.uninstall_dialog.message', { name: appName })}
            </p>
            <p className="mt-3 text-xs font-medium text-red-700 dark:text-red-400">
              {t('apps.uninstall_dialog.warning')}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-light-border bg-light-bg/70 px-6 py-4 dark:border-dark-border dark:bg-dark-bg/50">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="rounded-lg border border-light-border px-4 py-2 text-sm font-medium transition-colors hover:bg-light-muted dark:border-dark-border dark:hover:bg-dark-muted"
          >
            {t('apps.uninstall_dialog.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface"
          >
            <Trash2 className="h-4 w-4" />
            {t('apps.uninstall_dialog.confirm')}
          </button>
        </div>
      </section>
    </div>
  );
}
