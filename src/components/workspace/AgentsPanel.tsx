// Agent tab of the workspace side panel. A workspace starts with no agent
// attached; the empty state and the Browse button open a catalog of every
// installed agent so the user can pick the one this workspace should use.

import { useState } from 'react';
import { Plus, Pencil, X, Cpu, Wrench, Sparkles, Check, ScrollText, Bot, UserPlus } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { Agent } from '@/types/workspace';
import AgentEditDialog from './AgentEditDialog';
import ComponentPickerDialog from './ComponentPickerDialog';
import PanelEmptyState from './PanelEmptyState';

export function AgentsPanel({ modelOptions }: { modelOptions: Array<{ id: string; label: string }> }) {
  const { t } = useTranslation();
  const agents = useWorkspaceStore((s) => s.agents);
  const servers = useWorkspaceStore((s) => s.servers);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const bindWorkspaceAgent = useWorkspaceStore((s) => s.bindWorkspaceAgent);
  const instructions = useWorkspaceStore((s) => s.instructions);
  const setInstructionEnabled = useWorkspaceStore((s) => s.setInstructionEnabled);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const activeAgent = agents.find((agent) => agent.id === activeWorkspace?.agentId) ?? null;
  const attachedToolCount = servers
    .filter((server) => (activeWorkspace?.serverIds ?? []).includes(server.id))
    .reduce((total, server) => total + server.tools.length, 0);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | 'new' | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="text-xs text-light-subtle dark:text-dark-subtle">
          {t('workspace.panels.attached_count', { count: activeAgent ? 1 : 0 })}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing('new')}
            title={t('workspace.agents.new')}
            aria-label={t('workspace.agents.new')}
            className="rounded-lg border border-light-border p-1.5 text-light-subtle transition-colors hover:bg-light-muted hover:text-light-text dark:border-dark-border dark:text-dark-subtle dark:hover:bg-dark-muted dark:hover:text-dark-text"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> {t('workspace.panels.browse')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {!activeAgent ? (
          <PanelEmptyState
            icon={<Bot className="h-5 w-5 text-blue-600" />}
            title={t('workspace.agents.empty_title')}
            hint={t('workspace.agents.empty_hint')}
            actionLabel={t('workspace.agents.browse')}
            onAction={() => setPickerOpen(true)}
          />
        ) : (
          <div className="rounded-xl border border-blue-500/60 bg-blue-50 p-3 dark:bg-blue-900/20">
            <div className="flex items-start gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70 text-lg dark:bg-dark-muted">
                {activeAgent.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="truncate text-sm font-semibold">{activeAgent.name}</h4>
                  {activeAgent.builtin && (
                    <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-px text-[9px] font-semibold uppercase text-light-subtle dark:bg-dark-muted dark:text-dark-subtle">
                      {t('workspace.agents.builtin')}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-light-subtle dark:text-dark-subtle">
                  {activeAgent.description}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-flex items-center gap-1 text-[10px] text-light-subtle dark:text-dark-subtle">
                    <Cpu className="h-3 w-3" />
                    {modelOptions.find((m) => m.id === activeAgent.model)?.label ?? t('workspace.agents.default_model')}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-light-subtle dark:text-dark-subtle">
                    <Sparkles className="h-3 w-3" />
                    {t('workspace.agents.skills_count', { count: (activeWorkspace?.skillIds ?? []).length })}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-light-subtle dark:text-dark-subtle">
                    <Wrench className="h-3 w-3" />
                    {t('workspace.agents.tools_count', { count: attachedToolCount })}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  title={t('workspace.agents.edit')}
                  onClick={() => setEditing(activeAgent)}
                  className="rounded-md p-1.5 transition-colors hover:bg-white/70 dark:hover:bg-dark-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title={t('workspace.panels.detach')}
                  onClick={() => bindWorkspaceAgent(activeWorkspaceId, null)}
                  className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                <Check className="h-3 w-3" /> {t('workspace.agents.active_chat')}
              </span>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="rounded-md border border-blue-500/40 px-2 py-1 text-[10px] font-medium text-blue-700 transition-colors hover:bg-white/70 dark:text-blue-300 dark:hover:bg-dark-muted"
              >
                {t('workspace.agents.change')}
              </button>
            </div>
          </div>
        )}

        {/* Instruction packs only apply once an agent runs the workspace. */}
        {activeAgent && instructions.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-light-subtle dark:text-dark-subtle">
              <ScrollText className="h-3 w-3" /> {t('workspace.instructions.title')}
            </p>
            {instructions.map((pack) => (
              <div
                key={pack.id}
                className="flex items-center gap-2 rounded-lg border border-amber-200/60 bg-amber-50/50 px-2 py-1.5 dark:border-amber-500/20 dark:bg-amber-900/10"
              >
                <span className="flex-1 truncate text-xs font-medium">{pack.name}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pack.enabled}
                  aria-label={t('workspace.instructions.toggle', { name: pack.name })}
                  onClick={() => setInstructionEnabled(pack.id, !pack.enabled)}
                  className={`relative h-4 w-8 rounded-full transition-colors ${pack.enabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-dark-muted'}`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${pack.enabled ? 'left-[18px]' : 'left-0.5'}`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {pickerOpen && (
        <ComponentPickerDialog
          kind="agents"
          singleSelect
          selectedIds={activeAgent ? [activeAgent.id] : []}
          onToggle={(id) => {
            // Clicking the current agent keeps it bound; use the detach button
            // on the card to clear the workspace agent.
            if (id !== activeAgent?.id) bindWorkspaceAgent(activeWorkspaceId, id);
          }}
          onClose={() => setPickerOpen(false)}
          items={agents.map((agent) => ({
            id: agent.id,
            title: agent.name,
            description: agent.description,
            leading: (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-light-muted text-base dark:bg-dark-muted">
                {agent.emoji}
              </span>
            ),
            badge: agent.builtin ? (
              <span className="shrink-0 rounded-full bg-light-muted px-1.5 py-px text-[9px] font-semibold uppercase text-light-subtle dark:bg-dark-muted dark:text-dark-subtle">
                {t('workspace.agents.builtin')}
              </span>
            ) : undefined,
            meta: t('workspace.agent_meta', { skills: agent.skillIds.length, tools: agent.toolIds.length }),
          }))}
        />
      )}

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
