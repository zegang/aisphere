// Create/edit dialog for Workspace agents: pick a model, attach skills and
// MCP tools, and provide the agent's instruction text.

import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { splitToolKey } from '@/types/workspace';
import type { Agent } from '@/types/workspace';

interface Props {
  agent: Agent | null;
  modelOptions: Array<{ id: string; label: string }>;
  onClose: () => void;
}

export function AgentEditDialog({ agent, modelOptions, onClose }: Props) {
  const { t } = useTranslation();
  const { servers, skills, addAgent, updateAgent } = useWorkspaceStore();

  const [name, setName] = useState(agent?.name ?? '');
  const [emoji, setEmoji] = useState(agent?.emoji ?? '🤖');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [instructions, setInstructions] = useState(agent?.instructions ?? '');
  const [model, setModel] = useState(agent?.model ?? '');
  const [skillIds, setSkillIds] = useState<string[]>(agent?.skillIds ?? []);
  const [toolIds, setToolIds] = useState<string[]>(agent?.toolIds ?? []);

  const runningServers = servers.filter((server) => server.status === 'running' && server.enabled);

  const toggleSkill = (id: string) =>
    setSkillIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const toggleTool = (key: string) =>
    setToolIds((current) => (current.includes(key) ? current.filter((x) => x !== key) : [...current, key]));

  const submit = () => {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      emoji: emoji.trim() || '🤖',
      description: description.trim(),
      instructions: instructions.trim(),
      model: model || null,
      skillIds,
      toolIds,
    };
    if (agent) {
      updateAgent(agent.id, payload);
    } else {
      addAgent(payload);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-light-border dark:border-dark-border">
          <h3 className="font-bold">
            {agent ? t('workspace.agents.edit_title', { name: agent.name }) : t('workspace.agents.new_title')}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <div className="flex gap-2">
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              className="w-14 text-center bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-2 py-2 text-lg outline-none focus:border-blue-500"
              maxLength={4}
              aria-label={t('workspace.agents.field_emoji')}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('workspace.agents.field_name')}
              className="flex-1 bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('workspace.agents.field_description')}
            rows={2}
            className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-3 py-2 text-xs resize-none outline-none focus:border-blue-500"
          />

          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={t('workspace.agents.field_instructions')}
            rows={3}
            className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-3 py-2 text-xs resize-none outline-none focus:border-blue-500"
          />

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-light-subtle dark:text-dark-subtle mb-1">
              {t('workspace.agents.field_model')}
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-blue-500"
            >
              <option value="">{t('workspace.agents.default_model')}</option>
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-light-subtle dark:text-dark-subtle mb-1">
              {t('workspace.agents.field_skills')}
            </p>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {skills.map((skill) => (
                <label key={skill.id} className="flex items-center gap-2 text-xs cursor-pointer rounded-lg px-2 py-1 hover:bg-light-muted dark:hover:bg-dark-muted">
                  <input
                    type="checkbox"
                    checked={skillIds.includes(skill.id)}
                    onChange={() => toggleSkill(skill.id)}
                    className="accent-blue-600"
                  />
                  <span className="truncate">{skill.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-light-subtle dark:text-dark-subtle mb-1">
              {t('workspace.agents.field_tools')}
            </p>
            {runningServers.length === 0 ? (
              <p className="text-[11px] text-light-subtle dark:text-dark-subtle px-2">
                {t('workspace.agents.no_tools')}
              </p>
            ) : (
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {runningServers.map((server) => (
                  <div key={server.id}>
                    <p className="text-[10px] text-light-subtle dark:text-dark-subtle px-1">{server.name}</p>
                    {server.tools.map((tool) => {
                      const key = `${server.id}:${tool.id}`;
                      return (
                        <label key={key} className="flex items-center gap-2 text-xs cursor-pointer rounded-lg px-2 py-1 hover:bg-light-muted dark:hover:bg-dark-muted">
                          <input
                            type="checkbox"
                            checked={toolIds.includes(key)}
                            onChange={() => toggleTool(key)}
                            className="accent-blue-600"
                          />
                          <span className="truncate">{splitToolKey(key).toolId || tool.name}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-light-border dark:border-dark-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border hover:bg-light-muted dark:hover:bg-dark-muted transition-colors">
            {t('workspace.agents.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {agent ? t('workspace.agents.save') : t('workspace.agents.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AgentEditDialog;
