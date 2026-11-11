import { useEffect } from 'react';
import { Download, HardDrive, MonitorCheck, X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useRuntimeStore } from '@/stores/runtimeStore';

const runtimeLabel = (runtime: string) => {
  const label = runtime.charAt(0).toUpperCase() + runtime.slice(1);
  return label === 'Apptainer' ? 'Apptainer' : label;
};

/**
 * Shown before downloading a runtime when a compatible installation already
 * exists outside AiSphere (Docker Desktop, Podman, Conda, …). Giving the user
 * the choice avoids a second, unnecessary copy of a large runtime.
 */
export function RuntimeInstallChoiceDialog() {
  const { t } = useTranslation();
  const choice = useRuntimeStore((state) => state.installChoice);
  const resolve = useRuntimeStore((state) => state.resolveInstallChoice);

  useEffect(() => {
    if (!choice) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') resolve('cancel');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [choice, resolve]);

  if (!choice?.check.external) return null;

  const external = choice.check.external;
  const runtime = runtimeLabel(choice.type);
  const wsl = choice.type === 'docker' ? choice.check.wsl : undefined;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onClick={() => resolve('cancel')}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="runtime-choice-title"
        aria-describedby="runtime-choice-message"
        className="w-full max-w-lg rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl shrink-0 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
              <MonitorCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="runtime-choice-title" className="text-base font-bold">
                {t('runtimeChoice.title', { runtime })}
              </h3>
              {choice.context && (
                <p className="text-xs text-light-subtle dark:text-dark-subtle truncate">{choice.context}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => resolve('cancel')}
            className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted transition-colors shrink-0"
            title={t('runtimeChoice.cancel')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 text-sm">
          <p id="runtime-choice-message" className="text-light-subtle dark:text-dark-subtle">
            {t('runtimeChoice.message', { runtime, source: external.source })}
          </p>

          <div className="rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-green-700 dark:text-green-400">
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span>{external.source}</span>
              {external.version && (
                <span className="font-normal text-light-muted dark:text-dark-muted">{external.version}</span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] font-mono text-light-muted dark:text-dark-muted break-all">
              {external.path}
            </p>
          </div>

          {wsl && (
            <p className="text-[11px] text-light-subtle dark:text-dark-subtle">
              {wsl.ready
                ? t('runtimeChoice.wsl_ready')
                : wsl.installed
                  ? t('runtimeChoice.wsl_outdated')
                  : t('runtimeChoice.wsl_missing')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={() => resolve('cancel')}
            className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
          >
            {t('runtimeChoice.cancel')}
          </button>
          <button
            type="button"
            onClick={() => resolve('install')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('runtimeChoice.install_anyway', { runtime })}
          </button>
          <button
            type="button"
            onClick={() => resolve('existing')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <MonitorCheck className="w-4 h-4" />
            {t('runtimeChoice.use_existing')}
          </button>
        </div>
      </section>
    </div>
  );
}

export default RuntimeInstallChoiceDialog;
