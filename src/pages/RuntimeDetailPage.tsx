import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Box,
  RefreshCw,
  FolderOpen,
  Download,
  Info,
  Play,
  Square,
  Terminal as TerminalIcon,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  RUNTIME_DETAIL,
  RUNTIME_ENGINE_START,
  RUNTIME_ENGINE_STOP,
  SETTING_GET,
  SETTING_UPDATE,
  UTIL_OPEN_PATH,
  type RuntimeDetail,
  type RuntimeKind,
} from '@/shared/channel-types';
import { useAiSphereStore } from '@/stores/aiSphereStore';
import { useLifecycleHistoryStore } from '@/stores/lifecycleHistoryStore';
import { SettingKey } from '@/stores/settingStore';
import { DOCKER_REGISTRY_MIRRORS, normalizeDockerRegistryMirrorUrl, parseDockerRegistryMirrors, type DockerRegistryMirrorConfig } from '@/shared/types';
import { useTranslation } from '@/i18n';
import { LifecycleHistory } from '@/components/LifecycleHistory';

function capitalize(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function engineInfoKey(label: string): string {
  return `runtimes.engine_info.${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
}

function DetailRow({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[170px_1fr] gap-3 py-2 border-b border-light-border/60 dark:border-dark-border/60 last:border-0">
      <span className="text-light-subtle dark:text-dark-subtle">{label}</span>
      <span className={`break-all ${mono ? 'font-mono text-[11px]' : ''}`}>{value || '—'}</span>
    </div>
  );
}

export default function RuntimeDetailPage() {
  const { t } = useTranslation();
  const selectedRuntime = useAiSphereStore((s) => s.selectedRuntime);
  const setView = useAiSphereStore((s) => s.setView);

  const [data, setData] = useState<RuntimeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dockerMirrors, setDockerMirrors] = useState<DockerRegistryMirrorConfig[]>([]);
  const [dockerMirrorDraft, setDockerMirrorDraft] = useState('');
  const [dockerMirrorBusy, setDockerMirrorBusy] = useState(false);
  const [dockerMirrorError, setDockerMirrorError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    setDockerMirrorError(null);
    if (selectedRuntime !== 'docker') return () => { disposed = true; };

    const loadMirrors = async () => {
      try {
        const result = await window.electron.invoke(SETTING_GET, SettingKey.DockerRegistryMirrors);
        if (!result.success) throw new Error(result.error ?? t('runtimes.docker_config.failed'));
        let value: unknown = result.data?.value;
        // Upgrade path: older builds stored one preset under a different key.
        if (value === undefined) {
          const legacy = await window.electron.invoke(SETTING_GET, SettingKey.DockerRegistryMirror);
          if (legacy.success) value = legacy.data?.value;
        }
        if (!disposed) setDockerMirrors(parseDockerRegistryMirrors(value));
      } catch (err) {
        console.error('Failed to load Docker registry mirror preferences:', err);
        if (!disposed) setDockerMirrorError(err instanceof Error ? err.message : String(err));
      }
    };

    loadMirrors();
    return () => {
      disposed = true;
    };
  }, [selectedRuntime, t]);

  const persistDockerMirrors = async (next: DockerRegistryMirrorConfig[]) => {
    const previous = dockerMirrors;
    setDockerMirrors(next);
    setDockerMirrorBusy(true);
    setDockerMirrorError(null);
    try {
      const result = await window.electron.invoke(SETTING_UPDATE, {
        key: SettingKey.DockerRegistryMirrors,
        value: JSON.stringify(next),
      });
      if (!result.success) throw new Error(result.error ?? t('runtimes.docker_config.failed'));
    } catch (err) {
      console.error('Failed to save Docker registry mirror preferences:', err);
      setDockerMirrors(previous);
      setDockerMirrorError(err instanceof Error ? err.message : String(err));
    } finally {
      setDockerMirrorBusy(false);
    }
  };

  const addDockerMirror = (raw: string) => {
    const url = normalizeDockerRegistryMirrorUrl(raw);
    if (!url) {
      setDockerMirrorError(t('runtimes.docker_config.invalid'));
      return;
    }
    if (dockerMirrors.some((mirror) => mirror.url.toLowerCase() === url.toLowerCase())) {
      setDockerMirrorError(t('runtimes.docker_config.duplicate'));
      return;
    }
    setDockerMirrorDraft('');
    void persistDockerMirrors([...dockerMirrors, { url, enabled: true }]);
  };

  const toggleDockerMirror = (index: number) => {
    void persistDockerMirrors(dockerMirrors.map((mirror, current) =>
      current === index ? { ...mirror, enabled: !mirror.enabled } : mirror));
  };

  const moveDockerMirror = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= dockerMirrors.length) return;
    const next = [...dockerMirrors];
    [next[index], next[target]] = [next[target], next[index]];
    void persistDockerMirrors(next);
  };

  const removeDockerMirror = (index: number) => {
    void persistDockerMirrors(dockerMirrors.filter((_mirror, current) => current !== index));
  };

  const load = useCallback(
    async (type: RuntimeKind) => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.electron.invoke(RUNTIME_DETAIL, type);
        if (result.success) {
          setData(result.data as RuntimeDetail);
        } else {
          setData(null);
          setError(result.error || t('runtimes.detail.load_error'));
        }
      } catch (err) {
        setData(null);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    setData(null);
    setActionError(null);
    if (selectedRuntime) load(selectedRuntime);
  }, [selectedRuntime, load]);

  const startEngine = async () => {
    if (!selectedRuntime || starting) return;
    setStarting(true);
    setActionError(null);
    try {
      const result = await window.electron.invoke(RUNTIME_ENGINE_START, selectedRuntime);
      if (result.success) {
        await load(selectedRuntime);
      } else {
        setActionError(result.error || t('runtimes.action.start_failed'));
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  const stopEngine = async () => {
    if (!selectedRuntime || stopping) return;
    setStopping(true);
    setActionError(null);
    try {
      const result = await window.electron.invoke(RUNTIME_ENGINE_STOP, selectedRuntime);
      if (result.success) {
        useLifecycleHistoryStore.getState().recordRuns(
          'runtime',
          selectedRuntime,
          selectedRuntime,
          result.data?.lifecycleRuns,
        );
        await load(selectedRuntime);
      } else {
        setActionError(result.error || t('runtimes.action.stop_failed'));
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setStopping(false);
    }
  };

  const engine = data?.engine;

  const engineText = !data
    ? undefined
    : !engine?.hasEngine
      ? t('runtimes.detail.cli_only')
      : engine.running
        ? `${t('runtimes.detail.engine_running')}${engine.version ? ` (${engine.version})` : ''}`
        : t('runtimes.detail.engine_stopped');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button
        onClick={() => setView('runtimes')}
        className="flex items-center gap-2 text-light-subtle dark:text-dark-subtle mb-6 hover:text-light-text dark:hover:text-dark-text transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('runtimes.detail.back')}
      </button>

      {!selectedRuntime ? (
        <div className="bg-light-surface dark:bg-dark-surface rounded-xl p-12 border border-light-border dark:border-dark-border text-center text-light-subtle dark:text-dark-subtle">
          {t('runtimes.detail.not_found')}
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-4 min-w-0">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg shrink-0">
                <Box className="w-7 h-7 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl font-bold capitalize">
                  {capitalize(selectedRuntime)} {t('runtimes.detail.title')}
                </h2>
                <p className="text-light-subtle dark:text-dark-subtle mt-1">
                  {t(`runtimes.description.${selectedRuntime}`)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {data?.installed && engine?.hasEngine && !engine.running && (
                <button
                  onClick={startEngine}
                  disabled={starting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {starting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {starting ? t('runtimes.action.starting') : t('runtimes.action.start')}
                </button>
              )}
              {data?.installed && engine?.hasEngine && engine.running && (
                <button
                  onClick={stopEngine}
                  disabled={stopping}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-amber-300 dark:border-amber-700/70 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {stopping ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  {stopping ? t('runtimes.action.stopping') : t('runtimes.action.stop')}
                </button>
              )}
              <button
                onClick={() => load(selectedRuntime)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {t('runtimes.detail.refresh')}
              </button>
              {data?.installDirExists && (
                <button
                  onClick={() => window.electron.invoke(UTIL_OPEN_PATH, data.installDir)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
                >
                  <FolderOpen className="w-4 h-4" /> {t('runtimes.detail.open_folder')}
                </button>
              )}
            </div>
          </div>

          {loading && !data && (
            <div className="flex items-center gap-2 text-light-subtle dark:text-dark-subtle mb-4">
              <RefreshCw className="w-4 h-4 animate-spin" />
              {t('runtimes.detail.loading')}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-red-600 dark:text-red-300 mb-4">
              {error}
            </div>
          )}

          {actionError && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-red-600 dark:text-red-300 mb-4">
              {actionError}
            </div>
          )}

          {data && (
            <div className="space-y-6">
              <section className="bg-light-surface dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-5 h-5 text-blue-500" />
                  <h3 className="text-base font-semibold">{t('runtimes.detail.overview')}</h3>
                  <span
                    className={`ml-auto text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      data.installed
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {data.installed ? t('runtimes.status.installed') : t('runtimes.status.missing')}
                  </span>
                </div>
                <div className="text-sm">
                  <DetailRow label={t('runtimes.detail.status')} value={data.installed ? t('runtimes.status.installed') : t('runtimes.status.missing')} />
                  <DetailRow label={t('runtimes.detail.version')} value={data.version || t('runtimes.detail.unknown')} mono />
                  <DetailRow label={t('runtimes.detail.managed')} value={data.managed ? t('runtimes.detail.yes') : t('runtimes.detail.no')} />
                  <DetailRow label={t('runtimes.detail.platform')} value={`${data.platform} (${data.arch})`} />
                  <DetailRow label={t('runtimes.detail.install_folder')} value={data.installDir} mono />
                  <DetailRow
                    label={t('runtimes.detail.executable')}
                    value={data.executable || (data.installed ? t('runtimes.detail.found_on_path') : undefined)}
                    mono
                  />
                  <DetailRow label={t('runtimes.detail.engine')} value={engineText} />
                </div>
                {!data.installed && (
                  <button
                    onClick={() => setView('runtimes')}
                    className="mt-4 flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-4 h-4" /> {t('runtimes.detail.go_install')}
                  </button>
                )}
              </section>

              <LifecycleHistory ownerType="runtime" ownerId={selectedRuntime} />

              {selectedRuntime === 'docker' && (
                <section className="bg-light-surface dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border shadow-sm p-5">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="text-base font-semibold">{t('runtimes.docker_config.title')}</h3>
                    {dockerMirrorBusy && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-light-subtle dark:text-dark-subtle">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        {t('runtimes.docker_config.saving')}
                      </span>
                    )}
                  </div>
                  <p id="docker-registry-mirrors-hint" className="text-xs text-light-subtle dark:text-dark-subtle mb-4">
                    {t('runtimes.docker_config.hint')}
                  </p>

                  {dockerMirrors.length === 0 ? (
                    <p className="mb-4 rounded-lg border border-dashed border-light-border dark:border-dark-border px-3 py-3 text-sm text-light-subtle dark:text-dark-subtle">
                      {t('runtimes.docker_config.empty')}
                    </p>
                  ) : (
                    <ol className="mb-4 space-y-2" aria-describedby="docker-registry-mirrors-hint">
                      {dockerMirrors.map((mirror, index) => (
                        <li
                          key={mirror.url}
                          className="flex items-center gap-2 rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg px-3 py-2"
                        >
                          <span className="w-5 shrink-0 text-center font-mono text-[11px] text-light-subtle dark:text-dark-subtle">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className={`truncate font-mono text-xs ${mirror.enabled ? '' : 'text-light-subtle line-through dark:text-dark-subtle'}`}>
                              {mirror.url}
                            </div>
                            <div className="text-[11px] text-light-subtle dark:text-dark-subtle">
                              {mirror.enabled ? t('runtimes.docker_config.enabled') : t('runtimes.docker_config.disabled')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => moveDockerMirror(index, -1)}
                            disabled={dockerMirrorBusy || index === 0}
                            title={t('runtimes.docker_config.move_up')}
                            aria-label={t('runtimes.docker_config.move_up')}
                            className="rounded p-1 text-light-subtle hover:bg-light-muted hover:text-light-text disabled:opacity-30 disabled:hover:bg-transparent dark:text-dark-subtle dark:hover:bg-dark-muted dark:hover:text-dark-text"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveDockerMirror(index, 1)}
                            disabled={dockerMirrorBusy || index === dockerMirrors.length - 1}
                            title={t('runtimes.docker_config.move_down')}
                            aria-label={t('runtimes.docker_config.move_down')}
                            className="rounded p-1 text-light-subtle hover:bg-light-muted hover:text-light-text disabled:opacity-30 disabled:hover:bg-transparent dark:text-dark-subtle dark:hover:bg-dark-muted dark:hover:text-dark-text"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={mirror.enabled}
                            aria-label={`${mirror.enabled ? t('runtimes.docker_config.disable') : t('runtimes.docker_config.enable')}: ${mirror.url}`}
                            title={mirror.enabled ? t('runtimes.docker_config.disable') : t('runtimes.docker_config.enable')}
                            onClick={() => toggleDockerMirror(index)}
                            disabled={dockerMirrorBusy}
                            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors disabled:opacity-50 ${mirror.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-dark-muted'}`}
                          >
                            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${mirror.enabled ? 'left-3.5' : 'left-0.5'}`} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeDockerMirror(index)}
                            disabled={dockerMirrorBusy}
                            title={t('runtimes.docker_config.remove')}
                            aria-label={`${t('runtimes.docker_config.remove')}: ${mirror.url}`}
                            className="rounded p-1 text-light-subtle hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:text-dark-subtle dark:hover:bg-red-500/10 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}

                  <form
                    className="flex flex-col gap-2 sm:flex-row"
                    onSubmit={(event) => { event.preventDefault(); addDockerMirror(dockerMirrorDraft); }}
                  >
                    <label htmlFor="docker-registry-mirror-input" className="sr-only">
                      {t('runtimes.docker_config.add_label')}
                    </label>
                    <input
                      id="docker-registry-mirror-input"
                      type="text"
                      inputMode="url"
                      spellCheck={false}
                      autoComplete="off"
                      value={dockerMirrorDraft}
                      onChange={(event) => { setDockerMirrorDraft(event.target.value); setDockerMirrorError(null); }}
                      placeholder={t('runtimes.docker_config.add_placeholder')}
                      aria-describedby="docker-registry-mirrors-hint"
                      disabled={dockerMirrorBusy}
                      className="min-w-0 flex-1 rounded border border-light-border bg-light-bg px-3 py-1.5 text-sm disabled:opacity-50 dark:border-dark-border dark:bg-dark-bg"
                    />
                    <button
                      type="submit"
                      disabled={dockerMirrorBusy || !dockerMirrorDraft.trim()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" /> {t('runtimes.docker_config.add')}
                    </button>
                  </form>

                  {DOCKER_REGISTRY_MIRRORS.some((preset) => !dockerMirrors.some((mirror) => mirror.url === preset)) && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-light-subtle dark:text-dark-subtle">{t('runtimes.docker_config.suggestions')}</span>
                      {DOCKER_REGISTRY_MIRRORS
                        .filter((preset) => !dockerMirrors.some((mirror) => mirror.url === preset))
                        .map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => addDockerMirror(preset)}
                            disabled={dockerMirrorBusy}
                            className="rounded-full border border-light-border px-2.5 py-0.5 text-[11px] font-mono text-light-subtle transition-colors hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-dark-border dark:text-dark-subtle dark:hover:border-blue-500 dark:hover:text-blue-400"
                          >
                            {new URL(preset).host}
                          </button>
                        ))}
                    </div>
                  )}

                  {dockerMirrorError && (
                    <p role="alert" className="mt-2 text-sm text-red-500">{dockerMirrorError}</p>
                  )}
                </section>
              )}

              {/* When the engine is stopped the Engine row already says so; the
                  backend message ("The Docker engine is not running.") would be
                  redundant and untranslated. Real inspection errors while the
                  engine is up are still surfaced. */}
              {engine?.error && engine.running && (
                <p className="text-xs text-amber-600 dark:text-amber-400">{engine.error}</p>
              )}

              {data.pathEntries.length > 0 && (
                <section className="bg-light-surface dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border shadow-sm p-5">
                  <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                    <TerminalIcon className="w-5 h-5 text-blue-500" />
                    {t('runtimes.detail.path_entries')}
                  </h3>
                  <div className="rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg px-3 py-2 space-y-1">
                    {data.pathEntries.map((entry) => (
                      <div key={entry} className="font-mono text-[11px] break-all">{entry}</div>
                    ))}
                  </div>
                </section>
              )}

              {engine?.info && engine.info.length > 0 && (
                <section className="bg-light-surface dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border shadow-sm p-5">
                  <h3 className="text-base font-semibold flex items-center gap-2 mb-3">
                    <Info className="w-5 h-5 text-blue-500" />
                    {t('runtimes.detail.engine_info')}
                  </h3>
                  <div className="rounded-lg border border-light-border dark:border-dark-border overflow-hidden">
                    {engine.info.map((item) => (
                      <div
                        key={item.label}
                        className="grid grid-cols-[170px_1fr] gap-3 px-3 py-1.5 text-xs border-b border-light-border/60 dark:border-dark-border/60 last:border-0 odd:bg-light-bg dark:odd:bg-dark-bg"
                      >
                        <span className="text-light-subtle dark:text-dark-subtle">
                          {t(engineInfoKey(item.label), { defaultValue: item.label })}
                        </span>
                        <span className="break-all">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
