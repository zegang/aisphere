// App store page

import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useAiSphereStore } from '@/stores/aiSphereStore';
import { Box, RefreshCw, Calendar, Play, Square, Globe, Eye, Puzzle, HardDrive, FolderOpen, Copy, ShieldCheck, ShieldOff, X, Trash2, CheckSquare } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { LAN_NAS_APP_ID, LAN_NAS_START, LAN_NAS_STATUS, LAN_NAS_STOP, RUNTIME_ENGINE_STATUS, UTIL_SELECT_DIRECTORY, type LanNasStatus } from '@/shared/channel-types';
import type { AppInstallStatus } from '@/shared/channel-types';
import { AppInstallControls } from '@/components/AppInstallControls';
import { ApplicationIcon } from '@/components/ApplicationIcon';
import { LifecycleHistory } from '@/components/LifecycleHistory';
import { AppUninstallDialog } from '@/components/AppUninstallDialog';

export default function AppsPage() {
  const { t, i18n } = useTranslation();
  const {
    applications,
    isLoading,
    lifecycleResultsByAppId,
    dismissLifecycleResults,
    fetchApplications,
    startApplication,
    stopApplication,
    uninstallApplication,
    refreshApplicationStatus,
  } = useAppStore();
  const openWorkspace = useAiSphereStore(s => s.openWorkspace);
  const [nasStatus, setNasStatus] = useState<LanNasStatus | null>(null);
  const [nasOpen, setNasOpen] = useState(false);
  const [nasDirectory, setNasDirectory] = useState('');
  const [nasAuthenticationEnabled, setNasAuthenticationEnabled] = useState(true);
  const [nasBusy, setNasBusy] = useState(false);
  const [nasError, setNasError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [uninstallConfirmOpen, setUninstallConfirmOpen] = useState(false);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      await fetchApplications();
      if (disposed) return;
      // Refresh live container status for installed apps so the cards show
      // whether the runtime task is still running.
      const apps = useAppStore.getState().applications;
      for (const app of apps.filter((item) => item.task)) {
        if (disposed) return;
        await refreshApplicationStatus(app.id);
      }
    };

    load();
    const timer = setInterval(load, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [fetchApplications, refreshApplicationStatus]);

  useEffect(() => {
    let disposed = false;
    const refreshNasStatus = async () => {
      try {
        const result = await window.electron.invoke(LAN_NAS_STATUS);
        if (!result.success || !result.data) throw new Error(result.error ?? t('apps.nas.status_failed'));
        if (!disposed) setNasStatus(result.data);
      } catch (error) {
        console.error('Failed to load LAN NAS status:', error);
        if (!disposed) setNasError(error instanceof Error ? error.message : String(error));
      }
    };

    refreshNasStatus();
    const timer = setInterval(refreshNasStatus, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [t]);

  const openNasManager = () => {
    setNasDirectory(nasStatus?.directory ?? '');
    setNasAuthenticationEnabled(nasStatus?.authenticationEnabled ?? true);
    setNasError(null);
    setNasOpen(true);
  };

  const chooseNasDirectory = async () => {
    try {
      const result = await window.electron.invoke(UTIL_SELECT_DIRECTORY, nasDirectory || undefined);
      if (result.success && result.data) setNasDirectory(result.data.path);
      else if (result.error && result.error !== 'Selection canceled') setNasError(result.error);
    } catch (error) {
      setNasError(error instanceof Error ? error.message : String(error));
    }
  };

  const startNas = async () => {
    setNasBusy(true);
    setNasError(null);
    try {
      const result = await window.electron.invoke(LAN_NAS_START, {
        directory: nasDirectory,
        authenticationEnabled: nasAuthenticationEnabled,
      });
      if (!result.success || !result.data) throw new Error(result.error ?? t('apps.nas.start_failed'));
      setNasStatus(result.data);
    } catch (error) {
      setNasError(error instanceof Error ? error.message : String(error));
    } finally {
      setNasBusy(false);
    }
  };

  const stopNas = async () => {
    setNasBusy(true);
    setNasError(null);
    try {
      const result = await window.electron.invoke(LAN_NAS_STOP);
      if (!result.success) throw new Error(result.error ?? t('apps.nas.stop_failed'));
      const status = await window.electron.invoke(LAN_NAS_STATUS);
      if (!status.success || !status.data) throw new Error(status.error ?? t('apps.nas.status_failed'));
      setNasStatus(status.data);
    } catch (error) {
      setNasError(error instanceof Error ? error.message : String(error));
    } finally {
      setNasBusy(false);
    }
  };

  const copyNasPassword = async () => {
    if (!nasStatus?.password) return;
    try {
      await navigator.clipboard.writeText(nasStatus.password);
    } catch (error) {
      setNasError(error instanceof Error ? error.message : String(error));
    }
  };

  const selectableApps = applications.filter((app) =>
    app.catalogId !== LAN_NAS_APP_ID &&
    app.id !== LAN_NAS_APP_ID &&
    app.status !== 'uninstalling' &&
    !['installing', 'paused', 'aborting'].includes(app.install?.status ?? '')
  );
  const selectedApps = selectableApps.filter((app) => selectedIds.includes(app.id));
  const runnable = (app: (typeof applications)[number]) =>
    !app.kind || app.kind === 'app' || app.kind === 'engine' || app.kind === 'webui';
  const startableApps = selectedApps.filter((app) =>
    runnable(app) &&
    app.install?.installed !== false &&
    !['running', 'starting'].includes(app.task?.status ?? '')
  );
  const stoppableApps = selectedApps.filter((app) =>
    runnable(app) &&
    app.install?.installed !== false &&
    ['running', 'paused', 'starting', 'pausing', 'stopping'].includes(app.task?.status ?? '')
  );

  const toggleSelectedApp = (id: string) => {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);
  };

  const runBatchStart = async () => {
    setBatchBusy(true);
    setBatchError(null);
    const skipped: string[] = [];
    try {
      for (const app of startableApps) {
        const runtime = app.runtime?.runtime;
        if (runtime && runtime !== 'native') {
          try {
            const result = await window.electron.invoke(RUNTIME_ENGINE_STATUS, runtime);
            if (!result.success || !result.data?.installed || !result.data.running) {
              skipped.push(app.name);
              continue;
            }
          } catch {
            skipped.push(app.name);
            continue;
          }
        }
        await startApplication(app.id);
        const updated = useAppStore.getState().applications.find((item) => item.id === app.id);
        if (updated?.error) skipped.push(app.name);
      }
      if (skipped.length) setBatchError(t('apps.batch.start_skipped', { names: skipped.join(', ') }));
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : String(error));
    } finally {
      setBatchBusy(false);
    }
  };

  const runBatchStop = async () => {
    setBatchBusy(true);
    setBatchError(null);
    const failed: string[] = [];
    try {
      for (const app of stoppableApps) {
        if (!(await stopApplication(app.id))) failed.push(app.name);
      }
      if (failed.length) setBatchError(t('apps.batch.operation_failed', { names: failed.join(', ') }));
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : String(error));
    } finally {
      setBatchBusy(false);
    }
  };

  const runBatchUninstall = async () => {
    if (!selectedApps.length) return;
    setBatchBusy(true);
    setBatchError(null);
    const failed: string[] = [];
    const failedIds = new Set<string>();
    try {
      for (const app of selectedApps) {
        if (app.task?.id && ['running', 'paused', 'starting', 'pausing', 'stopping'].includes(app.task.status)) {
          if (!(await stopApplication(app.id))) {
            failed.push(app.name);
            failedIds.add(app.id);
            continue;
          }
        }
        if (!(await uninstallApplication(app.id))) {
          failed.push(app.name);
          failedIds.add(app.id);
        }
      }
      setSelectedIds([...failedIds]);
      if (failed.length) setBatchError(t('apps.batch.operation_failed', { names: failed.join(', ') }));
      else setSelectedIds([]);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : String(error));
    } finally {
      setBatchBusy(false);
    }
  };

  if (isLoading && applications.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-light-subtle dark:text-dark-subtle">
        <RefreshCw className="w-8 h-8 animate-spin mb-4" />
        <p>{t('apps.loading')}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Box className="w-6 h-6 text-blue-600" />
          {t('apps.title')}
          <span aria-live="polite" className="ml-1 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
            {t('apps.count', { count: applications.length })}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <LifecycleHistory ownerType="app" />
          <button 
            onClick={() => fetchApplications()}
            className="p-2 hover:bg-light-muted dark:hover:bg-dark-muted rounded-full transition-colors"
            title={t('apps.refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {selectableApps.length > 0 && (
        <div className={`mb-5 flex flex-wrap items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors ${
          selectionMode
            ? 'border-blue-200 bg-blue-50/80 dark:border-blue-900/60 dark:bg-blue-950/20'
            : 'border-transparent'
        }`}>
          <button
            type="button"
            onClick={() => {
              setSelectionMode((active) => !active);
              setSelectedIds([]);
              setBatchError(null);
            }}
            disabled={batchBusy}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              selectionMode
                ? 'bg-light-surface text-light-text shadow-sm dark:bg-dark-surface dark:text-dark-text'
                : 'text-light-subtle hover:bg-light-muted hover:text-light-text dark:text-dark-subtle dark:hover:bg-dark-muted dark:hover:text-dark-text'
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            {selectionMode ? t('apps.batch.done_selecting') : t('apps.batch.select_mode')}
          </button>
          {selectionMode && (
            <>
              <span className="h-5 w-px bg-light-border dark:bg-dark-border" />
              <button
                type="button"
                onClick={() => setSelectedIds((current) => {
                  const allSelected = selectableApps.every((app) => current.includes(app.id));
                  return allSelected
                    ? current.filter((id) => !selectableApps.some((app) => app.id === id))
                    : [...new Set([...current, ...selectableApps.map((app) => app.id)])];
                })}
                disabled={batchBusy}
                className="rounded-lg px-3 py-2 text-sm text-light-subtle transition-colors hover:bg-light-surface hover:text-light-text disabled:opacity-50 dark:text-dark-subtle dark:hover:bg-dark-surface dark:hover:text-dark-text"
              >
                {t('apps.batch.select_all')}
              </button>
              {selectedApps.length > 0 && (
                <>
                  <span className="text-sm font-medium">{t('apps.batch.selected', { count: selectedApps.length })}</span>
                  <button type="button" onClick={runBatchStart} disabled={batchBusy || startableApps.length === 0} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
                    <Play className="w-3.5 h-3.5" />{t('apps.batch.start')}
                  </button>
                  <button type="button" onClick={runBatchStop} disabled={batchBusy || stoppableApps.length === 0} className="flex items-center gap-1.5 rounded-lg bg-orange-100 px-3 py-2 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-200 disabled:opacity-50 dark:bg-orange-900/20 dark:text-orange-400">
                    <Square className="w-3.5 h-3.5" />{t('apps.batch.stop')}
                  </button>
                  <button type="button" onClick={() => setUninstallConfirmOpen(true)} disabled={batchBusy} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                    <Trash2 className="w-3.5 h-3.5" />{t('apps.batch.uninstall')}
                  </button>
                  <button type="button" onClick={() => setSelectedIds([])} disabled={batchBusy} className="rounded-lg px-3 py-2 text-xs text-light-subtle transition-colors hover:bg-light-surface disabled:opacity-50 dark:text-dark-subtle dark:hover:bg-dark-surface">
                    {t('explore.batch.clear_selection')}
                  </button>
                  {batchBusy && <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />}
                </>
              )}
              {batchError && <p role="alert" className="basis-full text-sm text-red-600 dark:text-red-400">{batchError}</p>}
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">

        {applications.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-light-border dark:border-dark-border rounded-xl">
            <p className="text-light-subtle dark:text-dark-subtle">{t('apps.empty')}</p>
          </div>
        ) : (
          applications.map((app) => {
            const isNas = app.catalogId === LAN_NAS_APP_ID || app.id === LAN_NAS_APP_ID;
            const lifecycleResults = lifecycleResultsByAppId[app.id];
            const installStatus = app.install?.status;
            const status = isNas
              ? nasStatus ? (nasStatus.running ? 'running' : 'stopped') : 'unknown'
              : app.status === 'uninstalling'
                ? 'uninstalling'
                : installStatus && ['installing', 'paused', 'aborting', 'failed', 'aborted'].includes(installStatus)
                ? installStatus
                : (app.task?.status || 'stopped');
            const busy = isNas ? nasBusy : ['installing', 'paused', 'aborting'].includes(installStatus ?? '') || ['starting', 'stopping', 'uninstalling'].includes(status);
            const running = status === 'running';
            const canOpenWorkspace = app.install?.installed !== false && status !== 'uninstalling' && !['installing', 'paused', 'aborting'].includes(installStatus ?? '');
            const hostPort = app.task?.hostPorts
              ? (app.task.hostPorts['8080'] || Object.values(app.task.hostPorts)[0])
              : undefined;
            const webUrl = running && hostPort ? `http://localhost:${hostPort}` : undefined;
            // Component kinds (MCP servers, skills, hooks…) are not runnable
            // containers: they register themselves in the workspace registry.
            const runnable = !app.kind || app.kind === 'app' || app.kind === 'engine' || app.kind === 'webui';
            // Neutral states need an explicit dark text color; inheriting the
            // light-theme gray would be almost invisible on a dark badge.
            const statusTone =
              running || status === 'starting'
                ? {
                    badge: 'border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-300',
                    dot: 'bg-green-500 dark:bg-green-400',
                  }
                : ['installing', 'aborting'].includes(status)
                  ? {
                      badge: 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300',
                      dot: 'bg-blue-500 dark:bg-blue-400',
                    }
                  : status === 'paused' || status === 'aborted'
                    ? {
                        badge: 'border-gray-200 bg-gray-100 text-gray-700 dark:border-dark-muted/40 dark:bg-dark-muted/30 dark:text-dark-text',
                        dot: 'bg-gray-400 dark:bg-dark-text/80',
                      }
                  : status === 'failed' || status === 'uninstalling'
                  ? {
                      badge: 'border-red-200 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300',
                      dot: 'bg-red-500 dark:bg-red-400',
                    }
                  : {
                      badge: 'border-gray-200 bg-gray-100 text-gray-700 dark:border-dark-muted/40 dark:bg-dark-muted/30 dark:text-dark-text',
                      dot: 'bg-gray-400 dark:bg-dark-text/80',
                    };

            return (
              <div
                key={app.id}
                onClick={() => {
                  if (selectionMode && !isNas && status !== 'uninstalling' && !['installing', 'paused', 'aborting'].includes(installStatus ?? '')) {
                    toggleSelectedApp(app.id);
                  } else if (isNas) openNasManager();
                  else if (runnable && canOpenWorkspace) openWorkspace(app.id);
                }}
                className={`relative rounded-xl p-5 border flex flex-col shadow-sm transition-all group ${
                  selectionMode && selectedIds.includes(app.id)
                    ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/15 dark:bg-blue-950/25'
                    : 'border-light-border bg-light-surface hover:shadow-md dark:border-dark-border dark:bg-dark-surface'
                } ${(runnable && canOpenWorkspace) || isNas || selectionMode ? 'cursor-pointer hover:border-blue-500/50' : ''}`}
              >
                {/* Top row: icon + status only, so the status text never gets
                    squeezed by the title. Title and install date live below. */}
                <div className="flex items-start justify-between mb-3">
                  {selectionMode && !isNas && status !== 'uninstalling' && !['installing', 'paused', 'aborting'].includes(installStatus ?? '') && (
                    <input
                      type="checkbox"
                      aria-label={t('apps.batch.select_app', { name: app.name })}
                      checked={selectedIds.includes(app.id)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleSelectedApp(app.id)}
                      disabled={batchBusy}
                      className="absolute left-4 top-4 z-10 h-4 w-4 animate-in zoom-in-90 duration-150 accent-blue-600"
                    />
                  )}
                  <ApplicationIcon
                    icon={app.icon}
                    name={app.name}
                    className={`w-10 h-10 shrink-0 rounded-lg ${selectionMode && !isNas ? 'ml-6' : ''}`}
                  />
                  {['installing', 'aborting'].includes(installStatus ?? '') && (
                    <div className="absolute top-4 right-4">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                    </div>
                  )}
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusTone.badge}`}
                  >
                    {status === 'uninstalling'
                      ? <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />
                      : <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusTone.dot}`} />}
                    {t(`apps.status.${status}`, { defaultValue: status })}
                  </span>
                </div>
                <div className="mb-4">
                  <h3 className="font-semibold leading-tight">{app.name}</h3>
                  <p className="text-xs text-light-subtle dark:text-dark-subtle">v{app.version}</p>
                  {app.install?.installed_at && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-light-subtle dark:text-dark-subtle" title={t('explore.label.installed_at')}>
                      <Calendar className="w-3 h-3 text-blue-500" />
                      <span>{new Date(app.install.installed_at).toLocaleDateString(i18n.language)}</span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-light-subtle dark:text-dark-subtle mb-4 line-clamp-2 flex-1 group-hover:text-light-default dark:group-hover:text-dark-default transition-colors">
                  {app.description || t('apps.no_description')}
                </p>

                {app.error && (
                  <p className="mb-3 text-xs text-red-500 dark:text-red-400 line-clamp-2 break-words" title={app.error}>
                    {app.error}
                  </p>
                )}

                {lifecycleResults && (
                  <section
                    className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/60 dark:bg-blue-900/20"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-200">
                        {t('apps.workspace.lifecycle_actions')}
                      </h4>
                      <button
                        type="button"
                        onClick={() => dismissLifecycleResults(app.id)}
                        className="rounded p-0.5 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                        title={t('apps.workspace.dismiss')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {lifecycleResults.map((result) => (
                      <pre
                        key={result.id}
                        className={`whitespace-pre-wrap break-words font-mono text-[10px] ${
                          result.status === 'failed'
                            ? 'text-red-600 dark:text-red-400'
                            : result.status === 'skipped'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-light-text dark:text-dark-text'
                        }`}
                      >
                        {result.message}
                      </pre>
                    ))}
                  </section>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-light-border dark:border-dark-border">
                  {isNas ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openNasManager();
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      <HardDrive className="w-3.5 h-3.5" /> {t('apps.nas.manage')}
                    </button>
                  ) : !runnable && app.install?.installed !== false ? (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                      <Puzzle className="w-3.5 h-3.5" /> {t('apps.action.in_workspace')}
                    </span>
                  ) : (
                  <>
                  {['installing', 'paused', 'aborting'].includes(installStatus ?? '') ? (
                    <AppInstallControls
                      appId={app.catalogId || app.id}
                      status={installStatus}
                      onStatusChange={(nextStatus: AppInstallStatus) => useAppStore.setState((state) => ({
                        applications: state.applications.map((item) =>
                          item.id === app.id ? { ...item, install: { ...item.install, installed: false, status: nextStatus } } : item
                        ),
                      }))}
                    />
                  ) : running || status === 'starting' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        stopApplication(app.id);
                      }}
                      disabled={busy || app.install?.installed === false}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/20 dark:text-orange-400 disabled:opacity-50 transition-colors"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" /> {t('app.stop')}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startApplication(app.id);
                      }}
                      disabled={busy || app.install?.installed === false}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> {status === 'failed' ? t('app.restart') : t('app.start')}
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openWorkspace(app.id);
                    }}
                    disabled={!canOpenWorkspace}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted disabled:opacity-50 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> {t('apps.action.view')}
                  </button>

                  {webUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openWorkspace(app.id, webUrl);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 transition-colors"
                      title={t('apps.action.open_url', { url: webUrl })}
                    >
                      <Globe className="w-3.5 h-3.5" /> {t('apps.action.web_ui')}
                    </button>
                  )}
                  </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {uninstallConfirmOpen && (
        <AppUninstallDialog
          appName={selectedApps.length === 1 ? selectedApps[0].name : undefined}
          count={selectedApps.length === 1 ? undefined : selectedApps.length}
          onCancel={() => setUninstallConfirmOpen(false)}
          onConfirm={() => {
            setUninstallConfirmOpen(false);
            void runBatchUninstall();
          }}
        />
      )}

      {nasOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !nasBusy && setNasOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="nas-title"
            className="w-full max-w-xl rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-dark-border">
              <h2 id="nas-title" className="font-bold text-lg flex items-center gap-2"><HardDrive className="w-5 h-5 text-blue-500" />{t('apps.nas.title')}</h2>
              <button type="button" onClick={() => setNasOpen(false)} disabled={nasBusy} aria-label={t('apps.nas.close')} className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted disabled:opacity-50"><X className="w-4 h-4" /></button>
            </header>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">{t('apps.nas.folder')}</label>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-light-border dark:border-dark-border text-sm truncate" title={nasDirectory}>
                    {nasDirectory || t('apps.nas.no_folder')}
                  </div>
                  <button type="button" onClick={chooseNasDirectory} disabled={nasBusy || nasStatus?.running} className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg border border-light-border dark:border-dark-border hover:border-blue-500 disabled:opacity-50">
                    <FolderOpen className="w-4 h-4" />{t('apps.nas.choose_folder')}
                  </button>
                </div>
              </div>

              <label className={`flex items-start gap-3 p-3 rounded-lg border border-light-border dark:border-dark-border ${nasStatus?.running ? 'opacity-60' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={nasAuthenticationEnabled}
                  disabled={nasBusy || nasStatus?.running}
                  onChange={(event) => setNasAuthenticationEnabled(event.target.checked)}
                  className="mt-1 accent-blue-600"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {nasAuthenticationEnabled ? <ShieldCheck className="w-4 h-4 text-green-600" /> : <ShieldOff className="w-4 h-4 text-amber-600" />}
                    {t('apps.nas.authentication')}
                  </span>
                  <span className="block mt-1 text-xs text-light-subtle dark:text-dark-subtle">{t('apps.nas.authentication_help')}</span>
                </span>
              </label>

              <div className={`rounded-lg p-3 text-xs ${nasAuthenticationEnabled ? 'bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200'}`}>
                {nasAuthenticationEnabled ? t('apps.nas.secure_note') : t('apps.nas.open_note')}
              </div>

              {nasStatus?.running ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">{t('apps.nas.running')}</p>
                  <div className="space-y-2">
                    {nasStatus.urls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="block text-sm text-blue-600 dark:text-blue-400 break-all hover:underline">{url}</a>)}
                  </div>
                  {nasStatus.authenticationEnabled && nasStatus.password && (
                    <div className="space-y-2">
                      <p className="text-xs text-light-subtle dark:text-dark-subtle">{t('apps.nas.username')}: <code>aisphere</code></p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-light-subtle dark:text-dark-subtle">{t('apps.nas.password')}</span>
                        <code className="flex-1 min-w-0 px-2 py-1 rounded bg-light-muted dark:bg-dark-muted text-sm break-all select-all">{nasStatus.password}</code>
                        <button type="button" onClick={copyNasPassword} className="p-2 rounded border border-light-border dark:border-dark-border hover:border-blue-500" title={t('apps.nas.copy_password')}><Copy className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-light-subtle dark:text-dark-subtle">{t('apps.nas.running_folder', { folder: nasStatus.directory })}</p>
                </div>
              ) : (
                <p className="text-sm text-light-subtle dark:text-dark-subtle">{t('apps.nas.stopped')}</p>
              )}

              {nasError && <p role="alert" className="text-sm text-red-600 dark:text-red-400 break-words">{nasError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                {nasStatus?.running ? (
                  <button type="button" onClick={stopNas} disabled={nasBusy} className="px-4 py-2 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300 disabled:opacity-50">
                    {nasBusy ? t('apps.nas.working') : t('apps.nas.stop')}
                  </button>
                ) : (
                  <button type="button" onClick={startNas} disabled={nasBusy || !nasDirectory} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                    {nasBusy ? t('apps.nas.working') : t('apps.nas.start')}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
