// Sidebar component

import { useState } from 'react';
import { Layers, Box, Home, AppWindow, Search, Settings, User, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useAiSphereStore, AiSphereView } from '@/stores/aiSphereStore';

export function Sidebar() {
  const { t } = useTranslation();
  const currentView = useAiSphereStore((s) => s.view);
  const setView = useAiSphereStore((s) => s.setView);
  const [expanded, setExpanded] = useState(true);

  const navItems: Array<{ icon: any; label: string; view: AiSphereView }> = [
    { icon: Home, label: t('sidebar.home'), view: 'home' },
    { icon: Layers, label: t('sidebar.workspace'), view: 'workspace' },
    { icon: AppWindow, label: t('sidebar.apps'), view: 'apps' },
    { icon: Search, label: t('sidebar.explore'), view: 'explore' },
    { icon: Box, label: t('sidebar.runtimes'), view: 'runtimes' }
  ];

  return (
    <div
      className={`h-screen bg-light-surface dark:bg-dark-surface border-r border-light-border dark:border-dark-border flex flex-col justify-between transition-all duration-300 ${
        expanded ? 'w-52' : 'w-16'
      }`}
    >
      <div className="flex flex-col gap-4 py-4 px-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            {expanded && (
              <span className="font-bold text-lg tracking-tight">
                <span className="text-blue-600 dark:text-blue-400">A</span>i<span className="text-indigo-600 dark:text-indigo-400">S</span>phere
              </span>
            )}
          </div>
          <button
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-light-subtle hover:text-light-text hover:bg-light-surface-hover dark:text-dark-subtle dark:hover:text-dark-text dark:hover:bg-dark-surface-hover transition-colors"
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {expanded ? <ChevronsLeft className="w-5 h-5" /> : <ChevronsRight className="w-5 h-5" />}
          </button>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          {navItems.map((item) => {
            const active = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => setView(item.view)}
                className={`relative w-full rounded-lg flex items-center gap-3 px-3 py-2 transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-light-subtle hover:text-light-text hover:bg-light-surface-hover dark:text-dark-subtle dark:hover:text-dark-text dark:hover:bg-dark-surface-hover'
                }`}
                aria-current={active ? 'page' : undefined}
                title={!expanded ? item.label : undefined}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {expanded && <span className="text-sm font-medium truncate">{item.label}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 pb-4 px-2">
        <button
          onClick={() => setView('settings')}
          className={`w-full rounded-lg flex items-center gap-3 px-3 py-2 transition-colors ${
            currentView === 'settings'
              ? 'bg-blue-600 text-white'
              : 'text-light-subtle hover:text-light-text hover:bg-light-surface-hover dark:text-dark-subtle dark:hover:text-dark-text dark:hover:bg-dark-surface-hover'
          }`}
          aria-current={currentView === 'settings' ? 'page' : undefined}
        >
          <Settings className="w-5 h-5" />
          {expanded && <span className="text-sm font-medium">{t('sidebar.settings')}</span>}
        </button>

        <button
          type="button"
          aria-label="Login / Guest"
          className="w-full rounded-lg flex items-center gap-3 px-3 py-2 text-light-subtle hover:text-light-text hover:bg-light-surface-hover dark:text-dark-subtle dark:hover:text-dark-text dark:hover:bg-dark-surface-hover transition-colors"
          disabled
        >
          <User className="w-5 h-5" />
          {expanded && <span className="text-sm font-medium">{t('sidebar.login_guest')}</span>}
        </button>
      </div>
    </div>
  );
}
