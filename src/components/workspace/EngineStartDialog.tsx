// Engine start dialog for the Workspace model picker.
//
// Industry pattern (LM Studio / Open WebUI / Cursor): selecting a model whose
// inference engine is not running asks the user whether to start the engine,
// shows live starting progress and reports failures with a retry.

import { useEffect, useRef, useState } from 'react';
import { Cpu, Loader2, Play, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import { CopyableError } from '@/components/CopyableError';

export interface EngineStartRequest {
  appId: string;
  engineName: string;
  modelLabel: string;
}

interface Props {
  request: EngineStartRequest;
  /** Called once the engine reports `running`; selects the pending model. */
  onReady: () => void;
  onClose: () => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function EngineStartDialog({ request, onReady, onClose }: Props) {
  const { t } = useTranslation();
  const startApplication = useAppStore((s) => s.startApplication);
  // When starting this app triggered the global runtime chain (e.g. Docker
  // Desktop is off), the runtime dialog must take over: it renders at a
  // higher z-index, so this dialog pauses its spinner in a handoff stage.
  const runtimePrompt = useAppStore((s) => s.runtimePrompt);
  const runtimeHandoff = !!runtimePrompt
    && runtimePrompt.appId === request.appId
    && ['ask', 'starting', 'error'].includes(runtimePrompt.stage);
  const [stage, setStage] = useState<'ask' | 'starting' | 'runtime' | 'error' | 'ready'>('ask');
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(request.appId);

  useEffect(() => {
    if (runtimeHandoff && stage === 'starting') setStage('runtime');
    if (!runtimeHandoff && stage === 'runtime') setStage('starting');
  }, [runtimeHandoff, stage]);

  useEffect(() => {
    requestIdRef.current = request.appId;
  }, [request.appId]);

  const start = async () => {
    setStage('starting');
    setError(null);
    try {
      // May surface the global runtime prompt if Docker Desktop itself is off;
      // the dialog then pauses in the `runtime` handoff stage until the chain
      // completes, and this poll loop keeps watching the engine status.
      await startApplication(request.appId);
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await sleep(2000);
        if (requestIdRef.current !== request.appId) return; // dialog re-targeted
        const status: string = await useAppStore.getState().refreshApplicationStatus(request.appId);
        if (status === 'running') {
          setStage('ready');
          // Brief success feedback, then let the page select the model.
          await sleep(700);
          onReady();
          return;
        }
        // Surface explicit failures and store-reported errors (e.g. the
        // user chose "never" auto-start in the runtime prompt).
        const currentApp = useAppStore.getState().applications.find((a) => a.id === request.appId);
        if (status === 'failed' || currentApp?.error) {
          setStage('error');
          setError(currentApp?.error ?? null);
          return;
        }
      }
      setStage('error');
      setError(t('workspace.engines.timeout'));
    } catch (e) {
      setStage('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-light-border dark:border-dark-border">
          <h3 className="font-bold flex items-center gap-2">
            {stage === 'ready' ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : stage === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            ) : (
              <Cpu className="w-4 h-4 text-blue-500" />
            )}
            {t('workspace.engines.start_title')}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <Cpu className="w-4.5 h-4.5 w-[18px] h-[18px] text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{request.engineName}</p>
              <p className="text-[11px] text-light-subtle dark:text-dark-subtle truncate">{request.modelLabel}</p>
            </div>
          </div>

          {stage === 'ask' && (
            <p className="text-sm text-light-subtle dark:text-dark-subtle">{t('workspace.engines.start_question', { engine: request.engineName })}</p>
          )}

          {stage === 'starting' && (
            <div className="flex items-center gap-2.5 text-sm text-light-subtle dark:text-dark-subtle">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
              <span>{t('workspace.engines.starting', { engine: request.engineName })}</span>
            </div>
          )}

          {stage === 'runtime' && (
            <div className="flex items-start gap-2.5 text-sm text-light-subtle dark:text-dark-subtle">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0 mt-0.5" />
              <span>{t('workspace.engines.runtime_needed', { engine: request.engineName })}</span>
            </div>
          )}

          {stage === 'ready' && (
            <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {t('workspace.engines.started', { engine: request.engineName })}
            </p>
          )}

          {stage === 'error' && (
            <div className="text-sm text-light-subtle dark:text-dark-subtle space-y-2">
              <p className="text-red-500 dark:text-red-400">{t('workspace.engines.start_failed')}</p>
              {error && <CopyableError inline message={error} />}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-light-border dark:border-dark-border">
          {stage === 'ask' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
              >
                {t('workspace.engines.cancel')}
              </button>
              <button
                type="button"
                onClick={start}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> {t('workspace.engines.start_button')}
              </button>
            </>
          )}
          {(stage === 'starting' || stage === 'runtime') && (
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors">
              {t('workspace.engines.background')}
            </button>
          )}
          {stage === 'ready' && (
            <button type="button" onClick={onReady} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
              {t('workspace.engines.use_model')}
            </button>
          )}
          {stage === 'error' && (
            <>
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors">
                {t('workspace.engines.close')}
              </button>
              <button type="button" onClick={start} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                {t('workspace.engines.retry')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default EngineStartDialog;
