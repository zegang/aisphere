// Settings page

import { useState } from 'react';
import { SettingKey, useSettingStore } from '@/stores/settingStore';
import { useTranslation } from '@/i18n';
import { Themes } from '@/shared/types';
import { UTIL_OPEN_PATH, UTIL_SELECT_DIRECTORY } from '@/shared/channel-types';
import { Folder, FolderOpen } from 'lucide-react';

export default function SettingsPage() {
  const { language, theme, rootdir, updateSetting } = useSettingStore();
  const { t } = useTranslation();
  const [rootDirError, setRootDirError] = useState<string | null>(null);

  const browseRootDirectory = async () => {
    setRootDirError(null);
    const result = await window.electron.invoke(UTIL_SELECT_DIRECTORY, rootdir);
    if (result.success && result.data?.path) {
      await updateSetting(SettingKey.RootDirectory, result.data.path);
    } else if (result.error) {
      setRootDirError(result.error);
    }
  };

  const openRootDirectory = async () => {
    if (!rootdir) return;
    setRootDirError(null);
    const result = await window.electron.invoke(UTIL_OPEN_PATH, rootdir);
    if (!result.success && result.error) {
      setRootDirError(result.error);
    }
  };

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
            <input
              type="text"
              readOnly
              value={rootdir}
              title={rootdir}
              placeholder={t('settings.select_root_directory')}
              className="flex-1 min-w-0 bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded px-3 py-2 truncate text-sm"
            />
            <button
              type="button"
              onClick={browseRootDirectory}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center justify-center gap-1.5 shrink-0"
              title={t('settings.browse')}
            >
              <FolderOpen className="w-4 h-4" />
              {t('settings.browse')}
            </button>
            <button
              type="button"
              onClick={openRootDirectory}
              disabled={!rootdir}
              className="p-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover transition-colors flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('settings.open_directory')}
            >
              <Folder className="w-5 h-5 text-blue-600" />
            </button>
          </div>
          {rootDirError && (
            <p className="mt-1 text-sm text-red-500">{rootDirError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
