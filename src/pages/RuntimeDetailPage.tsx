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
import { DOCKER_REGISTRY_MIRRORS } from '@/shared/types';
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
  const [dockerRegistryMirror, setDockerRegistryMirror] = useState('');
  const [dockerRegistryMirrorBusy, setDockerRegistryMirrorBusy] = useState(false);
  const [dockerRegistryMirrorError, setDockerRegistryMirrorError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    setDockerRegistryMirrorError(null);
    if (selectedRuntime !== 'docker') return () => { disposed = true; };

    const loadMirror = async () => {
      try {
        const result = await window.electron.invoke(SETTING_GET, SettingKey.DockerRegistryMirror);
        if (!result.success) throw new Error(result.error ?? t('runtimes.docker_config.failed'));
        const value = result.data?.value;
        if (!disposed) {
          setDockerRegistryMirror(
            typeof value === 'string' && (DOCKER_REGISTRY_MIRRORS as readonly string[]).includes(value)
              ? value
              : '',
          );
        }
      } catch (err) {
        console.error('Failed to load Docker registry mirror preference:', err);
        if (!disposed) setDockerRegistryMirrorError(err instanceof Error ? err.message : String(err));
      }
    };

    loadMirror();
    return () => {
      disposed = true;
    };
  }, [selectedRuntime, t]);

  const updateDockerRegistryMirror = async (value: string) => {
    const previous = dockerRegistryMirror;
    setDockerRegistryMirror(value);
    setDockerRegistryMirrorBusy(true);
    setDockerRegistryMirrorError(null);
    try {
      const result = await window.electron.invoke(SETTING_UPDATE, {
        key: SettingKey.DockerRegistryMirror,
        value,
      });
      if (!result.success) throw new Error(result.error ?? t('runtimes.docker_config.failed'));
    } catch (err) {
      console.error('Failed to save Docker registry mirror preference:', err);
      setDockerRegistryMirror(previous);
      setDockerRegistryMirrorError(err instanceof Error ? err.message : String(err));
    } finally {
      setDockerRegistryMirrorBusy(false);
    }
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
                  <h3 className="text-base font-semibold mb-1">{t('runtimes.docker_config.title')}</h3>
                  <p id="docker-registry-mirror-hint" className="text-xs text-light-subtle dark:text-dark-subtle mb-3">
                    {t('runtimes.docker_config.hint')}
                  </p>
                  <div className="flex items-center gap-3">
                    <select
                      id="docker-registry-mirror"
                      value={dockerRegistryMirror}
                      onChange={(event) => updateDockerRegistryMirror(event.target.value)}
                      disabled={dockerRegistryMirrorBusy}
                      aria-describedby="docker-registry-mirror-hint"
                      className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      <option value="">{t('runtimes.docker_config.direct')}</option>
                      {DOCKER_REGISTRY_MIRRORS.map((mirror) => (
                        <option key={mirror} value={mirror}>{mirror}</option>
                      ))}
                    </select>
                    {dockerRegistryMirrorBusy && (
                      <span className="text-xs text-light-subtle dark:text-dark-subtle">{t('runtimes.docker_config.saving')}</span>
                    )}
                  </div>
                  {dockerRegistryMirrorError && (
                    <p role="alert" className="mt-2 text-sm text-red-500">{dockerRegistryMirrorError}</p>
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
