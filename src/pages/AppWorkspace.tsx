import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useAiSphereStore } from '@/stores/aiSphereStore';
import {
  ArrowLeft, Box, Calendar, Terminal, Play, Square, Trash2, Loader2,
  Shield, Cpu, Layout, Tag, Folder, X, Maximize, Minimize2, Activity, Info,
  Settings, Edit2, Save, AlertCircle, FileText, ExternalLink, Globe
} from 'lucide-react';
import { useTranslation } from '@/i18n';
import { AppInstallControls } from '@/components/AppInstallControls';
import { LifecycleHistory } from '@/components/LifecycleHistory';
import { AppUninstallDialog } from '@/components/AppUninstallDialog';
import type { AppInstallStatus } from '@/shared/channel-types';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import {
  APP_STATUS, TERMINAL_CLOSE, TERMINAL_INIT, TERMINAL_INPUT, TERMINAL_LOGS, TERMINAL_RESIZE, UTIL_OPEN_PATH,
} from '@/shared/channel-types';
import 'xterm/css/xterm.css';

function BottomTerminal({ appId, onClose, type = 'shell' }: { appId: string; onClose: () => void; type?: 'shell' | 'logs' }) {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [height, setHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const DEFAULT_HEIGHT = 300;

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      // Constraints: Min 100px, Max viewport height minus workspace header
      if (newHeight > 100 && newHeight < window.innerHeight - 150) {
        setHeight(newHeight);
        if (isMaximized) setIsMaximized(false);
      }
    };

    const handleMouseUp = () => setIsResizing(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, isMaximized]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      theme: { background: '#1a1b26', foreground: '#a9b1d6' },
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
      scrollback: 10000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const outputId = type === 'shell' ? appId : `${appId}:logs`;
    let disposed = false;

    const outputHandler = (data: any) => term.write(String(data));
    window.electron.on(`terminal:output:${outputId}`, outputHandler);

    if (type === 'shell') {
      term.onData((data) => {
        window.electron.invoke(TERMINAL_INPUT, { id: outputId, data });
      });
    }

    const handleResize = () => {
      fitAddon.fit();
      window.electron.invoke(TERMINAL_RESIZE, {
        id: outputId,
        cols: term.cols,
        rows: term.rows,
      });
    };

    const initialize = async () => {
      try {
        const result = type === 'shell'
          ? await window.electron.invoke(TERMINAL_INIT, appId)
          : await window.electron.invoke(TERMINAL_LOGS, appId);
        if (disposed) {
          await window.electron.invoke(TERMINAL_CLOSE, outputId);
          return;
        }
        if (!result.success) term.write(`\r\n\x1b[31m${result.error || t('apps.workspace.terminal_failed')}\x1b[0m\r\n`);
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : String(error);
          term.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
        }
      }
    };
    void initialize();

    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      window.electron.removeListener(`terminal:output:${outputId}`, outputHandler);
      void window.electron.invoke(TERMINAL_CLOSE, outputId);
      if (fitAddonRef.current === fitAddon) fitAddonRef.current = null;
      if (xtermRef.current === term) xtermRef.current = null;
      term.dispose();
    };
  }, [appId, type, t]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
      const outputId = type === 'shell' ? appId : `${appId}:logs`;
      if (xtermRef.current) {
        void window.electron.invoke(TERMINAL_RESIZE, {
          id: outputId,
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows,
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [appId, height, isMaximized, type]);

  const terminalStyle = {
    height: isMaximized ? '100%' : `${height}px`,
  };

  return (
    <div
      className={`relative flex flex-col bg-[#1a1b26] border border-white/10 shadow-2xl transition-[height] duration-200 ${isMaximized ? 'absolute inset-0 z-40' : 'mx-4 mb-4 rounded-xl overflow-hidden'}`}
      style={terminalStyle}
    >
      {!isMaximized && (
        <div
          onMouseDown={() => setIsResizing(true)}
          className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-blue-500/50 transition-colors z-50"
        />
      )}
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d324a] border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-100">
          {type === 'shell' ? (
            <><Terminal className="w-3.5 h-3.5" /> {t('apps.workspace.interactive_shell')}</>
          ) : (
            <><FileText className="w-3.5 h-3.5" /> {t('apps.workspace.app_logs')}</>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMaximized(true)}
            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-300 hover:text-white"
            title={t('apps.workspace.maximize')}
          >
            <Maximize className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setIsMaximized(false);
              setHeight(DEFAULT_HEIGHT);
            }}
            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-300 hover:text-white"
            title={t('apps.workspace.minimize')}
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition-colors text-gray-300 hover:text-white" title={t('apps.workspace.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div ref={terminalRef} className="flex-1 p-2 overflow-hidden" />
    </div>
  );
}

export default function AppWorkspace() {
  const { t, i18n } = useTranslation();
  const {
    applications,
    selectedId,
    lifecycleResultsByAppId,
    dismissLifecycleResults,
    startApplication,
    stopApplication,
    uninstallApplication,
    openApplicationShell,
    activeTerminalId,
    setActiveTerminalId,
    inspectApplication,
    updateApplication,
    refreshApplicationStatus
  } = useAppStore();
  const setView = useAiSphereStore(s => s.setView);
  const pendingWebUrl = useAiSphereStore(s => s.pendingWebUrl);
  const clearPendingWebUrl = useAiSphereStore(s => s.clearPendingWebUrl);

  const [activeLogId, setActiveLogId] = useState<string | null>(null);
  const [activeWebUrl, setActiveWebUrl] = useState<string | null>(pendingWebUrl);
  const [inspectData, setInspectData] = useState<any>(null);
  const [isEditingRuntime, setIsEditingRuntime] = useState(false);
  const [uninstallConfirmOpen, setUninstallConfirmOpen] = useState(false);
  const [tempRuntime, setTempRuntime] = useState({
    args: '',
    options: '',
    startscript: ''
  });
  const app = applications.find(a => a.id === selectedId);
  const lifecycleResults = app ? lifecycleResultsByAppId[app.id] : undefined;
  const installStatus = app?.install?.status;
  const appStatus = app?.status === 'uninstalling'
    ? 'uninstalling'
    : installStatus && ['installing', 'paused', 'aborting', 'aborted'].includes(installStatus)
      ? installStatus
      : app?.task?.status || 'stopped';

  const updateInstallStatus = (status: AppInstallStatus) => {
    if (!app) return;
    useAppStore.setState((state) => ({
      applications: state.applications.map((item) =>
        item.id === app.id ? { ...item, install: { ...item.install, installed: false, status } } : item
      ),
    }));
  };

  useEffect(() => {
    if (!pendingWebUrl) return;
    setActiveWebUrl(pendingWebUrl);
    clearPendingWebUrl();
  }, [pendingWebUrl, clearPendingWebUrl]);

  useEffect(() => {
    if (app) {
      refreshApplicationStatus(app.id);
      inspectApplication(app.id).then(data => setInspectData(data));
    }
  }, [app?.id, inspectApplication, refreshApplicationStatus]);

  if (!app) {
    return (
      <div className="p-6">
        <button onClick={() => setView('apps')} className="flex items-center gap-2 text-blue-600 mb-4 hover:underline">
          <ArrowLeft className="w-4 h-4" /> {t('apps.workspace.back')}
        </button>
        <div className="bg-light-surface dark:bg-dark-surface rounded-xl p-8 border border-light-border dark:border-dark-border text-center">
          <p className="text-light-subtle dark:text-dark-subtle">{t('apps.workspace.not_found')}</p>
        </div>
      </div>
    );
  }

  const handleUninstall = () => {
    if (appStatus !== 'stopped' && appStatus !== 'failed' && appStatus !== 'unknown') {
      alert(t('apps.workspace.running_tasks'));
      return;
    }
    setUninstallConfirmOpen(true);
  };

  const confirmUninstall = async () => {
    setUninstallConfirmOpen(false);
    if (await uninstallApplication(app.id)) setView('apps');
  };

  const handleSaveRuntime = async () => {
    // Parse space-separated strings into arrays as required by the Application type
    const args = tempRuntime.args.split(' ').filter(Boolean);
    const options = tempRuntime.options.split(' ').filter(Boolean);

    const success = await updateApplication(app.id, {
      runtime: {
        ...app.runtime,
        args,
        options,
        startscript: tempRuntime.startscript
      }
    });
    if (success) {
      setIsEditingRuntime(false);
    }
  };

  return (
    <div className="relative flex flex-col h-full overflow-hidden bg-light-bg dark:bg-dark-bg">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => setView('apps')}
            className="p-2 hover:bg-light-muted dark:hover:bg-dark-muted rounded-full transition-colors shrink-0"
            title={t('apps.workspace.back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 min-w-0">
            {app.icon ? (
              <img src={app.icon} alt="" className="w-10 h-10 rounded-lg object-contain bg-white shrink-0 shadow-sm" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 shrink-0">
                <Box className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-bold truncate leading-tight">{app.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-light-subtle dark:text-dark-subtle font-mono">v{app.version}</span>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                    appStatus === 'running' || appStatus === 'starting'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : appStatus === 'installing' || appStatus === 'aborting'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                      : appStatus === 'failed' || appStatus === 'uninstalling'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-dark-muted dark:text-dark-subtle'
                  }`}
                >
                  {appStatus === 'uninstalling' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {t(`apps.status.${appStatus}`, { defaultValue: appStatus })}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {['installing', 'paused', 'aborting'].includes(installStatus ?? '') && (
            <AppInstallControls
              appId={app.catalogId || app.id}
              status={installStatus}
              onStatusChange={updateInstallStatus}
            />
          )}
          {!['installing', 'paused', 'aborting'].includes(installStatus ?? '') &&
            (appStatus === 'running' || appStatus === 'starting' || appStatus === 'failed' || appStatus === 'stopping') && (
            <button
              onClick={() => stopApplication(app.id)}
              disabled={appStatus === 'stopping'}
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/20 dark:text-orange-400 transition-colors"
            >
              <Square className="w-4 h-4 fill-current" /> {appStatus === 'failed' || appStatus === 'starting' ? t('apps.workspace.abort') : t('app.stop')}
            </button>
          )}

          {!['installing', 'paused', 'aborting'].includes(installStatus ?? '') &&
            app.install?.installed !== false &&
            (appStatus === 'stopped' || appStatus === 'failed' || appStatus === 'stopping' || appStatus === 'starting') && (
            <button
              onClick={() => startApplication(app.id)}
              disabled={appStatus === 'stopping' || appStatus === 'starting'}
              className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Play className="w-4 h-4 fill-current" /> {appStatus === 'failed' ? t('app.restart') : t('app.start')}
            </button>
          )}
          <button
            onClick={handleUninstall}
            disabled={['installing', 'paused', 'aborting'].includes(installStatus ?? '') || appStatus === 'uninstalling'}
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {appStatus === 'uninstalling' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {appStatus === 'uninstalling' ? t('apps.status.uninstalling') : t('app.uninstall')}
          </button>
        </div>
      </div>

      {uninstallConfirmOpen && (
        <AppUninstallDialog
          appName={app.name}
          onCancel={() => setUninstallConfirmOpen(false)}
          onConfirm={() => void confirmUninstall()}
        />
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <LifecycleHistory ownerType="app" ownerId={app.id} />
          {app.error && (
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-xl p-4 flex items-start gap-3 text-red-700 dark:text-red-400 animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-bold text-sm">{t('apps.workspace.operation_error')}</h4>
                <p className="text-xs mt-1 opacity-90 leading-relaxed font-mono break-all">{app.error}</p>
              </div>
              <button
                onClick={() => updateApplication(app.id, { error: undefined })}
                className="p-1 hover:bg-red-200/50 dark:hover:bg-red-800/30 rounded transition-colors"
                title={t('apps.workspace.dismiss')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {lifecycleResults && (
            <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-900/20">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                    {t('apps.workspace.lifecycle_actions')}
                  </h4>
                  <div className="mt-2 space-y-2">
                    {lifecycleResults.map((result) => (
                      <div key={result.id}>
                        <span className={`mr-2 text-xs font-semibold uppercase ${
                          result.status === 'failed'
                            ? 'text-red-600 dark:text-red-400'
                            : result.status === 'skipped'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-green-700 dark:text-green-400'
                        }`}>
                          {t(`apps.workspace.lifecycle_status.${result.status}`)}
                        </span>
                        <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs text-light-text dark:text-dark-text">
                          {result.message}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismissLifecycleResults(app.id)}
                  className="shrink-0 rounded p-1 text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900/40"
                  title={t('apps.workspace.dismiss')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              {/* About Section */}
              <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Layout className="w-5 h-5 text-blue-500" /> {t('apps.workspace.about')}
                </h3>
                <p className="text-sm text-light-subtle dark:text-dark-subtle leading-relaxed whitespace-pre-wrap">
                  {app.description || t('apps.no_description')}
                </p>
              </section>

              {/* Active Processes Section */}
              {app.task && (
                <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm overflow-hidden relative">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 blur-3xl rounded-full -mr-16 -mt-16" />
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-orange-500" /> {t('apps.workspace.active_processes')}
                  </h3>
                  <div className="space-y-3">
                    <div key={app.task.id || 'starting'} className="relative overflow-hidden flex flex-col p-4 bg-light-bg/50 dark:bg-dark-bg/50 backdrop-blur-sm rounded-xl border border-light-border dark:border-dark-border group hover:border-orange-500/30 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div className="p-2.5 bg-white dark:bg-dark-muted rounded-xl shadow-sm border border-light-border dark:border-dark-border">
                              <Cpu className="w-5 h-5 text-blue-500" />
                            </div>
                            {app.task.status === 'running' && (
                              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-mono font-bold text-light-default dark:text-dark-default">
                                ID: {app.task.id?.split('-')[0] || '...'}
                              </p>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold uppercase">
                                {app.task.rc}
                              </span>
                            </div>
                            <p className="text-[10px] text-light-subtle dark:text-dark-subtle font-medium mt-0.5">
                              {t('apps.workspace.runtime_instance', { rc: app.task.rc })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-xs font-bold px-3 py-1 rounded-lg inline-flex items-center gap-2 ${
                            app.task.status === 'running'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${app.task.status === 'running' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                            {t(`apps.status.${app.task.status}`, { defaultValue: app.task.status })}
                          </div>
                        </div>
                      </div>

                      {app.task.status === 'running' && (
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-light-border dark:border-dark-border">
                          <button
                            onClick={() => {
                              setActiveLogId(null);
                              setActiveTerminalId(app.id);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 transition-colors uppercase tracking-tight"
                          >
                            <Terminal className="w-3.5 h-3.5" /> {t('apps.workspace.console')}
                          </button>
                          <button
                            onClick={() => openApplicationShell(app.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 transition-colors uppercase tracking-tight"
                          >
                            <Terminal className="w-3.5 h-3.5" /> {t('apps.workspace.shell')}
                          </button>
                          <button
                            onClick={() => {
                              setActiveTerminalId(null);
                              setActiveLogId(app.id);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 transition-colors uppercase tracking-tight"
                          >
                            <FileText className="w-3.5 h-3.5" /> {t('apps.workspace.logs')}
                          </button>
                          {app.task?.hostPorts && Object.entries(app.task.hostPorts).map(([_innerPort, hostPort]) => (
                            <button
                              key={hostPort}
                              onClick={() => setActiveWebUrl(`http://localhost:${hostPort}`)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 transition-colors uppercase tracking-tight"
                              title={t('apps.workspace.open_url', { url: `http://localhost:${hostPort}` })}
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> {t('apps.workspace.web')}:{hostPort}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Runtime Configuration Panel */}
              <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Settings className="w-5 h-5 text-gray-500" /> {t('apps.workspace.runtime_config')}
                  </h3>
                  {!isEditingRuntime ? (
                    <button
                      onClick={() => {
                        setIsEditingRuntime(true);
                        setTempRuntime({
                          options: app.runtime.options?.join(' ') || '',
                          startscript: app.runtime.startscript || '',
                          args: app.runtime.args?.join(' ') || ''
                        });
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" /> {t('apps.workspace.edit')}
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveRuntime}
                        className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" /> {t('apps.workspace.save')}
                      </button>
                      <button
                        onClick={() => setIsEditingRuntime(false)}
                        className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> {t('apps.workspace.cancel')}
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-light-subtle dark:text-dark-subtle mb-1">{t('apps.workspace.runtime_type')}</h4>
                      <p className="text-sm font-medium capitalize">{app.runtime.runtime}</p>
                    </div>
                  </div>

                  {/* Options */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-light-subtle dark:text-dark-subtle mb-2">{t('apps.workspace.runtime_options')}</h4>
                    {isEditingRuntime ? (
                      <input
                        type="text"
                        value={tempRuntime.options}
                        onChange={(e) => setTempRuntime({...tempRuntime, options: e.target.value})}
                        className="w-full px-3 py-2 text-sm bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                        placeholder={t('apps.workspace.runtime_options_placeholder')}
                      />
                    ) : (
                      <div className="p-3 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border">
                        {app.runtime.options && app.runtime.options.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {app.runtime.options.map((opt, i) => (
                              <code key={i} className="text-xs font-mono bg-light-surface dark:bg-dark-surface px-1.5 py-0.5 rounded border border-light-border dark:border-dark-border">
                                {opt}
                              </code>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-light-subtle dark:text-dark-subtle italic">{t('apps.workspace.no_runtime_options')}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Start Script */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-light-subtle dark:text-dark-subtle mb-2">{t('apps.workspace.start_script')}</h4>
                    {isEditingRuntime ? (
                      <input
                        type="text"
                        value={tempRuntime.startscript}
                        onChange={(e) => setTempRuntime({...tempRuntime, startscript: e.target.value})}
                        className="w-full px-3 py-2 text-sm bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                        placeholder={t('apps.workspace.start_script_placeholder')}
                      />
                    ) : (
                      <div className="p-3 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border">
                        {app.runtime.startscript ? (
                          <code className="text-xs font-mono">{app.runtime.startscript}</code>
                        ) : (
                          <span className="text-xs text-light-subtle dark:text-dark-subtle italic">{t('apps.workspace.no_start_script')}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Arguments */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-light-subtle dark:text-dark-subtle mb-2">{t('apps.workspace.default_args')}</h4>
                    {isEditingRuntime ? (
                      <input
                        type="text"
                        value={tempRuntime.args}
                        onChange={(e) => setTempRuntime({...tempRuntime, args: e.target.value})}
                        className="w-full px-3 py-2 text-sm bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                        placeholder={t('apps.workspace.default_args_placeholder')}
                      />
                    ) : (
                      <div className="p-3 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border">
                        {app.runtime.args && app.runtime.args.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {app.runtime.args.map((arg, i) => (
                              <code key={i} className="text-xs font-mono bg-light-surface dark:bg-dark-surface px-1.5 py-0.5 rounded border border-light-border dark:border-dark-border">
                                {arg}
                              </code>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-light-subtle dark:text-dark-subtle italic">{t('apps.workspace.no_default_args')}</span>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </section>

              {/* Image Metadata Section (Inspect) */}
              {inspectData && (
                <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Info className="w-5 h-5 text-blue-500" /> {t('apps.workspace.image_metadata')}
                  </h3>
                  <div className="space-y-4">
                    {inspectData.data?.attributes?.labels && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-light-subtle dark:text-dark-subtle mb-2">{t('apps.workspace.internal_labels')}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {Object.entries(inspectData.data.attributes.labels).map(([key, value]) => (
                            <div key={key} className="flex flex-col p-2 bg-light-bg dark:bg-dark-bg rounded border border-light-border dark:border-dark-border overflow-hidden">
                              <span className="text-[10px] text-light-subtle dark:text-dark-subtle font-mono truncate">{key}</span>
                              <span className="text-xs font-medium truncate">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {inspectData.data?.attributes?.deffile && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-light-subtle dark:text-dark-subtle mb-1">{t('apps.workspace.definition_file')}</h4>
                        <pre className="text-[10px] font-mono p-3 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border block max-h-40 overflow-y-auto whitespace-pre-wrap">
                          {inspectData.data.attributes.deffile}
                        </pre>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-green-500" /> {t('apps.workspace.technical_specs')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-light-subtle dark:text-dark-subtle mb-1">{t('apps.workspace.architecture')}</h4>
                      <p className="text-sm font-medium uppercase">{app.requirements.cpu}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-light-subtle dark:text-dark-subtle mb-1">{t('apps.workspace.platform')}</h4>
                      <p className="text-sm font-medium capitalize">{app.requirements.platform}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-light-subtle dark:text-dark-subtle mb-1">{t('apps.workspace.storage')}</h4>
                      <p className="text-sm font-medium">{app.requirements.storage}</p>
                    </div>
                  </div>
                </div>
              </section>

            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
                <h3 className="text-lg font-semibold mb-4">{t('apps.workspace.metadata')}</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-light-border dark:border-dark-border">
                    <span className="text-sm text-light-subtle dark:text-dark-subtle">{t('apps.workspace.category')}</span>
                    <span className="text-sm font-medium">{app.category}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-light-border dark:border-dark-border">
                    <span className="text-sm text-light-subtle dark:text-dark-subtle">{t('apps.workspace.type')}</span>
                    <span className="text-sm font-medium capitalize">{app.type}</span>
                  </div>
                  {app.install?.installed_at && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-light-subtle dark:text-dark-subtle">{t('apps.workspace.installed_on')}</span>
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
                        <span>{new Date(app.install.installed_at).toLocaleDateString(i18n.language)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Cpu className="w-5 h-5 text-purple-500" /> {t('apps.workspace.hardware')}</h3>
                <div className="grid grid-cols-1 gap-4">
                  <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border">
                    <h4 className="text-xs font-bold text-light-subtle dark:text-dark-subtle mb-1">{t('apps.workspace.memory')}</h4>
                    <p className="text-sm font-medium">{app.requirements.memory}</p>
                  </div>
                  <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border">
                    <h4 className="text-xs font-bold text-light-subtle dark:text-dark-subtle mb-1">{t('apps.workspace.gpu')}</h4>
                    <p className="text-sm font-medium">{app.requirements.gpu}</p>
                  </div>
                </div>
              </section>

              <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Tag className="w-5 h-5" /> {t('apps.workspace.labels')}</h3>
                <div className="flex flex-wrap gap-2">
                  {app.labels.map((label, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 text-xs font-medium rounded rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-100 dark:border-blue-800/30"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </section>

              {app.install?.installed_package && (
                <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><Folder className="w-5 h-5 text-orange-500" /> {t('apps.workspace.location')}</h3>
                  <p className="text-xs text-light-subtle dark:text-dark-subtle mb-3 leading-relaxed">{t('apps.workspace.local_path')}</p>
                  <code className="text-[10px] font-mono p-3 bg-light-bg dark:bg-dark-bg rounded-lg border border-light-border dark:border-dark-border block break-all text-blue-600 dark:text-blue-400">
                    {app.install.installed_package}
                  </code>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeTerminalId && (
        <BottomTerminal appId={activeTerminalId} onClose={() => setActiveTerminalId(null)} />
      )}
      {activeLogId && (
        <BottomTerminal appId={activeLogId} type="logs" onClose={() => setActiveLogId(null)} />
      )}

      {/* Internal Web View Overlay */}
      {activeWebUrl && (
        <div className="absolute inset-0 z-30 flex flex-col bg-light-bg dark:bg-dark-bg animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between px-4 py-2 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border shrink-0 shadow-sm">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded">
                <Globe className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs font-mono font-medium text-light-subtle dark:text-dark-subtle truncate max-w-md">
                {activeWebUrl}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => window.electron.invoke(UTIL_OPEN_PATH as any, activeWebUrl)}
                className="p-1.5 hover:bg-light-muted dark:hover:bg-dark-muted rounded text-light-subtle dark:text-dark-subtle transition-colors"
                title={t('apps.workspace.open_external')}
              >
                <ExternalLink className="w-4 h-4" />
              </button>
              <button onClick={() => setActiveWebUrl(null)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 rounded transition-colors text-light-subtle dark:text-dark-subtle">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <iframe
            src={activeWebUrl}
            className="flex-1 w-full h-full border-none bg-white"
            title={t('apps.workspace.web_interface')}
          />
        </div>
      )}
    </div>
  );
}