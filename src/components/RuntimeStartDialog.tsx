import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Loader2, Play, X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/stores/appStore';

const runtimeLabel = (runtime: string) => {
  const label = runtime.charAt(0).toUpperCase() + runtime.slice(1);
  return label === 'Apptainer' ? 'Apptainer' : label;
};

/**
 * Modal shown before starting an app whose runtime engine is not running.
 * The user can let AiSphere start the runtime and optionally remember the
 * choice for future launches.
 */
export function RuntimeStartDialog() {
  const { t } = useTranslation();
  const prompt = useAppStore((state) => state.runtimePrompt);
  const confirmStart = useAppStore((state) => state.confirmRuntimeStart);
  const runInBackground = useAppStore((state) => state.runRuntimeStartInBackground);
  const cancelStart = useAppStore((state) => state.cancelRuntimeStart);
  const dismiss = useAppStore((state) => state.dismissRuntimePrompt);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    setRemember(false);
  }, [prompt?.appId]);

  if (!prompt) return null;

  const label = runtimeLabel(prompt.runtime);
  const busy = prompt.stage === 'starting';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2.5 rounded-xl shrink-0 ${prompt.stage === 'error' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600'}`}>
              {prompt.stage === 'error' ? <AlertTriangle className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold">
                {prompt.stage === 'error'
                  ? t('runtimePrompt.error_title', { runtime: label })
                  : t('runtimePrompt.start_title', { runtime: label })}
              </h3>
              <p className="text-xs text-light-subtle dark:text-dark-subtle truncate">{prompt.appName}</p>
            </div>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={dismiss}
              className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted transition-colors shrink-0"
              title={t('runtimePrompt.close')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-5 py-4 text-sm space-y-3">
          {prompt.stage === 'error' ? (
            <p className="text-red-600 dark:text-red-400 break-words">
              {prompt.error || t('runtimePrompt.error_fallback', { runtime: label })}
            </p>
          ) : prompt.stage === 'starting' ? (
            <p className="flex items-center gap-2 text-light-subtle dark:text-dark-subtle">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              {t('runtimePrompt.starting', { runtime: label })}
            </p>
          ) : (
            <p className="text-light-subtle dark:text-dark-subtle">
              {t('runtimePrompt.text', { runtime: label, app: prompt.appName })}
            </p>
          )}

          {prompt.stage === 'ask' && (
            <label className="flex items-start gap-2.5 rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg px-3 py-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="mt-0.5 accent-blue-600"
              />
              <span>
                <span className="block text-sm font-medium">
                  {t('runtimePrompt.remember', { runtime: label })}
                </span>
                <span className="block text-[11px] text-light-subtle dark:text-dark-subtle">
                  {remember ? t('runtimePrompt.remember_on') : t('runtimePrompt.remember_off')}
                </span>
              </span>
            </label>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          {prompt.stage === 'error' ? (
            <>
              <button
                type="button"
                onClick={dismiss}
                className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
              >
                {t('runtimePrompt.close')}
              </button>
              <button
                type="button"
                onClick={() => confirmStart(false)}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                {t('runtimePrompt.try_again')}
              </button>
            </>
          ) : prompt.stage === 'starting' ? (
            <button
              type="button"
              onClick={() => { void runInBackground(); }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
            >
              <ArrowDownToLine className="w-4 h-4" />
              {t('runtimePrompt.run_in_background')}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => cancelStart(remember)}
                className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
              >
                {t('runtimePrompt.cancel')}
              </button>
              <button
                type="button"
                onClick={() => { void runInBackground(remember); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
              >
                <ArrowDownToLine className="w-4 h-4" />
                {t('runtimePrompt.run_in_background')}
              </button>
              <button
                type="button"
                onClick={() => confirmStart(remember)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <Play className="w-4 h-4 fill-current" /> {t('runtimePrompt.start_launch')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default RuntimeStartDialog;
