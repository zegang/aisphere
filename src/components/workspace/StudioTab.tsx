// Studio tab: installed hooks (workspace lifecycle automation) and the saved
// notes / report generation carried over from the original Notes workspace.

import { Sparkles, Plus, Edit3, Zap } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const eventTone: Record<string, string> = {
  'session-start': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'message-send': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'assistant-reply': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'tool-call': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
};

export function StudioTab() {
  const { t } = useTranslation();
  const hooks = useWorkspaceStore((s) => s.hooks);
  const setHookEnabled = useWorkspaceStore((s) => s.setHookEnabled);

  return (
    <div className="flex flex-col h-full">
      {/* Hooks installed from Explore (Claude Code hooks convention) */}
      {hooks.length > 0 && (
        <div className="p-3 border-b border-light-border dark:border-dark-border">
          <h2 className="font-bold flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-orange-500" /> {t('workspace.hooks.title')}
          </h2>
          <div className="space-y-1">
            {hooks.map((hook) => (
              <div
                key={hook.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-colors ${
                  hook.enabled
                    ? 'border-orange-300/50 bg-orange-50/50 dark:bg-orange-900/10'
                    : 'border-light-border dark:border-dark-border opacity-70'
                }`}
                title={hook.description}
              >
                <span
                  className={`shrink-0 px-1.5 py-px text-[9px] font-semibold uppercase rounded-full ${
                    eventTone[hook.event] ?? 'bg-light-muted dark:bg-dark-muted'
                  }`}
                >
                  {t(`workspace.hooks.event.${hook.event}`)}
                </span>
                <span className="text-xs truncate flex-1 font-medium">{hook.name}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hook.enabled}
                  aria-label={t('workspace.hooks.toggle', { name: hook.name })}
                  onClick={() => setHookEnabled(hook.id, !hook.enabled)}
                  className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${hook.enabled ? 'bg-orange-500' : 'bg-gray-300 dark:bg-dark-muted'}`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${hook.enabled ? 'left-[18px]' : 'left-0.5'}`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-3">
        <h2 className="font-bold flex items-center gap-2">
          <Edit3 className="w-4 h-4 text-purple-500" /> {t('workspace.studio')}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-xl border border-light-border dark:border-dark-border shadow-sm group hover:border-purple-500/30 transition-all cursor-pointer">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-purple-600 uppercase tracking-tighter">{t('workspace.new_note')}</span>
            <span className="text-[10px] text-light-muted dark:text-dark-muted">{t('workspace.just_now')}</span>
          </div>
          <h3 className="text-sm font-semibold mb-1">{t('workspace.summary_title')}</h3>
          <p className="text-xs text-light-muted dark:text-dark-muted line-clamp-3">
            {t('workspace.summary_body')}
          </p>
        </div>

        <div className="p-4 bg-light-bg dark:bg-dark-bg rounded-xl border border-light-border dark:border-dark-border shadow-sm opacity-60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-light-muted dark:text-dark-muted uppercase tracking-tighter">{t('workspace.draft')}</span>
            <span className="text-[10px] text-light-muted dark:text-dark-muted">{t('workspace.two_hours_ago')}</span>
          </div>
          <h3 className="text-sm font-semibold mb-1">{t('workspace.architecture_title')}</h3>
          <p className="text-xs text-light-muted dark:text-dark-muted line-clamp-3">
            {t('workspace.architecture_body')}
          </p>
        </div>

        <button className="w-full py-3 border-2 border-dashed border-light-border dark:border-dark-border rounded-xl text-xs text-light-muted dark:text-dark-muted hover:text-blue-600 hover:border-blue-500/50 transition-all flex flex-col items-center gap-1">
          <Plus className="w-4 h-4" />
          {t('workspace.create_note')}
        </button>
      </div>

      <div className="p-3 border-t border-light-border dark:border-dark-border">
        <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Sparkles className="w-4 h-4" /> {t('workspace.generate_report')}
        </button>
      </div>
    </div>
  );
}

export default StudioTab;
