import { create } from 'zustand';
import { SETTING_LIST, SETTING_UPDATE } from '@/shared/channel-types';
import { SettingKey, Themes } from '@/shared/types';
import i18n from '../i18n/config';

interface SettingState {
  [SettingKey.Language]: string;
  [SettingKey.Theme]: string;
  [SettingKey.RootDirectory]: string;
  loadSetting: () => Promise<void>;
  updateSetting: (key: string, value: string) => Promise<void>;
}
export const useSettingStore = create<SettingState>((set) => ({
  [SettingKey.Language]: 'en',
  [SettingKey.Theme]: Themes.System,
  [SettingKey.RootDirectory]: '',

  loadSetting: async () => {
    const result = await window.electron.invoke(SETTING_LIST);
    if (result.success) {
      const data = (result.data?.settings ?? []).reduce((acc: any, s: any) => {
        acc[s.key] = s.value;
        return acc;
      }, {});
      const language = data.language || 'en';
      const theme = data.theme || Themes.System;
      const rootdir = data.rootdir || '';
      
      i18n.changeLanguage(language);
      applyTheme(theme);
      
      set({ language, theme, rootdir });
    }
  },
  updateSetting: async (key, value) => {
    const result = await window.electron.invoke(SETTING_UPDATE, { key, value });
    if (result.success) {
      set({ [key]: value });
      
      if (key === SettingKey.Theme) applyTheme(value);
      if (key === SettingKey.Language) i18n.changeLanguage(value);
    }
  },
}));

function applyTheme(theme: string) {
  const root = window.document.documentElement;
  if (theme === Themes.Dark) {
    root.classList.add(Themes.Dark);
  } else if (theme === Themes.Light) {
    root.classList.remove(Themes.Dark);
  } else if (theme === Themes.System) {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle(Themes.Dark, isDark);
  }
}

export { SettingKey };
