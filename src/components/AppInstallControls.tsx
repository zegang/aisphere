import { useState } from 'react';
import { Pause, Play, X, RefreshCw } from 'lucide-react';
import { EXPLORE_INSTALL_CONTROL, type AppInstallControlAction, type AppInstallStatus } from '@/shared/channel-types';
import { useTranslation } from '@/i18n';

interface AppInstallControlsProps {
  appId: string;
  status: AppInstallStatus | undefined;
  onStatusChange?: (status: AppInstallStatus) => void;
  compact?: boolean;
}

export function AppInstallControls({ appId, status, onStatusChange, compact = false }: AppInstallControlsProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!status || !['installing', 'paused', 'aborting'].includes(status)) return null;

  const control = async (action: AppInstallControlAction) => {
    if (action === 'abort' && !window.confirm(t('apps.install.abort_confirm'))) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.electron.invoke(EXPLORE_INSTALL_CONTROL, { appId, action });
      if (!result.success || !result.data) {
        throw new Error(result.error ?? t('apps.install.control_failed'));
      }
      onStatusChange?.(result.data.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const buttonClass = compact
    ? 'inline-flex items-center gap-1 rounded-lg border border-light-border px-2 py-1 text-[11px] font-medium hover:border-blue-500 disabled:opacity-50 dark:border-dark-border'
    : 'inline-flex items-center justify-center gap-2 rounded-lg border border-light-border px-3 py-2 text-sm font-medium hover:border-blue-500 disabled:opacity-50 dark:border-dark-border';
  const iconClass = compact ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'installing' && (
        <button type="button" className={buttonClass} onClick={() => control('pause')} disabled={busy} title={t('apps.install.pause_help')}>
          <Pause className={iconClass} /> {t('apps.install.pause')}
        </button>
      )}
      {status === 'paused' && (
        <button type="button" className={`${buttonClass} border-blue-300 text-blue-700 dark:text-blue-300`} onClick={() => control('resume')} disabled={busy}>
          <Play className={iconClass} /> {t('apps.install.resume')}
        </button>
      )}
      {status === 'aborting' ? (
        <span className="inline-flex items-center gap-1.5 text-xs text-light-subtle dark:text-dark-subtle">
          <RefreshCw className={`${iconClass} animate-spin`} /> {t('apps.install.aborting')}
        </span>
      ) : (
        <button type="button" className={`${buttonClass} text-red-600 dark:text-red-400`} onClick={() => control('abort')} disabled={busy}>
          <X className={iconClass} /> {t('apps.install.abort')}
        </button>
      )}
      {error && <span role="alert" className="basis-full text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
