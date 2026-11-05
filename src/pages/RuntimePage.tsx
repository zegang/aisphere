import { useEffect, useRef } from 'react';
import { Box, CheckCircle, XCircle, Download, RefreshCw, Terminal as TerminalIcon, ShieldCheck, StopCircle, X } from 'lucide-react';
import { RUNTIME_INSTALL_INPUT, RUNTIME_INSTALL_RESIZE, type RuntimeInstallStatusEvent, type RuntimeKind } from '@/shared/channel-types';
import {
  RUNTIME_KINDS,
  isRuntimeInstallActive,
  useRuntimeStore,
  type RuntimeCheckStatus,
  type RuntimeLogBuffer,
} from '@/stores/runtimeStore';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface InstallTerminalProps {
  type: RuntimeKind;
  install?: RuntimeInstallStatusEvent;
  log?: RuntimeLogBuffer;
  onAbort: () => void;
  onClose: () => void;
}

function describeInstall(install?: RuntimeInstallStatusEvent): string {
  switch (install?.state) {
    case 'starting':
      return 'Preparing...';
    case 'downloading':
      return typeof install.percent === 'number'
        ? `Downloading ${install.percent}%`
        : 'Downloading...';
    case 'installing':
      return 'Installing...';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'aborted':
      return 'Aborted';
    default:
      return 'Session ended';
  }
}

function formatBytes(bytes?: number): string | undefined {
  if (typeof bytes !== 'number' || bytes <= 0) return undefined;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InstallTerminal({ type, install, log, onAbort, onClose }: InstallTerminalProps) {
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

  const statusText = describeInstall(install);
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
          {active && (
            <button
              onClick={onAbort}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md text-xs font-bold transition-colors"
            >
              <StopCircle className="w-3.5 h-3.5" /> Abort
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
            title="Close"
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
  showProgress,
  onInstall,
  onShowProgress,
}: {
  runtime: RuntimeCheckStatus;
  install?: RuntimeInstallStatusEvent;
  busy: boolean;
  showProgress: boolean;
  onInstall: () => void;
  onShowProgress: () => void;
}) {
  const active = isRuntimeInstallActive(install);
  const statusText = describeInstall(install);
  const total = formatBytes(install?.totalBytes);
  const downloaded = formatBytes(install?.downloadedBytes);

  return (
    <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-6 shadow-sm flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <Box className="w-6 h-6 text-blue-600" />
        </div>
        {runtime.loading ? (
          <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
        ) : runtime.installed ? (
          <div className="flex items-center gap-1 text-green-600 text-xs font-bold uppercase">
            <CheckCircle className="w-4 h-4" /> Installed
          </div>
        ) : (
          <div className="flex items-center gap-1 text-red-500 text-xs font-bold uppercase">
            <XCircle className="w-4 h-4" /> Missing
          </div>
        )}
      </div>

      <h3 className="text-lg font-bold capitalize mb-1">{runtime.type}</h3>
      <p className="text-xs text-light-subtle dark:text-dark-subtle mb-4 flex-1">
        {runtime.type === 'apptainer'
          ? 'High-performance containers for Linux HPC.'
          : runtime.type === 'conda'
          ? 'Package, dependency and environment management for any language.'
          : `Industry standard ${runtime.type} container runtime.`}
      </p>

      {runtime.version && !active && (
        <div className="mb-4 p-2 bg-light-bg dark:bg-dark-bg rounded border border-light-border dark:border-dark-border text-[10px] font-mono truncate">
          {runtime.version}
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

      <button
        disabled={runtime.installed || (!active && busy)}
        onClick={active ? onShowProgress : onInstall}
        className={`w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
          runtime.installed
            ? 'bg-gray-100 text-gray-400 cursor-default'
            : active
            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50'
            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20'
        }`}
      >
        {active ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            {showProgress ? 'Show Terminal' : 'Show Progress'}
          </>
        ) : runtime.installed ? (
          'Ready'
        ) : (
          <><Download className="w-4 h-4" /> Install</>
        )}
      </button>
    </div>
  );
}

export default function RuntimePage() {
  const statuses = useRuntimeStore((state) => state.statuses);
  const installs = useRuntimeStore((state) => state.installs);
  const logs = useRuntimeStore((state) => state.logs);
  const logPanelType = useRuntimeStore((state) => state.logPanelType);
  const checkRuntimes = useRuntimeStore((state) => state.checkRuntimes);
  const syncInstallStatus = useRuntimeStore((state) => state.syncInstallStatus);
  const installRuntime = useRuntimeStore((state) => state.installRuntime);
  const abortInstall = useRuntimeStore((state) => state.abortInstall);
  const openLogPanel = useRuntimeStore((state) => state.openLogPanel);
  const closeLogPanel = useRuntimeStore((state) => state.closeLogPanel);

  useEffect(() => {
    checkRuntimes();
    // Pick up installations that kept running while the page was unmounted.
    syncInstallStatus();
  }, [checkRuntimes, syncInstallStatus]);

  const activeType = RUNTIME_KINDS.find((type) => isRuntimeInstallActive(installs[type]));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-blue-600" />
            Runtime Environments
          </h2>
          <p className="text-light-subtle dark:text-dark-subtle mt-1">
            Manage container runtimes required to execute AI applications on this host.
          </p>
        </div>
        <button
          onClick={checkRuntimes}
          className="p-2 hover:bg-light-muted dark:hover:bg-dark-muted rounded-full transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${statuses.some((status) => status.loading) ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {statuses.map((runtime) => (
          <RuntimeCard
            key={runtime.type}
            runtime={runtime}
            install={installs[runtime.type]}
            busy={!!activeType}
            showProgress={logPanelType === runtime.type}
            onInstall={() => installRuntime(runtime.type)}
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
          onAbort={() => abortInstall(logPanelType)}
          onClose={closeLogPanel}
        />
      )}
    </div>
  );
}
