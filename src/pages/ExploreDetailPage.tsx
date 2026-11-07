import { useEffect, useState, useRef } from 'react';
import { useExploreStore } from '../stores/exploreStore';
import { useAiSphereStore } from '../stores/aiSphereStore';
import { ArrowLeft, Download, AppWindow, Calendar, Shield, Cpu, Layout, Tag, Folder, Info, Globe, RefreshCw, Terminal as TerminalIcon, X } from 'lucide-react';
import { useTranslation } from '@/i18n';

export default function ExploreDetailPage() {
  const { t } = useTranslation();
  const { applications, selectedAppId, installApplication, installingId } = useExploreStore();
  const setView = useAiSphereStore(s => s.setView);

  const [logs, setLogs] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [logHeight, setLogHeight] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const app = applications.find(a => a.id === selectedAppId);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!logContainerRef.current) return;
      const rect = logContainerRef.current.getBoundingClientRect();
      const newHeight = e.clientY - rect.top;
      if (newHeight > 120 && newHeight < 1200) {
        setLogHeight(newHeight);
      }
    };

    const handleMouseUp = () => setIsResizing(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!app || installingId !== app.id) {
      setDownloadProgress(null);
      return;
    }

    setShowLogs(true);
    setLogs([`Initiating installation for ${app.name}...`]);
    setDownloadProgress(0);

    const logHandler = (data: any) => {
      setLogs(prev => [...prev, String(data)]);
    };

    const progressHandler = (data: any) => {
      setDownloadProgress(data.percentage);
    };

    window.electron.on(`app:install:log:${app.id}`, logHandler);
    window.electron.on(`app:install:progress:${app.id}`, progressHandler);
    return () => {
      window.electron.removeListener(`app:install:log:${app.id}`, logHandler);
      window.electron.removeListener(`app:install:progress:${app.id}`, progressHandler);
    };
  }, [installingId, app?.id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!app) {
    return (
      <div className="p-6">
        <button onClick={() => setView('explore')} className="flex items-center gap-2 text-blue-600 mb-4 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Explore
        </button>
        <div className="bg-light-surface dark:bg-dark-surface rounded-xl p-8 border border-light-border dark:border-dark-border text-center">
          <p className="text-light-subtle dark:text-dark-subtle">Application not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto h-full overflow-y-auto">
      <button onClick={() => setView('explore')} className="flex items-center gap-2 text-light-subtle dark:text-dark-subtle mb-6 hover:text-light-text dark:hover:text-dark-text transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Explore
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-start gap-6">
            {app.icon ? (
              <img src={app.icon} alt="" className="w-24 h-24 rounded-2xl object-contain bg-white shadow-sm border border-light-border dark:border-dark-border p-2" />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                <AppWindow className="w-12 h-12" />
              </div>
            )}
            <div className="flex-1 pt-2">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl font-bold">{app.name}</h2>
                <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold uppercase">
                  {app.category}
                </span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-bold uppercase">
                  {t(`explore.kinds.${app.kind ?? 'app'}`)}
                </span>
              </div>
              <p className="text-light-subtle dark:text-dark-subtle">@{app.org}</p>
              <p className="text-light-subtle dark:text-dark-subtle">{app.description}</p>
            </div>
          </div>

          <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Layout className="w-5 h-5 text-blue-500" /> About</h3>
            <div className="text-sm text-light-subtle dark:text-dark-subtle leading-relaxed whitespace-pre-wrap space-y-4">
              <p><strong>{t('app.type')}:</strong> {t(`app.types.${app.type}`)}</p>
              <p><strong>{t('app.version')}:</strong> {app.version}</p>
              <div><strong>{t('app.packages')}:</strong>
                {app.packages.map((pkg, i) => {
                    return <p>{pkg}</p>
                 })
                }
              </div>
            </div>
          </section>

          <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-green-500" /> Specifications</h3>
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-xs font-bold text-light-subtle dark:text-dark-subtle uppercase mb-1">Architecture</p>
                <p>{app.requirements.cpu}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-light-subtle dark:text-dark-subtle uppercase mb-1">Platform</p>
                <p className="capitalize">{app.requirements.platform}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-light-subtle dark:text-dark-subtle uppercase mb-1">Runtime</p>
                <p className="capitalize">{app.runtime.runtime}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-light-subtle dark:text-dark-subtle uppercase mb-1">Storage</p>
                <p>{app.requirements.storage}</p>
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <button
            onClick={() => {
              if (installingId === app.id) {
                setShowLogs(true);
              } else {
                installApplication(app);
              }
            }}
            disabled={!!app.install?.installed || (!!installingId && installingId !== app.id)}
            className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold transition-all shadow-lg ${
              app.install?.installed
                ? 'bg-green-600/20 text-green-600 dark:text-green-400 cursor-default'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20'
            }`}
          >
            {installingId === app.id ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            {app.install?.installed
              ? t('explore.status.installed')
              : installingId === app.id
                ? downloadProgress !== null && downloadProgress > 0 && downloadProgress < 100 ? `Downloading ${downloadProgress}%` : 'Installing...'
                : t('explore.action.install')}
          </button>

          <section className="bg-light-surface dark:bg-dark-surface rounded-xl p-6 border border-light-border dark:border-dark-border shadow-sm">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4 uppercase tracking-wider text-light-subtle dark:text-dark-subtle">
              <Cpu className="w-4 h-4" /> Requirements
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-light-subtle dark:text-dark-subtle">Memory</p>
                <p className="text-sm font-medium">{app.requirements.memory}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-light-subtle dark:text-dark-subtle">Graphics</p>
                <p className="text-sm font-medium">{app.requirements.gpu}</p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Log Console - Integrated into layout */}
      {showLogs && app && (
        <div
          ref={logContainerRef}
          style={{ height: `${logHeight}px` }}
          className="mt-8 w-full bg-black/90 rounded-xl border border-white/10 shadow-lg flex flex-col relative overflow-hidden animate-in fade-in slide-in-from-top-4"
        >
          {/* Resize handle at the bottom border */}
          <div
            onMouseDown={() => setIsResizing(true)}
            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-blue-500/30 transition-colors z-[60]"
          />

          <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/5 shrink-0">
            <div className="flex items-center gap-2 text-white">
              <TerminalIcon className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Install Progress: {app.name}</span>
            </div>
            {downloadProgress !== null && downloadProgress > 0 && downloadProgress < 100 && (
              <span className="text-[10px] font-mono text-blue-400 mr-4">{downloadProgress}%</span>
            )}
            <button
              onClick={() => setShowLogs(false)}
              className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {downloadProgress !== null && downloadProgress > 0 && downloadProgress < 100 && (
            <div className="h-1 w-full bg-white/5 overflow-hidden shrink-0">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-1 scrollbar-thin scrollbar-thumb-white/10">
            {logs.map((line, i) => (
              <div key={i} className="text-blue-200/80 border-l border-blue-500/30 pl-3">
                <span className="text-blue-500/50 mr-2">{'>'}</span>
                {line}
              </div>
            ))}
            {installingId === app.id && (
              <div className="animate-pulse inline-block w-1.5 h-3.5 bg-blue-500 ml-1" />
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}