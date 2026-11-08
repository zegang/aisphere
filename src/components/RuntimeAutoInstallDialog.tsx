import { useEffect, useRef } from 'react';
import { AlertTriangle, Download, Loader2, X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useAiSphereStore } from '@/stores/aiSphereStore';
import { useExploreStore } from '@/stores/exploreStore';
import { useRuntimeStore } from '@/stores/runtimeStore';

const runtimeLabel = (runtime: string) => runtime.charAt(0).toUpperCase() + runtime.slice(1);

export function RuntimeAutoInstallDialog() {
  const { t } = useTranslation();
  const prompt = useExploreStore((state) => state.runtimeInstallPrompt);
  const setPrompt = useExploreStore((state) => state.setRuntimeInstallPrompt);
  const setView = useAiSphereStore((state) => state.setView);
  const running = useRef(false);

  useEffect(() => {
    if (!prompt || prompt.stage !== 'installing' || running.current) return;
    running.current = true;

    const installRuntimeAndApp = async () => {
      try {
        setView('runtimes');
        const runtimeStore = useRuntimeStore.getState();
        await runtimeStore.installRuntime(prompt.runtime);

        const runtime = useRuntimeStore.getState().statuses.find((item) => item.type === prompt.runtime);
        if (!runtime?.installed) {
          const status = useRuntimeStore.getState().installs[prompt.runtime];
          throw new Error(status?.message || t('runtimeAutoInstall.failed', { runtime: runtimeLabel(prompt.runtime) }));
        }

        if (prompt.runtime === 'docker' || prompt.runtime === 'podman') {
          const started = await useRuntimeStore.getState().startEngine(prompt.runtime);
          if (!started) {
            const engineError = useRuntimeStore.getState().statuses.find((item) => item.type === prompt.runtime)?.engineError;
            throw new Error(engineError || t('runtimeAutoInstall.engine_failed', { runtime: runtimeLabel(prompt.runtime) }));
          }
        }

        if (useAiSphereStore.getState().view === 'runtimes') setView(prompt.returnView);
        setPrompt(null);
        await useExploreStore.getState().installApplication(prompt.app, true);
      } catch (error) {
        if (useAiSphereStore.getState().view === 'runtimes') setView(prompt.returnView);
        setPrompt({
          ...prompt,
          stage: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        running.current = false;
      }
    };

    void installRuntimeAndApp();
  }, [prompt, setPrompt, setView, t]);

  if (!prompt || prompt.stage === 'installing') return null;

  const runtime = runtimeLabel(prompt.runtime);
  const close = () => setPrompt(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2.5 rounded-xl shrink-0 ${prompt.stage === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600'}`}>
              {prompt.stage === 'error' ? <AlertTriangle className="w-5 h-5" /> : <Download className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold">
                {prompt.stage === 'error'
                  ? t('runtimeAutoInstall.error_title', { runtime })
                  : t('runtimeAutoInstall.title', { runtime })}
              </h3>
              <p className="text-xs text-light-subtle dark:text-dark-subtle truncate">{prompt.app.name}</p>
            </div>
          </div>
          <button type="button" onClick={close} className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted" title={t('runtimeAutoInstall.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 text-sm">
          {prompt.stage === 'error' ? (
            <p role="alert" className="text-red-600 dark:text-red-400 break-words">{prompt.error}</p>
          ) : (
            <p className="text-light-subtle dark:text-dark-subtle">
              {t('runtimeAutoInstall.message', { runtime, app: prompt.app.name })}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          {prompt.stage === 'ask' ? (
            <>
              <button type="button" onClick={close} className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted">
                {t('runtimeAutoInstall.cancel')}
              </button>
              <button
                type="button"
                onClick={() => setPrompt({ ...prompt, stage: 'installing' })}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                <Download className="w-4 h-4" /> {t('runtimeAutoInstall.install')}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={close} className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted">
                {t('runtimeAutoInstall.close')}
              </button>
              <button
                type="button"
                onClick={() => setPrompt({ ...prompt, stage: 'installing', error: undefined })}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                <Loader2 className="w-4 h-4" /> {t('runtimeAutoInstall.retry')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default RuntimeAutoInstallDialog;
