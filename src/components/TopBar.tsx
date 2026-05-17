// Top bar component

import { useSettingStore } from '@/stores/settingStore';
import { SettingKey, Themes } from '@/shared/types';
import { Sparkles } from 'lucide-react';

export function TopBar() {
  const theme = useSettingStore((s) => s.theme);
  const updateSetting = useSettingStore((s) => s.updateSetting);

  const toggleDarkMode = () => updateSetting(SettingKey.Theme, theme === Themes.Dark ? Themes.Light : Themes.Dark);
  
  return (
    <div className="h-12 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-[10px] font-bold text-light-subtle dark:text-dark-subtle tracking-widest uppercase shrink-0">AiSphere Desktop</h1>
        <p className="text-xs font-extrabold bg-gradient-to-r from-blue-600 via-purple-500 to-indigo-600 bg-clip-text text-transparent flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-blue-500" /> Your Versatile Local AI
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleDarkMode}
          aria-label={theme === Themes.Dark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={theme === Themes.Dark}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover transition-colors"
          title={theme === Themes.Dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === Themes.Dark ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  );
}
