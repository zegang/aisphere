import { useEffect, useRef, useState } from 'react';
import {
  Box,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Upload,
  FileJson,
  FileArchive,
  FolderOpen,
  Loader2,
  RefreshCw,
  ChevronRight,
  Terminal as TerminalIcon,
  ShieldCheck,
  StopCircle,
  X,
  Trash2,
  Play,
  Square,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import {
  RUNTIME_CONFIG_EXPORT,
  RUNTIME_CONFIG_IMPORT,
  RUNTIME_INSTALL_INPUT,
  RUNTIME_INSTALL_RESIZE,
  type RuntimeConfigExportResult,
  type RuntimeConfigImportResult,
  type RuntimeInstallStatusEvent,
  type RuntimeKind,
} from '@/shared/channel-types';
import {
  RUNTIME_KINDS,
  isRuntimeInstallActive,
  useRuntimeStore,
  type RuntimeCheckStatus,
  type RuntimeLogBuffer,
} from '@/stores/runtimeStore';
import { useAiSphereStore } from '@/stores/aiSphereStore';
import { useTranslation } from '@/i18n';
import { CopyableError } from '@/components/CopyableError';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface InstallTerminalProps {
  type: RuntimeKind;
  install?: RuntimeInstallStatusEvent;
  log?: RuntimeLogBuffer;
  canAbort: boolean;
  onAbort: () => void;
  onClose: () => void;
}

function describeInstall(t: TFunction, install?: RuntimeInstallStatusEvent): string {
  switch (install?.state) {
    case 'starting':
      return install.message || t('runtimes.install_state.preparing');
    case 'downloading':
      return typeof install.percent === 'number'
        ? t('runtimes.install_state.downloading_percent', { percent: install.percent })
        : t('runtimes.install_state.downloading');
    case 'installing':
      return install.message || t('runtimes.install_state.installing');
    case 'completed':
      return t('runtimes.install_state.completed');
    case 'failed':
      return t('runtimes.install_state.failed');
    case 'aborted':
      return t('runtimes.install_state.aborted');
    default:
      return t('runtimes.install_state.ended');
  }
}

function formatBytes(bytes?: number): string | undefined {
  if (typeof bytes !== 'number' || bytes <= 0) return undefined;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InstallTerminal({ type, install, log, canAbort, onAbort, onClose }: InstallTerminalProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const writtenRef = useRef(0);
  const logRef = useRef(log);
  logRef.current = log;

  const active = isRuntimeInstallActive(install);

  // Create the terminal once per runtime panel. The full log buffered in the
  // store is replayed here, so reopening the page (or the panel) restores the
  // output that was produced while it was unmounted.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm({
      theme: {
        background: '#0b1020',
        foreground: '#dbeafe',
        cursor: '#60a5fa',
        selectionBackground: '#3b82f680',
      },
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
      scrollback: 5000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    const buffered = logRef.current;
    if (buffered?.text) {
      term.write(buffered.text);
      writtenRef.current = buffered.start + buffered.text.length;
    }

    const dataDisposable = term.onData((data) => {
      window.electron.send(RUNTIME_INSTALL_INPUT, { type, data });
    });
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      window.electron.send(RUNTIME_INSTALL_RESIZE, { type, cols, rows });
    });

    const handleWindowResize = () => {
      try {
        fitAddon.fit();
      } catch {
        // The container can be hidden while the window is resizing.
      }
    };
    window.addEventListener('resize', handleWindowResize);

    const frame = requestAnimationFrame(() => {
      handleWindowResize();
      term.focus();
      // The panel is rendered in the page flow. Bring it into view when the
      // user starts an installation from the top of the page.
      panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleWindowResize);
      dataDisposable.dispose();
      resizeDisposable.dispose();
      if (termRef.current === term) termRef.current = null;
      fitAddonRef.current = null;
      writtenRef.current = 0;
      term.dispose();
    };
  }, [type]);

  // Stream only the newly appended part of the log into the terminal.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    if (!log) {
      if (writtenRef.current !== 0) {
        term.reset();
        writtenRef.current = 0;
      }
      return;
    }

    const end = log.start + log.text.length;
    if (log.start > writtenRef.current || end < writtenRef.current) {
      // The buffer was reset for a new installation, or its beginning was
      // trimmed past what this terminal has already rendered.
      term.reset();
      writtenRef.current = log.start;
      if (log.text) {
        term.write(log.text);
        writtenRef.current = end;
      }
      term.scrollToBottom();
      return;
    }

    const delta = log.text.slice(writtenRef.current - log.start);
    if (!delta) return;
    writtenRef.current = end;
    term.write(delta);
    term.scrollToBottom();
  }, [log]);

  const statusText = describeInstall(t, install);
  const total = formatBytes(install?.totalBytes);
  const downloaded = formatBytes(install?.downloadedBytes);

  return (
    <div
      ref={panelRef}
      className="mt-8 h-[360px] relative bg-[#0b1020] rounded-xl border border-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-4 transition-all duration-200 flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0 gap-4">
        <div className="flex items-center gap-2 text-white min-w-0">
          <TerminalIcon className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-sm font-bold uppercase tracking-widest truncate">
            {type}
          </span>
          <span className={`text-[10px] font-normal normal-case tracking-normal truncate ${active ? 'text-blue-300/80' : 'text-gray-400'}`}>
            {statusText}
            {install?.state === 'downloading' && downloaded
              ? ` (${downloaded}${total ? ` / ${total}` : ''})`
              : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {active && canAbort && (
            <button
              onClick={onAbort}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md text-xs font-bold transition-colors"
            >
              <StopCircle className="w-3.5 h-3.5" /> {t('runtimes.terminal.abort')}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
            title={t('runtimes.terminal.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {install?.state === 'downloading' && typeof install.percent === 'number' && (
        <div className="h-1 bg-white/5 shrink-0">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${Math.max(0, Math.min(100, install.percent))}%` }}
          />
        </div>
      )}

      <div ref={containerRef} className="flex-1 min-h-0 px-2 py-2" />
    </div>
  );
}

function RuntimeCard({
  runtime,
  install,
  busy,
  uninstalling,
  starting,
  stopping,
  onInstall,
  onUninstall,
  onStart,
  onStop,
  onOpenDetail,
  onShowProgress,
}: {
  runtime: RuntimeCheckStatus;
  install?: RuntimeInstallStatusEvent;
  busy: boolean;
  uninstalling: boolean;
  starting: boolean;
  stopping: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onStart: () => void;
  onStop: () => void;
  onOpenDetail: () => void;
  onShowProgress: () => void;
}) {
  const { t } = useTranslation();
  const active = isRuntimeInstallActive(install);
  const statusText = describeInstall(t, install);
  const total = formatBytes(install?.totalBytes);
  const downloaded = formatBytes(install?.downloadedBytes);
  const canStart = runtime.installed && runtime.hasEngine && runtime.running === false && !active;
  const canStop = runtime.installed && runtime.hasEngine && runtime.running === true && !active;
  const label = runtime.type === 'docker'
    ? 'Docker'
    : runtime.type === 'podman'
      ? 'Podman'
      : runtime.type === 'conda'
        ? 'Conda'
        : 'Apptainer';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDetail();
        }
      }}
      className="group bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-6 shadow-sm flex flex-col cursor-pointer hover:shadow-md hover:border-blue-500/50 transition-all"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <Box className="w-6 h-6 text-blue-600" />
        </div>
        <div className="flex items-center gap-2">
          {runtime.loading ? (
            <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
          ) : runtime.installed ? (
            <div className="flex items-center gap-1 text-green-600 text-xs font-bold uppercase">
              <CheckCircle className="w-4 h-4" /> {t('runtimes.status.installed')}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-red-500 text-xs font-bold uppercase">
              <XCircle className="w-4 h-4" /> {t('runtimes.status.missing')}
            </div>
          )}
          <ChevronRight className="w-4 h-4 text-light-subtle dark:text-dark-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <h3 className="text-lg font-bold capitalize mb-1">{runtime.type}</h3>
      <p className="text-xs text-light-subtle dark:text-dark-subtle mb-3 flex-1">
        {t(`runtimes.description.${runtime.type}`)}
      </p>

      {runtime.installed && !active && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {runtime.running !== undefined && (
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                runtime.running
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  runtime.running ? 'bg-green-500' : 'bg-amber-500'
                }`}
              />
              {runtime.hasEngine
                ? t(runtime.running ? 'runtimes.status.running' : 'runtimes.status.stopped')
                : t('runtimes.status.ready')}
            </span>
          )}
          {runtime.version && (
            <span
              className="font-mono text-[10px] text-light-subtle dark:text-dark-subtle truncate max-w-[55%]"
              title={runtime.version}
            >
              {runtime.version}
            </span>
          )}
        </div>
      )}

      {active && (
        <div className="mb-4 rounded-lg border border-blue-200/60 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-xs text-blue-700 dark:text-blue-300">
            <span className="flex items-center gap-1.5 font-medium min-w-0">
              <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span className="truncate">{statusText}</span>
            </span>
            {install?.state === 'downloading' && downloaded && (
              <span className="font-mono text-[10px] shrink-0">
                {downloaded}{total ? ` / ${total}` : ''}
              </span>
            )}
          </div>
          {install?.state === 'downloading' && typeof install.percent === 'number' && (
            <div className="mt-2 h-1.5 rounded-full bg-blue-100 dark:bg-blue-950/60 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, install.percent))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {runtime.engineError && (
        <CopyableError inline className="mb-3" message={runtime.engineError} />
      )}

      {active ? (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onShowProgress();
          }}
          className="w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
        >
          <RefreshCw className="w-4 h-4 animate-spin" />
          {uninstalling ? t('runtimes.action.uninstalling') : t('runtimes.action.show_progress')}
        </button>
      ) : runtime.installed ? (
        <div className="space-y-2">
          {canStart && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onStart();
              }}
              disabled={starting || busy}
              className="w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {starting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {starting ? t('runtimes.action.starting') : t('runtimes.action.start')}
            </button>
          )}
          {canStop && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onStop();
              }}
              disabled={stopping || busy}
              className="w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border border-amber-300 dark:border-amber-700/70 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            onClick={(event) => {
              event.stopPropagation();
              onUninstall();
            }}
            disabled={!runtime.managed || busy}
            title={runtime.managed
              ? t('runtimes.action.uninstall_tooltip', { name: label })
              : t('runtimes.action.uninstall_unmanaged')}
            className="w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-4 h-4" /> {t('runtimes.action.uninstall')}
          </button>
        </div>
      ) : (
        <button
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            onInstall();
          }}
          className="w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Download className="w-4 h-4" /> {t('runtimes.action.install')}
        </button>
      )}
    </div>
  );
}

export default function RuntimePage() {
  const { t } = useTranslation();
  const statuses = useRuntimeStore((state) => state.statuses);
  const installs = useRuntimeStore((state) => state.installs);
  const logs = useRuntimeStore((state) => state.logs);
  const logPanelType = useRuntimeStore((state) => state.logPanelType);
  const uninstalling = useRuntimeStore((state) => state.uninstalling);
  const starting = useRuntimeStore((state) => state.starting);
  const stopping = useRuntimeStore((state) => state.stopping);
  const checkRuntimes = useRuntimeStore((state) => state.checkRuntimes);
  const startEngine = useRuntimeStore((state) => state.startEngine);
  const stopEngine = useRuntimeStore((state) => state.stopEngine);
  const syncInstallStatus = useRuntimeStore((state) => state.syncInstallStatus);
  const installRuntime = useRuntimeStore((state) => state.installRuntime);
  const uninstallRuntime = useRuntimeStore((state) => state.uninstallRuntime);
  const abortInstall = useRuntimeStore((state) => state.abortInstall);
  const openLogPanel = useRuntimeStore((state) => state.openLogPanel);
  const closeLogPanel = useRuntimeStore((state) => state.closeLogPanel);
  const openRuntimeDetail = useAiSphereStore((state) => state.openRuntimeDetail);

  useEffect(() => {
    checkRuntimes();
    // Pick up installations that kept running while the page was unmounted.
    syncInstallStatus();
  }, [checkRuntimes, syncInstallStatus]);

  const activeType = RUNTIME_KINDS.find((type) => isRuntimeInstallActive(installs[type]));

  const handleUninstall = async (type: RuntimeKind) => {
    const label = type === 'docker' ? 'Docker' : type === 'podman' ? 'Podman' : type === 'conda' ? 'Conda' : 'Apptainer';
    const confirmed = window.confirm(
      `${t('runtimes.uninstall.confirm_title', { name: label })}\n\n`
      + t('runtimes.uninstall.confirm_message', { name: label })
    );
    if (!confirmed) return;
    await uninstallRuntime(type);
  };

  // ---- Export / import of runtime configurations (运行时配置) ----
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'single' | 'folder' | 'zip'>('single');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportResult, setExportResult] = useState<RuntimeConfigExportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState<'file' | 'folder' | null>(null);
  const [importResult, setImportResult] = useState<RuntimeConfigImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const openExportDialog = () => {
    setExportMode('single');
    setExportResult(null);
    setExportError(null);
    setExportOpen(true);
  };

  const doExport = async () => {
    setExportBusy(true);
    setExportError(null);
    try {
      const result = await window.electron.invoke(RUNTIME_CONFIG_EXPORT, { mode: exportMode });
      if (result.success && result.data) setExportResult(result.data);
      else setExportError(result.error ?? t('runtimes.export.failed'));
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExportBusy(false);
    }
  };

  const openImportDialog = () => {
    setImportResult(null);
    setImportError(null);
    setImportOpen(true);
  };

  const doImport = async (source: 'file' | 'folder') => {
    setImportBusy(source);
    setImportError(null);
    try {
      const result = await window.electron.invoke(RUNTIME_CONFIG_IMPORT, { source });
      if (result.success && result.data) {
        setImportResult(result.data);
        await checkRuntimes();
      } else {
        setImportError(result.error ?? t('runtimes.import.failed'));
      }
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportBusy(null);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-blue-600" />
            {t('runtimes.title')}
          </h2>
          <p className="text-light-subtle dark:text-dark-subtle mt-1">
            {t('runtimes.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openExportDialog}
            title={t('runtimes.export.title')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface hover:border-blue-500/50 hover:text-blue-600 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> {t('runtimes.export.button')}
          </button>
          <button
            type="button"
            onClick={openImportDialog}
            title={t('runtimes.import.title')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface hover:border-blue-500/50 hover:text-blue-600 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> {t('runtimes.import.button')}
          </button>
          <button
            onClick={checkRuntimes}
            title={t('runtimes.refresh')}
            className="p-2 hover:bg-light-muted dark:hover:bg-dark-muted rounded-full transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${statuses.some((status) => status.loading) ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {statuses.map((runtime) => (
          <RuntimeCard
            key={runtime.type}
            runtime={runtime}
            install={installs[runtime.type]}
            busy={!!activeType && activeType !== runtime.type}
            uninstalling={!!uninstalling[runtime.type]}
            starting={!!starting[runtime.type]}
            stopping={!!stopping[runtime.type]}
            onInstall={() => installRuntime(runtime.type)}
            onUninstall={() => handleUninstall(runtime.type)}
            onStart={() => startEngine(runtime.type)}
            onStop={() => stopEngine(runtime.type)}
            onOpenDetail={() => openRuntimeDetail(runtime.type)}
            onShowProgress={() => openLogPanel(runtime.type)}
          />
        ))}
      </div>

      {logPanelType && (
        <InstallTerminal
          key={logPanelType}
          type={logPanelType}
          install={installs[logPanelType]}
          log={logs[logPanelType]}
          canAbort={!uninstalling[logPanelType]}
          onAbort={() => abortInstall(logPanelType)}
          onClose={closeLogPanel}
        />
      )}

      {/* ---- Export dialog ---- */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !exportBusy && setExportOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-light-border dark:border-dark-border">
              <h3 className="font-bold flex items-center gap-2">
                <Download className="w-4 h-4 text-blue-500" /> {t('runtimes.export.title')}
              </h3>
              {!exportBusy && (
                <button type="button" onClick={() => setExportOpen(false)} className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="px-5 py-4 space-y-4">
              {!exportResult && (
                <>
                  {/* Organization of the exported files */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-light-subtle dark:text-dark-subtle">{t('runtimes.export.layout')}</p>
                    {([
                      { key: 'single', icon: FileJson, label: t('runtimes.export.mode_single'), desc: t('runtimes.export.mode_single_desc') },
                      { key: 'folder', icon: FolderOpen, label: t('runtimes.export.mode_folder'), desc: t('runtimes.export.mode_folder_desc') },
                      { key: 'zip', icon: FileArchive, label: t('runtimes.export.mode_zip'), desc: t('runtimes.export.mode_zip_desc') },
                    ] as const).map(({ key, icon: Icon, label, desc }) => (
                      <label
                        key={key}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          exportMode === key
                            ? 'border-blue-500/60 bg-blue-50/60 dark:bg-blue-900/10'
                            : 'border-light-border dark:border-dark-border hover:border-blue-500/40'
                        }`}
                      >
                        <input type="radio" name="runtime-export-mode" className="mt-1 accent-blue-600" checked={exportMode === key} onChange={() => setExportMode(key)} />
                        <Icon className="w-4 h-4 mt-0.5 text-light-subtle dark:text-dark-subtle shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{label}</span>
                          <span className="block text-[11px] text-light-muted dark:text-dark-muted">{desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <p className="text-[11px] text-light-muted dark:text-dark-muted">{t('runtimes.export.timestamp_note')}</p>
                </>
              )}

              {exportResult && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200/60 dark:border-green-500/20">
                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        {t('runtimes.export.done', { count: exportResult.count })}
                      </p>
                      <p className="text-[11px] text-light-muted dark:text-dark-muted break-all mt-0.5">{exportResult.path}</p>
                    </div>
                  </div>
                </div>
              )}

              {exportError && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-500/20">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <CopyableError inline className="min-w-0 flex-1" message={exportError} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-light-border dark:border-dark-border">
              {exportResult ? (
                <button type="button" onClick={() => setExportOpen(false)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  {t('runtimes.export.close')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={() => setExportOpen(false)}
                    className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors disabled:opacity-50"
                  >
                    {t('runtimes.export.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={doExport}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {exportBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {exportBusy ? t('runtimes.export.exporting') : t('runtimes.export.confirm')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Import dialog ---- */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !importBusy && setImportOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-light-border dark:border-dark-border">
              <h3 className="font-bold flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-500" /> {t('runtimes.import.title')}
              </h3>
              {!importBusy && (
                <button type="button" onClick={() => setImportOpen(false)} className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="px-5 py-4 space-y-4">
              {!importResult && (
                <>
                  <p className="text-xs text-light-subtle dark:text-dark-subtle">{t('runtimes.import.hint')}</p>
                  <div className="space-y-2">
                    {([
                      { key: 'file' as const, icon: FileJson, label: t('runtimes.import.files'), desc: t('runtimes.import.files_desc') },
                      { key: 'folder' as const, icon: FolderOpen, label: t('runtimes.import.folder'), desc: t('runtimes.import.folder_desc') },
                    ]).map(({ key, icon: Icon, label, desc }) => (
                      <button
                        key={key}
                        type="button"
                        disabled={!!importBusy}
                        onClick={() => doImport(key)}
                        className="w-full flex items-start gap-3 p-3 rounded-xl border border-light-border dark:border-dark-border hover:border-blue-500/50 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors text-left disabled:opacity-50"
                      >
                        {importBusy === key ? (
                          <Loader2 className="w-4 h-4 mt-0.5 text-blue-500 animate-spin shrink-0" />
                        ) : (
                          <Icon className="w-4 h-4 mt-0.5 text-light-subtle dark:text-dark-subtle shrink-0" />
                        )}
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{label}</span>
                          <span className="block text-[11px] text-light-muted dark:text-dark-muted">{desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {importResult && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200/60 dark:border-green-500/20">
                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">
                        {t('runtimes.import.done', { imported: importResult.imported.length, skipped: importResult.skipped.length })}
                      </p>
                      {importResult.imported.length > 0 && (
                        <p className="text-[11px] text-light-muted dark:text-dark-muted mt-0.5">
                          {importResult.imported.map((item) => item.name).join('、')}
                        </p>
                      )}
                      {importResult.skipped.length > 0 && (
                        <p className="text-[11px] text-light-muted dark:text-dark-muted mt-0.5">
                          {t('runtimes.import.skipped_list', { types: importResult.skipped.map((item) => item.type).join('、') })}
                        </p>
                      )}
                    </div>
                  </div>
                  {importResult.imported.length === 0 && importResult.skipped.length > 0 && (
                    <p className="text-[11px] text-light-muted dark:text-dark-muted">{t('runtimes.import.nothing_new')}</p>
                  )}
                </div>
              )}

              {importError && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-500/20">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <CopyableError inline className="min-w-0 flex-1" message={importError} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-light-border dark:border-dark-border">
              <button
                type="button"
                disabled={!!importBusy}
                onClick={() => setImportOpen(false)}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {t('runtimes.import.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
