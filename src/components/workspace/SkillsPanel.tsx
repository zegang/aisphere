// Skills tab: only the skills attached to the current workspace are listed.
// The Browse dialog exposes every installed skill; creating a custom skill
// attaches it to the workspace automatically.

import { useState } from 'react';
import { Plus, Trash2, Sparkles, X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { SkillSource } from '@/types/workspace';
import ComponentPickerDialog from './ComponentPickerDialog';
import PanelEmptyState from './PanelEmptyState';

const sourceTone: Record<SkillSource, string> = {
  builtin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  custom: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  local: 'bg-light-muted dark:bg-dark-muted text-light-subtle dark:text-dark-subtle',
};

export function SkillsPanel() {
  const { t } = useTranslation();
  const skills = useWorkspaceStore((s) => s.skills);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const setWorkspaceSkill = useWorkspaceStore((s) => s.setWorkspaceSkill);
  const updateSkill = useWorkspaceStore((s) => s.updateSkill);
  const removeSkill = useWorkspaceStore((s) => s.removeSkill);
  const addSkill = useWorkspaceStore((s) => s.addSkill);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);
  const attachedIds = activeWorkspace?.skillIds ?? [];
  const attachedSkills = skills.filter((skill) => attachedIds.includes(skill.id));

  const [pickerOpen, setPickerOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    const id = addSkill({
      name: name.trim(),
      description: description.trim() || t('workspace.skills.no_description'),
      instructions: instructions.trim(),
    });
    setWorkspaceSkill(activeWorkspaceId, id, true);
    setName('');
    setDescription('');
    setInstructions('');
    setShowForm(false);
  };

  // Attaching a skill means "use it in this workspace", so switch it on when
  // it was globally disabled.
  const toggleAttach = (id: string) => {
    const attached = attachedIds.includes(id);
    setWorkspaceSkill(activeWorkspaceId, id, !attached);
    if (!attached) {
      const skill = skills.find((item) => item.id === id);
      if (skill && !skill.enabled) updateSkill(id, { enabled: true });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <p className="text-xs text-light-subtle dark:text-dark-subtle">
          {t('workspace.panels.attached_count', { count: attachedSkills.length })}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            title={t('workspace.skills.new')}
            aria-label={t('workspace.skills.new')}
            className="rounded-lg border border-light-border p-1.5 text-light-subtle transition-colors hover:bg-light-muted hover:text-light-text dark:border-dark-border dark:text-dark-subtle dark:hover:bg-dark-muted dark:hover:text-dark-text"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Sparkles className="h-3.5 w-3.5" /> {t('workspace.panels.browse')}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mx-3 mb-2 space-y-2 rounded-xl border border-blue-500/30 bg-blue-50/50 p-3 dark:bg-blue-900/10">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">{t('workspace.skills.new_title')}</p>
            <button type="button" onClick={() => setShowForm(false)} className="rounded p-1 hover:bg-light-muted dark:hover:bg-dark-muted">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('workspace.skills.field_name')}
            className="w-full rounded-lg border border-light-border bg-light-bg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-dark-border dark:bg-dark-bg"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('workspace.skills.field_description')}
            className="w-full rounded-lg border border-light-border bg-light-bg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-dark-border dark:bg-dark-bg"
          />
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder={t('workspace.skills.field_instructions')}
            rows={3}
            className="w-full resize-none rounded-lg border border-light-border bg-light-bg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-dark-border dark:bg-dark-bg"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className="w-full rounded-lg bg-blue-600 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {t('workspace.skills.create')}
          </button>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {attachedSkills.length === 0 ? (
          <PanelEmptyState
            icon={<Sparkles className="h-5 w-5 text-blue-600" />}
            title={t('workspace.skills.empty_title')}
            hint={t('workspace.skills.empty_hint')}
            actionLabel={t('workspace.skills.browse')}
            onAction={() => setPickerOpen(true)}
          />
        ) : (
          attachedSkills.map((skill) => (
            <div
              key={skill.id}
              className="rounded-xl border border-light-border bg-light-bg p-3 dark:border-dark-border dark:bg-dark-bg"
            >
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="truncate text-sm font-semibold">{skill.name}</h4>
                    <span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase ${sourceTone[skill.source]}`}>
                      {t(`workspace.skills.source.${skill.source}`)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-light-subtle dark:text-dark-subtle">
                    {skill.description}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={skill.enabled}
                    aria-label={t('workspace.skills.toggle', { name: skill.name })}
                    onClick={() => updateSkill(skill.id, { enabled: !skill.enabled })}
                    className={`relative h-5 w-9 rounded-full transition-colors ${skill.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-dark-muted'}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${skill.enabled ? 'left-5' : 'left-0.5'}`}
                    />
                  </button>
                  <button
                    type="button"
                    title={t('workspace.panels.detach')}
                    onClick={() => setWorkspaceSkill(activeWorkspaceId, skill.id, false)}
                    className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {skill.source === 'custom' && (
                    <button
                      type="button"
                      title={t('workspace.skills.delete')}
                      onClick={() => {
                        if (confirm(t('workspace.skills.delete_confirm', { name: skill.name }))) {
                          removeSkill(skill.id);
                        }
                      }}
                      className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {pickerOpen && (
        <ComponentPickerDialog
          kind="skills"
          selectedIds={attachedIds}
          onToggle={(id) => toggleAttach(id)}
          onClose={() => setPickerOpen(false)}
          items={skills.map((skill) => ({
            id: skill.id,
            title: skill.name,
            description: skill.description,
            leading: (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Sparkles className="h-4 w-4 text-purple-600" />
              </span>
            ),
            badge: (
              <span className={`shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase ${sourceTone[skill.source]}`}>
                {t(`workspace.skills.source.${skill.source}`)}
              </span>
            ),
            meta: skill.enabled ? t('workspace.picker.enabled') : t('workspace.picker.disabled'),
          }))}
        />
      )}
    </div>
  );
}

export default SkillsPanel;
