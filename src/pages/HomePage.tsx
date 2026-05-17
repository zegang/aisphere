// Home page

import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import { RUNTIME_CHECK } from '@/shared/channel-types';
import { useAiSphereStore } from '@/stores/aiSphereStore';
import { RefreshCw, ShieldCheck } from 'lucide-react';

export default function HomePage() {
  const { t } = useTranslation();
  const setView = useAiSphereStore(s => s.setView);

  const {applications, fetchApplications, isLoading} = useAppStore();
  const [installedRuntimesCount, setInstalledRuntimesCount] = useState(0);
  const [runtimesLoading, setRuntimesLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      await fetchApplications();
    };
    loadStats();
  }, []);

  useEffect(() => {
    const checkRuntimes = async () => {
      setRuntimesLoading(true);
      const result = await window.electron.invoke(RUNTIME_CHECK);
      if (result.success && result.data?.runtimes) {
        setInstalledRuntimesCount(result.data.runtimes.filter(r => r.installed).length);
      }
      setRuntimesLoading(false);
    };
    checkRuntimes();
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6 ">{t('settings.welcome')}</h2>
  
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div onClick={() => setView('apps')} className="bg-light-surface dark:bg-dark-surface rounded-lg p-6 border border-light-border dark:border-dark-border cursor-pointer hover:border-blue-500/50 transition-all group">
          <h3 className="text-lg font-semibold mb-2">{t('settings.apps')}</h3>
          <p className="text-3xl font-bold text-blue-600">
            {isLoading ? <RefreshCw className="w-6 h-6 animate-spin" /> : applications.length}
          </p>
          <p className="text-sm text-light-subtle dark:text-dark-subtle mt-1">{t('settings.active_apps')}</p>
        </div>

        <div 
          onClick={() => setView('runtimes')}
          className="bg-light-surface dark:bg-dark-surface rounded-lg p-6 border border-light-border dark:border-dark-border cursor-pointer hover:border-blue-500/50 transition-all group"
        >
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" /> Runtimes
          </h3>
          <p className="text-3xl font-bold text-blue-600">
            {runtimesLoading ? <RefreshCw className="w-6 h-6 animate-spin" /> : installedRuntimesCount}
          </p>
          <p className="text-sm text-light-subtle dark:text-dark-subtle mt-1">Installed container runtimes</p>
        </div>
      </div>

    </div>
  );
}
