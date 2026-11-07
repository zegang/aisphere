// Agents tab of the Workspace side panel, styled after VS Code's agent list:
// an emoji avatar, model + skill/tool summary and an edit affordance per agent.

import { useState } from 'react';
import { Plus, Pencil, Trash2, Cpu, Wrench, Sparkles, Check, ScrollText } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { Agent } from '@/types/workspace';
import AgentEditDialog from './AgentEditDialog';

export function AgentsPanel({ modelOptions }: { modelOptions: Array<{ id: string; label: string }> }) {
  const { t } = useTranslation();
  const agents = useWorkspaceStore((s) => s.agents);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const bindWorkspaceAgent = useWorkspaceStore((s) => s.bindWorkspaceAgent);
  const removeAgent = useWorkspaceStore((s) => s.removeAgent);
  const instructions = useWorkspaceStore((s) => s.instructions);
  const setInstructionEnabled = useWorkspaceStore((s) => s.setInstructionEnabled);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const activeAgentId = activeWorkspace?.agentId ?? null;

  const [editing, setEditing] = useState<Agent | 'new' | null>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <p className="text-xs text-light-subtle dark:text-dark-subtle">
          {t('workspace.agents.count', { count: agents.length })}
        </p>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {t('workspace.agents.new')}
        </button>
      </div>

      {/* Global instruction packs (AGENTS.md convention, installed from Explore) */}
      {instructions.length > 0 && (
        <div className="px-3 pb-1 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-light-subtle dark:text-dark-subtle px-1 flex items-center gap-1">
            <ScrollText className="w-3 h-3" /> {t('workspace.instructions.title')}
          </p>
          {instructions.map((pack) => (
            <div
              key={pack.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-amber-200/60 bg-amber-50/50 dark:border-amber-500/20 dark:bg-amber-900/10"
            >
              <span className="text-xs truncate flex-1 font-medium">{pack.name}</span>
              <button
                type="button"
                role="switch"
                aria-checked={pack.enabled}
                aria-label={t('workspace.instructions.toggle', { name: pack.name })}
                onClick={() => setInstructionEnabled(pack.id, !pack.enabled)}
                className={`relative w-8 h-4 rounded-full transition-colors ${pack.enabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-dark-muted'}`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${pack.enabled ? 'left-[18px]' : 'left-0.5'}`}
                />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
        {agents.map((agent) => {
          const active = agent.id === activeAgentId;
          return (
            <div
              key={agent.id}
              className={`p-3 rounded-xl border transition-all group ${
                active
                  ? 'border-blue-500/60 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg hover:border-blue-500/30'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className="w-8 h-8 shrink-0 rounded-lg bg-light-muted dark:bg-dark-muted flex items-center justify-center text-base">
                  {agent.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-semibold truncate">{agent.name}</h4>
                    {agent.builtin && (
                      <span className="shrink-0 px-1.5 py-px text-[9px] font-semibold uppercase rounded-full bg-light-muted dark:bg-dark-muted text-light-subtle dark:text-dark-subtle">
                        {t('workspace.agents.builtin')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-light-subtle dark:text-dark-subtle line-clamp-2 mt-0.5">
                    {agent.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] text-light-subtle dark:text-dark-subtle">
                      <Cpu className="w-3 h-3" />
                      {modelOptions.find((m) => m.id === agent.model)?.label ?? t('workspace.agents.default_model')}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-light-subtle dark:text-dark-subtle">
                      <Sparkles className="w-3 h-3" />
                      {t('workspace.agents.skills_count', { count: agent.skillIds.length })}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-light-subtle dark:text-dark-subtle">
                      <Wrench className="w-3 h-3" />
                      {t('workspace.agents.tools_count', { count: agent.toolIds.length })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    title={t('workspace.agents.edit')}
                    onClick={() => setEditing(agent)}
                    className="p-1.5 rounded-md hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title={t('workspace.agents.delete')}
                    onClick={() => {
                      if (confirm(t('workspace.agents.delete_confirm', { name: agent.name }))) {
                        removeAgent(agent.id);
                      }
                    }}
                    className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => bindWorkspaceAgent(activeWorkspaceId, active ? null : agent.id)}
                className={`mt-2 w-full py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                  active
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted'
                }`}
              >
                {active ? <Check className="w-3.5 h-3.5" /> : null}
                {active ? t('workspace.agents.active_chat') : t('workspace.agents.set_active')}
              </button>
            </div>
          );
        })}
      </div>

      {editing !== null && (
        <AgentEditDialog
          agent={editing === 'new' ? null : editing}
          modelOptions={modelOptions}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default AgentsPanel;
