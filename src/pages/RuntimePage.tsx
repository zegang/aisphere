import { useEffect, useState, useRef } from 'react';
import { Box, CheckCircle, XCircle, Download, RefreshCw, Terminal as TerminalIcon, ShieldCheck, StopCircle, Key, Check, X } from 'lucide-react';
import { RUNTIME_CHECK, RUNTIME_INSTALL } from '@/shared/channel-types';

interface RuntimeStatus {
  type: 'docker' | 'podman' | 'apptainer' | 'conda';
  installed: boolean;
  version?: string;
  loading?: boolean;
}

export default function RuntimePage() {
  const [statuses, setStatuses] = useState<RuntimeStatus[]>([
    { type: 'docker', installed: false, loading: true },
    { type: 'podman', installed: false, loading: true },
    { type: 'apptainer', installed: false, loading: true },
    { type: 'conda', installed: false, loading: true },
  ]);
  const [installing, setInstalling] = useState<string | null>(null);
  const [showLogFor, setShowLogFor] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [logHeight, setLogHeight] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [interaction, setInteraction] = useState<{ prompt: string; value: string } | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isResizing) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!logContainerRef.current) return;
      const rect = logContainerRef.current.getBoundingClientRect();
      const newHeight = e.clientY - rect.top;
      if (newHeight > 150 && newHeight < 1200) {
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
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log, interaction]);

  const checkRuntimes = async () => {
    setStatuses(prev => prev.map(s => ({ ...s, loading: true })));
    const result = await window.electron.invoke(RUNTIME_CHECK);
    if (result.success) {
      setStatuses((result.data?.runtimes as RuntimeStatus[]) || []);
    } else {
      setStatuses(prev => prev.map(s => ({ ...s, loading: false })));
      setLog(prev => [...prev, `Error: ${result.error}`]);
    }
  };

  useEffect(() => {
    checkRuntimes();
  }, []);

  const handleInstall = async (type: string) => {
    if (installing === type) {
      setShowLogFor(type);
      return;
    }
    setInstalling(type);
    setShowLogFor(type);
    setLog([`Initiating installation for ${type}...`]);
    
    // Listen for progress logs
    const logHandler = (...args: unknown[]) => {
      setLog(prev => [...prev, String(args[0])]);
    };
    const interactionHandler = (prompt: unknown) => {
      setInteraction({ prompt: String(prompt), value: '' });
    };

    window.electron.on(`runtime:install:log:${type}`, logHandler);
    window.electron.on(`runtime:install:interaction:${type}`, interactionHandler);

    const result = await window.electron.invoke(RUNTIME_INSTALL, type);
    
    window.electron.removeListener(`runtime:install:log:${type}`, logHandler);
    window.electron.removeListener(`runtime:install:interaction:${type}`, interactionHandler);
    setInteraction(null);
    
    if (result.success) {
      checkRuntimes();
      setLog(prev => [...prev, `Installation of ${type} completed successfully.`]);
    } else {
      setLog(prev => [...prev, `Error: ${result.error}`]);
    }
    setInstalling(null);
  };

  const handleAbort = async () => {
    if (!installing) return;
    const type = installing;
    setLog(prev => [...prev, `Sending abort signal for ${type}...`]);
    const result = await window.electron.invoke('runtime:install:abort' as any, type);
    if (result.success) {
      setLog(prev => [...prev, 'Installation aborted by user.']);
      setInstalling(null);
    }
  };

  const submitInteraction = () => {
    if (!interaction || !installing) return;
    window.electron.send(`runtime:install:response:${installing}`, interaction.value);
    setLog(prev => [...prev, `> [Response Sent]`]);
    setInteraction(null);
  };

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
          <RefreshCw className={`w-5 h-5 ${statuses.some(s => s.loading) ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {statuses.map((rt) => (
          <div key={rt.type} className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-xl p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Box className="w-6 h-6 text-blue-600" />
              </div>
              {rt.loading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />
              ) : rt.installed ? (
                <div className="flex items-center gap-1 text-green-600 text-xs font-bold uppercase">
                  <CheckCircle className="w-4 h-4" /> Installed
                </div>
              ) : (
                <div className="flex items-center gap-1 text-red-500 text-xs font-bold uppercase">
                  <XCircle className="w-4 h-4" /> Missing
                </div>
              )}
            </div>
            
            <h3 className="text-lg font-bold capitalize mb-1">{rt.type}</h3>
            <p className="text-xs text-light-subtle dark:text-dark-subtle mb-4 flex-1">
              {rt.type === 'apptainer'
                ? 'High-performance containers for Linux HPC.'
                : rt.type === 'conda'
                ? 'Package, dependency and environment management for any language.'
                : `Industry standard ${rt.type} container runtime.`
              }
            </p>

            {rt.version && (
              <div className="mb-4 p-2 bg-light-bg dark:bg-dark-bg rounded border border-light-border dark:border-dark-border text-[10px] font-mono truncate">
                {rt.version}
              </div>
            )}

            <button
              disabled={rt.installed || (!!installing && installing !== rt.type)}
              onClick={() => handleInstall(rt.type)}
              className={`w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                rt.installed 
                  ? 'bg-gray-100 text-gray-400 cursor-default' 
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20'
              }`}
            >
              {installing === rt.type ? (
                <>
                  {showLogFor === rt.type ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TerminalIcon className="w-4 h-4" />}
                  {showLogFor === rt.type ? 'Installing...' : 'Show Progress'}
                </>
              ) : rt.installed ? (
                'Ready'
              ) : (
                <><Download className="w-4 h-4" /> Install</>
              )}
            </button>
          </div>
        ))}
      </div>

      {showLogFor && (
        <div 
          ref={logContainerRef}
          style={{ height: `${logHeight}px` }}
          className="relative bg-black/90 rounded-xl border border-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-4 transition-all duration-200 flex flex-col"
        >
          <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2 text-white">
              <TerminalIcon className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-bold uppercase tracking-widest">
                {installing ? 'Installing' : 'Installation Log'}: {showLogFor}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {installing && (
                <button
                  onClick={handleAbort}
                  className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md text-xs font-bold transition-colors"
                >
                  <StopCircle className="w-3.5 h-3.5" /> Abort
                </button>
              )}
              <button
                onClick={() => setShowLogFor(null)}
                className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="p-4 font-mono text-xs space-y-1 overflow-y-auto flex-1">
            {log.map((line, i) => (
              <div key={i} className="text-blue-200/80 border-l-2 border-blue-500/30 pl-3 py-0.5">
                <span className="text-blue-500/50 mr-2">{'>'}</span>
                {line}
              </div>
            ))}

            {interaction && (
              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg animate-pulse shadow-lg shadow-blue-500/5">
                <div className="flex items-center gap-2 text-blue-400 mb-2">
                  <Key className="w-4 h-4" />
                  <span className="font-bold uppercase tracking-tighter text-[10px]">Action Required</span>
                </div>
                <div className="text-white text-xs mb-3">{interaction.prompt}</div>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type={interaction.prompt.toLowerCase().includes('password') ? "password" : "text"}
                    value={interaction.value}
                    onChange={(e) => setInteraction({ ...interaction, value: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && submitInteraction()}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Type response here..."
                  />
                  <button
                    onClick={submitInteraction}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors"
                  >
                    <Check className="w-3 h-3" /> Confirm
                  </button>
                </div>
              </div>
            )}

            <div className="animate-pulse inline-block w-2 h-4 bg-blue-500 ml-1" />
            <div ref={logEndRef} />
          </div>

          {/* Resize handle at the bottom */}
          <div
            onMouseDown={() => setIsResizing(true)}
            className="absolute -bottom-1 left-0 right-0 h-2 cursor-ns-resize hover:bg-blue-500/30 transition-colors z-20"
          />
        </div>
      )}
    </div>
  );
}