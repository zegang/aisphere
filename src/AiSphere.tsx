// App component

import { useEffect, useState } from 'react';
import { useAiSphereStore } from './stores/aiSphereStore';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Info, ChevronsLeft, ChevronsRight } from 'lucide-react';
import HomePage from './pages/HomePage';
import AppsPage from './pages/AppsPage';
import SettingPage from './pages/SettingPage';
import ExplorePage from './pages/ExplorePage';
import './i18n/config';
import { useTranslation } from './i18n';
import { useSettingStore } from './stores/settingStore';
import type { SystemInfoResponse } from '@/types/api';
import { SYSTEM_INFO } from './shared/channel-types';
import AppWorkspace from './pages/AppWorkspace';
import RuntimePage from './pages/RuntimePage';
import RuntimeDetailPage from './pages/RuntimeDetailPage';
import ExploreDetailPage from './pages/ExploreDetailPage';
import NotePage from './pages/NotePage';
import { RuntimeStartDialog } from './components/RuntimeStartDialog';
import appIcon from '@/assets/app-icon.png';

const viewComponents: Record<string, React.ReactNode> = {
  note: <NotePage />,
  home: <HomePage />,
  apps: <AppsPage />,
  explore: <ExplorePage />,
  exploredetail: <ExploreDetailPage />,
  settings: <SettingPage />,
  appworkspace: <AppWorkspace />,
  runtimes: <RuntimePage />,
  runtimedetail: <RuntimeDetailPage />,
};

function AiSphere() {
  const { t } = useTranslation();
  const view = useAiSphereStore((s) => s.view);
  const loadSetting = useSettingStore((s) => s.loadSetting);
  const [systemInfo, setSystemInfo] = useState<SystemInfoResponse | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    loadSetting();
  }, []);

  useEffect(() => {
    const loadSystemInfo = async () => {
      const result = await window.electron.invoke(SYSTEM_INFO);
      if (result.success) {
        setSystemInfo(result.data ?? null);
      }
    };
    loadSystemInfo();
  }, []);

  return (
    <div className="flex h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto">
            {viewComponents[view] || <HomePage />}
          </div>
          <aside className={`relative border-l border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface transition-all duration-300 ${panelOpen ? 'w-80' : 'w-16'}`}>
            <button
              type="button"
              onClick={() => setPanelOpen((prev) => !prev)}
              className="absolute -left-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface shadow-md text-light-subtle hover:text-light-text dark:hover:text-dark-text transition-colors"
              title={panelOpen ? t('systemInfo.collapse') : t('systemInfo.expand')}
            >
              {panelOpen ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
            </button>
            <div className="h-full flex flex-col">
              <div className="flex items-center gap-2 px-4 py-4 border-b border-light-border dark:border-dark-border">
                <Info className="w-5 h-5 text-blue-600" />
                {panelOpen && <h2 className="text-sm font-semibold">{t('systemInfo.title')}</h2>}
              </div>
              <div className={`overflow-auto p-4 ${panelOpen ? '' : 'hidden'}`}>
                {systemInfo ? (
                  <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <span className="font-semibold text-light-subtle dark:text-dark-subtle">{t('systemInfo.platform')}</span>{' '}
                        {systemInfo.platform} / {systemInfo.os_type}
                      </div>
                      <div>
                        <span className="font-semibold text-light-subtle dark:text-dark-subtle">{t('systemInfo.release')}</span>{' '}
                        {systemInfo.release}
                      </div>
                      <div>
                        <span className="font-semibold text-light-subtle dark:text-dark-subtle">{t('systemInfo.arch')}</span>{' '}
                        {systemInfo.arch}
                      </div>
                      <div>
                        <span className="font-semibold text-light-subtle dark:text-dark-subtle">{t('systemInfo.cpus', { count: systemInfo.cpus.length })}</span>
                        <div className="text-[11px] mt-1 opacity-80">{systemInfo.cpus[0]?.model}</div>
                      </div>
                      <div>
                        <span className="font-semibold text-light-subtle dark:text-dark-subtle">{t('systemInfo.gpus')}</span>
                        {systemInfo.gpus.map((gpu, i) => (
                          <div key={i} className="text-[11px] mt-1 opacity-80">• {gpu.model}</div>
                        ))}
                      </div>
                      <div>
                        <span className="font-semibold text-light-subtle dark:text-dark-subtle">{t('systemInfo.storage')}</span>
                        {systemInfo.disks.filter(d => d.size > 0).slice(0, 3).map((disk, i) => (
                          <div key={i} className="text-[11px] mt-1 opacity-80">• {disk.mount}: {((disk.size - disk.free) / 1024 / 1024 / 1024).toFixed(1)}GB / {(disk.size / 1024 / 1024 / 1024).toFixed(1)}GB</div>
                        ))}
                      </div>
                      <div>
                        <span className="font-semibold text-light-subtle dark:text-dark-subtle">{t('systemInfo.memory')}</span>{' '}
                        {systemInfo.memory.total
                          ? t('systemInfo.memory_value', {
                              total: (systemInfo.memory.total / 1024 / 1024 / 1024).toFixed(1),
                              free: (systemInfo.memory.free / 1024 / 1024 / 1024).toFixed(1),
                            })
                          : t('systemInfo.not_available')}
                      </div>
                    </div>
                    <div className="space-y-3 pt-4 border-t border-light-border dark:border-dark-border">
                      <div>
                        <span className="font-semibold text-light-subtle dark:text-dark-subtle">{t('systemInfo.folder')}</span>
                        <div className="mt-1 break-words text-xs text-light-text dark:text-dark-text">{systemInfo.data_path}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-light-subtle dark:text-dark-subtle">{t('systemInfo.loading')}</div>
                )}
                <img src={appIcon} alt="AiSphere" className="mt-8 w-48 h-48 object-contain mx-auto" />
              </div>
            </div>
          </aside>
        </div>
      </div>
      <RuntimeStartDialog />
    </div>
  );
}

export default AiSphere;
