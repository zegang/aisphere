// Skills tab: reusable instruction packs the agents can attach, in the style
// of VS Code's prompt/skill library and modern AI workstation apps.

import { useMemo, useState } from 'react';
import { Plus, Trash2, Sparkles, Search, X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import type { SkillSource } from '@/types/workspace';

export function SkillsPanel() {
  const { t } = useTranslation();
  const skills = useWorkspaceStore((s) => s.skills);
  const updateSkill = useWorkspaceStore((s) => s.updateSkill);
  const removeSkill = useWorkspaceStore((s) => s.removeSkill);
  const addSkill = useWorkspaceStore((s) => s.addSkill);

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');

  const sourceTone: Record<SkillSource, string> = {
    builtin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    custom: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    local: 'bg-light-muted dark:bg-dark-muted text-light-subtle dark:text-dark-subtle',
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter(
      (skill) => skill.name.toLowerCase().includes(needle) || skill.description.toLowerCase().includes(needle),
    );
  }, [skills, search]);

  const submit = () => {
    if (!name.trim()) return;
    addSkill({
      name: name.trim(),
      description: description.trim() || t('workspace.skills.no_description'),
      instructions: instructions.trim(),
    });
    setName('');
    setDescription('');
    setInstructions('');
    setShowForm(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-light-subtle dark:text-dark-subtle">
            {t('workspace.skills.count', { count: skills.length })}
          </p>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t('workspace.skills.new')}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-light-muted dark:text-dark-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('workspace.skills.search')}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {showForm && (
        <div className="mx-3 mb-2 p-3 rounded-xl border border-blue-500/30 bg-blue-50/50 dark:bg-blue-900/10 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">{t('workspace.skills.new_title')}</p>
            <button type="button" onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-light-muted dark:hover:bg-dark-muted">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('workspace.skills.field_name')}
            className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('workspace.skills.field_description')}
            className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-500"
          />
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder={t('workspace.skills.field_instructions')}
            rows={3}
            className="w-full bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-lg px-2.5 py-1.5 text-xs resize-none outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className="w-full py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {t('workspace.skills.create')}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
        {filtered.map((skill) => (
          <div
            key={skill.id}
            className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg"
          >
            <div className="flex items-start gap-2.5">
              <span className="w-8 h-8 shrink-0 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-purple-600" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-semibold truncate">{skill.name}</h4>
                  <span className={`shrink-0 px-1.5 py-px text-[9px] font-semibold uppercase rounded-full ${sourceTone[skill.source]}`}>
                    {t(`workspace.skills.source.${skill.source}`)}
                  </span>
                </div>
                <p className="text-[11px] text-light-subtle dark:text-dark-subtle line-clamp-2 mt-0.5">
                  {skill.description}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  role="switch"
                  aria-checked={skill.enabled}
                  aria-label={t('workspace.skills.toggle', { name: skill.name })}
                  onClick={() => updateSkill(skill.id, { enabled: !skill.enabled })}
                  className={`relative w-9 h-5 rounded-full transition-colors ${skill.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-dark-muted'}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${skill.enabled ? 'left-5' : 'left-0.5'}`}
                  />
                </button>
                {skill.source === 'custom' && (
                  <button
                    type="button"
                    title={t('workspace.skills.delete')}
                    onClick={() => removeSkill(skill.id)}
                    className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-10 text-center text-xs text-light-subtle dark:text-dark-subtle">
            {t('workspace.skills.empty_search')}
          </div>
        )}
      </div>
    </div>
  );
}

export default SkillsPanel;
