// Settings page

import { useEffect, useState } from 'react';
import { SettingKey, useSettingStore } from '@/stores/settingStore';
import { useTranslation } from '@/i18n';
import { Themes } from '@/shared/types';
import { SETTING_GET, SETTING_UPDATE, UTIL_OPEN_PATH, UTIL_SELECT_DIRECTORY } from '@/shared/channel-types';
import { Folder, FolderOpen } from 'lucide-react';

const RUNTIME_OPTIONS = ['docker', 'podman', 'conda', 'apptainer'] as const;
const runtimeAutoStartKey = (runtime: string) => `runtime.autoStart.${runtime}`;

const runtimeLabel = (runtime: string) => {
  const label = runtime.charAt(0).toUpperCase() + runtime.slice(1);
  return label === 'Apptainer' ? 'Apptainer' : label;
};

export default function SettingsPage() {
  const { language, theme, rootdir, updateSetting } = useSettingStore();
  const { t } = useTranslation();
  const [rootDirError, setRootDirError] = useState<string | null>(null);
  const [autoStart, setAutoStart] = useState<Record<string, string>>({});
  const [runtimeAutoInstall, setRuntimeAutoInstall] = useState<'ask' | 'always' | 'never'>('ask');
  const [runtimeAutoInstallError, setRuntimeAutoInstallError] = useState<string | null>(null);
  const [shutdownBehavior, setShutdownBehavior] = useState<'ask' | 'always' | 'never'>('always');
  const [shutdownSettingError, setShutdownSettingError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      const values = await Promise.all(
        RUNTIME_OPTIONS.map(async (runtime) => {
          try {
            const result = await window.electron.invoke(SETTING_GET, runtimeAutoStartKey(runtime));
            const value = result?.data?.value;
            return [runtime, value === 'always' || value === 'never' ? value : ''] as const;
          } catch {
            return [runtime, ''] as const;
          }
        })
      );
      if (!disposed) setAutoStart(Object.fromEntries(values));
    };
    load();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const result = await window.electron.invoke(SETTING_GET, SettingKey.RuntimeAutoInstall);
        if (!result.success) throw new Error(result.error ?? t('settings.runtime_autoinstall_failed'));
        const value = result.data?.value;
        if (!disposed) setRuntimeAutoInstall(value === 'always' || value === 'never' ? value : 'ask');
      } catch (error) {
        console.error('Failed to load runtime auto-install preference:', error);
        if (!disposed) setRuntimeAutoInstallError(error instanceof Error ? error.message : String(error));
      }
    };
    load();
    return () => {
      disposed = true;
    };
  }, [t]);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const result = await window.electron.invoke(SETTING_GET, SettingKey.StopRuntimesOnExit);
        if (!result.success) throw new Error(result.error ?? t('settings.shutdown_setting_failed'));
        const savedValue = result.data?.value;
        const value = savedValue === 'ask' || savedValue === 'never' || savedValue === 'false'
          ? savedValue === 'false' ? 'never' : savedValue
          : 'always';
        if (!disposed) setShutdownBehavior(value);
        if (savedValue === 'true' || savedValue === 'false') {
          const migratedValue = savedValue === 'true' ? 'always' : 'never';
          const update = await window.electron.invoke(SETTING_UPDATE, {
            key: SettingKey.StopRuntimesOnExit,
            value: migratedValue,
          });
          if (!update.success) throw new Error(update.error ?? t('settings.shutdown_setting_failed'));
        }
      } catch (error) {
        console.error('Failed to load runtime shutdown setting:', error);
        if (!disposed) setShutdownSettingError(error instanceof Error ? error.message : String(error));
      }
    };
    load();
    return () => {
      disposed = true;
    };
  }, [t]);

  const updateShutdownBehavior = async (value: 'ask' | 'always' | 'never') => {
    const previous = shutdownBehavior;
    setShutdownBehavior(value);
    setShutdownSettingError(null);
    try {
      const result = await window.electron.invoke(SETTING_UPDATE, {
        key: SettingKey.StopRuntimesOnExit,
        value,
      });
      if (!result.success) throw new Error(result.error ?? t('settings.shutdown_setting_failed'));
    } catch (error) {
      console.error('Failed to save runtime shutdown setting:', error);
      setShutdownBehavior(previous);
      setShutdownSettingError(error instanceof Error ? error.message : String(error));
    }
  };

  const updateAutoStart = async (runtime: string, value: string) => {
    setAutoStart((prev) => ({ ...prev, [runtime]: value }));
    await window.electron.invoke(SETTING_UPDATE, { key: runtimeAutoStartKey(runtime), value });
  };

  const updateRuntimeAutoInstall = async (value: 'ask' | 'always' | 'never') => {
    const previous = runtimeAutoInstall;
    setRuntimeAutoInstall(value);
    setRuntimeAutoInstallError(null);
    try {
      const result = await window.electron.invoke(SETTING_UPDATE, { key: SettingKey.RuntimeAutoInstall, value });
      if (!result.success) throw new Error(result.error ?? t('settings.runtime_autoinstall_failed'));
    } catch (error) {
      console.error('Failed to save runtime auto-install preference:', error);
      setRuntimeAutoInstall(previous);
      setRuntimeAutoInstallError(error instanceof Error ? error.message : String(error));
    }
  };

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

        <div className="pt-4 border-t border-light-border dark:border-dark-border">
          <label className="block text-sm font-medium mb-1">{t('settings.runtime_autostart')}</label>
          <p className="text-xs text-light-subtle dark:text-dark-subtle mb-3">
            {t('settings.runtime_autostart_hint')}
          </p>
          <div className="space-y-2">
            {RUNTIME_OPTIONS.map((runtime) => (
              <div key={runtime} className="flex items-center justify-between gap-3">
                <span className="text-sm">{runtimeLabel(runtime)}</span>
                <select
                  value={autoStart[runtime] || ''}
                  onChange={(event) => updateAutoStart(runtime, event.target.value)}
                  className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded px-3 py-1.5 text-sm"
                >
                  <option value="">{t('settings.runtime_ask')}</option>
                  <option value="always">{t('settings.runtime_always')}</option>
                  <option value="never">{t('settings.runtime_never')}</option>
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-light-border dark:border-dark-border">
          <label htmlFor="runtime-auto-install" className="block text-sm font-medium mb-1">
            {t('settings.runtime_autoinstall')}
          </label>
          <p id="runtime-auto-install-hint" className="text-xs text-light-subtle dark:text-dark-subtle mb-3">
            {t('settings.runtime_autoinstall_hint')}
          </p>
          <select
            id="runtime-auto-install"
            value={runtimeAutoInstall}
            onChange={(event) => updateRuntimeAutoInstall(event.target.value as 'ask' | 'always' | 'never')}
            aria-describedby="runtime-auto-install-hint"
            className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded px-3 py-1.5 text-sm"
          >
            <option value="ask">{t('settings.runtime_ask')}</option>
            <option value="always">{t('settings.runtime_install_always')}</option>
            <option value="never">{t('settings.runtime_install_never')}</option>
          </select>
          {runtimeAutoInstallError && (
            <p role="alert" className="mt-2 text-sm text-red-500">{runtimeAutoInstallError}</p>
          )}
        </div>

        <div className="pt-4 border-t border-light-border dark:border-dark-border">
          <label htmlFor="shutdown-behavior" className="block text-sm font-medium mb-1">
            {t('settings.stop_runtimes_on_exit')}
          </label>
          <p id="shutdown-behavior-hint" className="text-xs text-light-subtle dark:text-dark-subtle mb-3">
            {t('settings.stop_runtimes_on_exit_hint')}
          </p>
          <select
            id="shutdown-behavior"
            value={shutdownBehavior}
            onChange={(event) => updateShutdownBehavior(event.target.value as 'ask' | 'always' | 'never')}
            aria-describedby="shutdown-behavior-hint"
            className="bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded px-3 py-1.5 text-sm"
          >
            <option value="ask">{t('settings.shutdown_ask')}</option>
            <option value="always">{t('settings.shutdown_always')}</option>
            <option value="never">{t('settings.shutdown_never')}</option>
          </select>
          {shutdownSettingError && (
            <p role="alert" className="mt-2 text-sm text-red-500">{shutdownSettingError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
