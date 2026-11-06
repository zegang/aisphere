// App store page

import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useAiSphereStore } from '@/stores/aiSphereStore';
import { Box, RefreshCw, Calendar, Play, Square, Globe, Eye } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { UTIL_OPEN_PATH } from '@/shared/channel-types';

export default function AppsPage() {
  const { t, i18n } = useTranslation();
  const {
    applications,
    isLoading,
    fetchApplications,
    startApplication,
    stopApplication,
    refreshApplicationStatus,
  } = useAppStore();
  const openWorkspace = useAiSphereStore(s => s.openWorkspace);

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

  const openWebUi = (url: string) => {
    window.electron.invoke(UTIL_OPEN_PATH as any, url);
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
        </h2>
        <button 
          onClick={() => fetchApplications()}
          className="p-2 hover:bg-light-muted dark:hover:bg-dark-muted rounded-full transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">

        {applications.length === 0 ? (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-light-border dark:border-dark-border rounded-xl">
            <p className="text-light-subtle dark:text-dark-subtle">{t('apps.empty')}</p>
          </div>
        ) : (
          applications.map((app) => {
            const status = app.task?.status || 'stopped';
            const busy = status === 'starting' || status === 'stopping';
            const running = status === 'running';
            const hostPort = app.task?.hostPorts
              ? (app.task.hostPorts['8080'] || Object.values(app.task.hostPorts)[0])
              : undefined;
            const webUrl = running && hostPort ? `http://localhost:${hostPort}` : undefined;

            return (
              <div
                key={app.id}
                onClick={() => openWorkspace(app.id)}
                className="relative bg-light-surface dark:bg-dark-surface rounded-xl p-5 border border-light-border dark:border-dark-border flex flex-col shadow-sm hover:shadow-md transition-all cursor-pointer hover:border-blue-500/50 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {app.icon ? (
                      <img src={app.icon} alt="" className="w-10 h-10 rounded-lg object-contain" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                        <Box className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold leading-tight">{app.name}</h3>
                      <p className="text-xs text-light-subtle dark:text-dark-subtle">v{app.version}</p>
                      {app.install?.installed_at && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] text-light-subtle dark:text-dark-subtle" title={t('explore.label.installed_at')}>
                          <Calendar className="w-3 h-3 text-blue-500" />
                          <span>{new Date(app.install.installed_at).toLocaleDateString(i18n.language)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {app.task?.status === 'uninstalling' && (
                    <div className="absolute top-4 right-4">
                      <RefreshCw className="w-4 h-4 animate-spin text-red-500" />
                    </div>
                  )}
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      running || status === 'starting'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : status === 'failed' || status === 'uninstalling'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-dark-muted dark:text-dark-subtle'
                    }`}
                  >
                    {t(`apps.status.${status}`, { defaultValue: status })}
                  </span>
                </div>
                <p className="text-sm text-light-subtle dark:text-dark-subtle mb-4 line-clamp-2 flex-1 group-hover:text-light-default dark:group-hover:text-dark-default transition-colors">
                  {app.description || t('apps.no_description')}
                </p>

                {app.error && (
                  <p className="mb-3 text-xs text-red-500 dark:text-red-400 line-clamp-2 break-words" title={app.error}>
                    {app.error}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-light-border dark:border-dark-border">
                  {running || status === 'starting' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        stopApplication(app.id);
                      }}
                      disabled={busy}
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
                      disabled={busy}
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
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" /> {t('apps.action.view')}
                  </button>

                  {webUrl && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openWebUi(webUrl);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 transition-colors"
                      title={t('apps.action.open_url', { url: webUrl })}
                    >
                      <Globe className="w-3.5 h-3.5" /> {t('apps.action.web_ui')}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
