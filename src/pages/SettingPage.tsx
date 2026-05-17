// Settings page

import { SettingKey, useSettingStore } from '@/stores/settingStore';
import { useTranslation } from '@/i18n';
import { Themes } from '@/shared/types';
import { Folder } from 'lucide-react';

export default function SettingsPage() {
  const { language, theme, rootdir, updateSetting } = useSettingStore();
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">{t('settings.title')}</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">{t('settings.language')}</label>
          <select
            value={language}
            onChange={(e) => updateSetting(SettingKey.Language, e.target.value)}
            className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded px-3 py-2"
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('settings.theme')}</label>
          <select
            value={theme}
            onChange={(e) => updateSetting(SettingKey.Theme, e.target.value)}
            className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded px-3 py-2"
          >
            <option value={Themes.Light}>{t('settings.light')}</option>
            <option value={Themes.Dark}>{t('settings.dark')}</option>
            <option value={Themes.System}>{t('settings.system')}</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('settings.root_directory')}</label>
          <div className="flex gap-2">
            <div className="flex-1 bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded px-3 py-2 truncate text-sm">
              {rootdir}
            </div>
            <a
              href={`file://${rootdir}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover transition-colors flex items-center justify-center shrink-0"
              title="Open Directory"
            >
              <Folder className="w-5 h-5 text-blue-600" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
