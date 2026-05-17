// App store page

import { useEffect, useState } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useAiSphereStore } from '@/stores/aiSphereStore';
import { Box, RefreshCw, Calendar, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/i18n';

export default function AppsPage() {
  const { t } = useTranslation();
  const { 
    applications, 
    isLoading, 
    fetchApplications, 
  } = useAppStore();
  const openWorkspace = useAiSphereStore(s => s.openWorkspace);

  useEffect(() => {
    fetchApplications();
  }, []);

  if (isLoading && applications.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-light-subtle dark:text-dark-subtle">
        <RefreshCw className="w-8 h-8 animate-spin mb-4" />
        <p>Loading installed apps...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Box className="w-6 h-6 text-blue-600" />
          My Apps
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
            <p className="text-light-subtle dark:text-dark-subtle">No applications installed yet.</p>
          </div>
        ) : (
          applications.map((app) => (
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
                        <span>{new Date(app.install.installed_at).toLocaleDateString()}</span>
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
                    (app.task?.status || 'stopped') === 'running' || (app.task?.status || 'stopped') === 'starting'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : app.task?.status === 'failed' || app.task?.status === 'uninstalling'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-dark-muted dark:text-dark-subtle'
                  }`}
                >
                  {app.task?.status || 'stopped'}
                </span>
              </div>
              <p className="text-sm text-light-subtle dark:text-dark-subtle mb-2 line-clamp-2 flex-1 group-hover:text-light-default dark:group-hover:text-dark-default transition-colors">
                {app.description || 'No description provided.'}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
