import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Mic,
  Send,
  FileText,
  BookOpen,
  Edit3 as Edit3Icon,
  MoreVertical,
  Sparkles,
  ChevronDown,
  Volume2,
  RefreshCw,
  Check,
  Cpu,
  Bot,
  Wrench,
  X,
  FolderOpen,
  MessageSquare,
  Pencil,
  Trash2,
  Globe,
} from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useAppStore } from '@/stores/appStore';
import { useAiSphereStore } from '@/stores/aiSphereStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { splitToolKey } from '@/types/workspace';
import type { Application } from '@/types/api';
import AgentsPanel from '@/components/workspace/AgentsPanel';
import SkillsPanel from '@/components/workspace/SkillsPanel';
import McpPanel from '@/components/workspace/McpPanel';
import StudioTab from '@/components/workspace/StudioTab';
import EngineStartDialog from '@/components/workspace/EngineStartDialog';
import type { EngineStartRequest } from '@/components/workspace/EngineStartDialog';

type RightTab = 'agents' | 'skills' | 'mcp' | 'studio';

interface Source {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'link';
}

/**
 * Groups detected GGUF models by their installed LLM Inference Engine app.
 * The runtime stores the downloaded model in `install.installed_package`,
 * while the engine's live container status comes from `task.status` — only a
 * running engine can actually serve its model.
 */
interface EngineGroup {
  appId: string;
  name: string;
  status: string;
  models: LocalModel[];
}

function detectEngines(applications: Application[]): EngineGroup[] {
  const groups: EngineGroup[] = [];

  for (const app of applications) {
    // Installed LLM Inference Engine apps (kind 'engine'; legacy entries fall
    // back to the LLM category). Web UI front-ends are not chat engines.
    const isEngine = app.kind === 'engine'
      || (!app.kind && app.type === 'llm' && app.category === 'LLMs Inference Engine');
    if (!isEngine || !app.install?.installed) continue;

    const installedPackage = app.install.installed_package || '';
    const fileName = installedPackage.split(/[\\/]/).pop() || '';
    if (!/\.gguf$/i.test(fileName)) continue; // engine app without a detected model file

    const models: LocalModel[] = [{
      id: `${app.id}:${fileName}`,
      label: fileName.replace(/\.gguf$/i, ''),
      appName: app.name,
      path: installedPackage,
    }];

    groups.push({
      appId: app.id,
      name: app.name,
      status: app.task?.status ?? 'stopped',
      models,
    });
  }

  // Running engines first, then the familiar DeepSeek ordering.
  const rank = (g: EngineGroup) => (g.status === 'running' ? 0 : g.status === 'starting' ? 1 : 2);
  return groups.sort((a, b) =>
    rank(a) - rank(b)
    || (/(deepseek)/i.test(b.models[0]?.label ?? '') ? 1 : 0) - (/(deepseek)/i.test(a.models[0]?.label ?? '') ? 1 : 0)
    || (a.models[0]?.label ?? '').localeCompare(b.models[0]?.label ?? ''));
}

const engineStatusKey = (status: string) => `workspace.engines.status_${status || 'stopped'}`;

interface LocalModel {
  id: string;
  label: string;
  appName: string;
  path: string;
}

export default function WorkspacePage() {
  const { t } = useTranslation();
  const applications = useAppStore((state) => state.applications);
  const fetchApplications = useAppStore((state) => state.fetchApplications);
  const isLoading = useAppStore((state) => state.isLoading);
  const startApplication = useAppStore((state) => state.startApplication);
  const refreshApplicationStatus = useAppStore((state) => state.refreshApplicationStatus);
  const openWorkspace = useAiSphereStore((s) => s.openWorkspace);

  const {
    servers,
    skills,
    agents,
    hooks,
    instructions,
    workspaces,
    activeWorkspaceId,
  } = useWorkspaceStore();
  const bindWorkspaceAgent = useWorkspaceStore((s) => s.bindWorkspaceAgent);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId)
    ?? workspaces[0]
    ?? null;
  const messages = activeWorkspace?.messages ?? [];
  const selectedAgentId = activeWorkspace?.agentId ?? null;

  const [sources] = useState<Source[]>([
    { id: '1', name: 'AI Safety Guidelines.pdf', type: 'pdf' },
    { id: '2', name: 'Project Roadmap.doc', type: 'doc' },
    { id: '3', name: 'https://docs.aisphere.io', type: 'link' },
  ]);

  const [input, setInput] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [attachedToolIds, setAttachedToolIds] = useState<string[]>([]);
  const [rightTab, setRightTab] = useState<RightTab>('agents');
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Left column: inline rename state for workspaces ("null" = none editing).
  const [renamingWorkspaceId, setRenamingWorkspaceId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  // Engine start dialog (ask / starting / error) for non-running engines.
  const [engineStart, setEngineStart] = useState<{ request: EngineStartRequest; modelId: string } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  // Once the user picks a model explicitly we stop applying the default. The
  // app list can arrive in stages (installed first, then the rest), so without
  // this the default would stay stuck on whichever model loaded first.
  const userSelectedRef = useRef(false);

  // Live engine statuses are polled while the workspace is open so the model
  // picker reflects "running / stopped" like My Apps does. The effect keys on
  // the engine-id list (not the applications object) so status updates don't
  // re-trigger the polling itself.
  const engineIdKey = useMemo(
    () => applications.filter((app) => app.kind === 'engine' && app.install?.installed).map((app) => app.id).join(','),
    [applications],
  );
  useEffect(() => {
    const engineIds = engineIdKey.split(',').filter(Boolean);
    if (engineIds.length === 0) return;
    let disposed = false;
    const poll = async () => {
      for (const id of engineIds) {
        if (disposed) return;
        await refreshApplicationStatus(id);
      }
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [engineIdKey, refreshApplicationStatus]);

  const engines = useMemo(() => detectEngines(applications), [applications]);
  const models = useMemo(() => engines.flatMap((engine) => engine.models), [engines]);
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const selectedEngine = engines.find((engine) => engine.models.some((model) => model.id === selectedModelId)) ?? null;
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Installed Explore components (MCP servers, skills, agents, hooks,
  // instructions…) are registered into the workspace registry whenever the
  // app list changes. `registerAppComponents` is idempotent, so this is safe
  // to run on every load.
  useEffect(() => {
    for (const app of applications) {
      useWorkspaceStore.getState().registerAppComponents(app);
    }
  }, [applications]);

  // Web UI apps (kind 'webui'): installed web front-ends the workspace can
  // open. Their live container status is refreshed like on My Apps.
  const webApps = useMemo(
    () => applications.filter((app) => app.kind === 'webui' && app.install?.installed),
    [applications],
  );

  useEffect(() => {
    for (const app of webApps.filter((item) => item.task)) {
      refreshApplicationStatus(app.id);
    }
  }, [webApps, refreshApplicationStatus]);

  // Default model: prefer a model whose engine is running (so sending works
  // immediately), then the familiar DeepSeek entry, then anything available.
  useEffect(() => {
    setSelectedModelId((current) => {
      if (userSelectedRef.current && current && models.some((model) => model.id === current)) {
        return current;
      }
      if (selectedAgent?.model && models.some((model) => model.id === selectedAgent.model)) {
        return selectedAgent.model;
      }
      const running = engines.find((engine) => engine.status === 'running');
      if (running) {
        if (running.models.some((model) => model.id === current)) return current;
        return running.models[0].id;
      }
      return models.find((model) => /deepseek/i.test(model.label))?.id ?? models[0]?.id ?? null;
    });
    // Note: `engines` changes on every status poll, which is intentional.
  }, [models, engines, selectedAgent?.model]);

  // Model selection with engine-status awareness: selecting a model from a
  // non-running engine asks the user whether to start it (LM Studio /
  // Open WebUI pattern) instead of silently failing on send.
  const selectModelWithEngineCheck = (modelId: string, engine: EngineGroup | null) => {
    userSelectedRef.current = true;
    if (!engine || engine.status === 'running' || engine.status === 'starting') {
      setSelectedModelId(modelId);
      setEngineStart(null);
      return;
    }    // Keep the intended model pending until the engine is up; the dialog's
    // `onReady` completes the flow (selecting here shows the chosen model with
    // a stopped status dot in the header, which matches VS Code/LM Studio).
    setSelectedModelId(modelId);
    setEngineStart({
      request: {
        appId: engine.appId,
        engineName: engine.name,
        modelLabel: engine.models.find((model) => model.id === modelId)?.label ?? engine.models[0]?.label ?? '',
      },
      modelId,
    });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !activeWorkspace) return;

    // Engine must be running before a chat can be dispatched (the model lives
    // inside its inference engine process). A stopped engine opens the same
    // start flow the picker uses, so the user is never left with a silent
    // dead-end send.
    if (selectedEngine && selectedEngine.status !== 'running') {
      const modelId = selectedModel?.id ?? selectedEngine.models[0]?.id;
      if (modelId) {
        selectModelWithEngineCheck(modelId, selectedEngine);
        return;
      }
    }

    useWorkspaceStore.getState().appendMessage(activeWorkspace.id, {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    });
    setInput('');
    setIsThinking(true);

    const activeSkills = (selectedAgent?.skillIds ?? [])
      .map((id) => skills.find((skill) => skill.id === id)?.name)
      .filter(Boolean) as string[];
    const activeTools = attachedToolIds.length > 0 ? attachedToolIds : selectedAgent?.toolIds ?? [];
    // Installed instruction packs (AGENTS.md) and hooks shape the reply.
    const appliedInstructions = instructions.filter((pack) => pack.enabled).map((pack) => pack.name);
    const appliedHooks = hooks.filter((hook) => hook.enabled).map((hook) => hook.name);

    setTimeout(() => {
      setIsThinking(false);
      const base = t('workspace.mock_response', {
        model: selectedModel?.label ?? t('workspace.models.none'),
        agent: selectedAgent ? t('workspace.agent_via', { agent: `${selectedAgent.emoji} ${selectedAgent.name}` }) : '',
        skills: activeSkills.length ? t('workspace.skills_via', { skills: activeSkills.join(', ') }) : '',
        tools:
          activeTools.length
            ? t('workspace.tools_via', {
                count: activeTools.length,
                tools: activeTools.map((key) => {
                  const { serverId, toolId } = splitToolKey(key);
                  return servers.find((s) => s.id === serverId)?.tools.find((tool) => tool.id === toolId)?.name ?? toolId;
                }).join(', '),
              })
            : '',
      });
      const contextLines = [
        appliedInstructions.length ? t('workspace.instructions_applied', { names: appliedInstructions.join(', ') }) : '',
        appliedHooks.length ? t('workspace.hooks_applied', { names: appliedHooks.join(', ') }) : '',
      ].filter(Boolean).join('\n');
      useWorkspaceStore.getState().appendMessage(activeWorkspace.id, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: contextLines ? `${base}\n${contextLines}` : base,
      });
    }, 1000);
  };

  const toggleSpeech = () => {
    setIsSpeaking(!isSpeaking);
    // Implementation for STT would go here
  };

  const closeMenus = () => {
    setModelMenuOpen(false);
    setAgentMenuOpen(false);
    setToolsMenuOpen(false);
  };
  const closeOverlayProps = {
    onClick: closeMenus,
    className: 'fixed inset-0 z-40',
  };

  const rightTabs: Array<{ key: RightTab; icon: typeof Bot; label: string }> = [
    { key: 'agents', icon: Bot, label: 'workspace.tab_agents' },
    { key: 'skills', icon: Sparkles, label: 'workspace.tab_skills' },
    { key: 'mcp', icon: Wrench, label: 'workspace.tab_mcp' },
    { key: 'studio', icon: Edit3Icon, label: 'workspace.tab_studio' },
  ];

  return (
    <div className="flex h-full bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text overflow-hidden">

      {/* Part 1: Workspaces + Sources (Left) */}
      <div className="w-64 border-r border-light-border dark:border-dark-border flex flex-col bg-light-surface dark:bg-dark-surface">
        {/* Workspaces */}
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-500" /> {t('workspace.workspaces.title')}
          </h2>
          <button
            type="button"
            title={t('workspace.workspaces.new')}
            onClick={() => {
              const store = useWorkspaceStore.getState();
              store.createWorkspace(t('workspace.workspaces.untitled', { n: store.workspaces.length + 1 }));
            }}
            className="p-1 hover:bg-light-muted dark:hover:bg-dark-muted rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="px-3 pb-3 max-h-52 overflow-y-auto space-y-1">
          {workspaces.map((workspace) => {
            const active = workspace.id === activeWorkspaceId;
            const renaming = workspace.id === renamingWorkspaceId;
            const userMsgCount = workspace.messages.filter((m) => m.id !== 'welcome' && m.role === 'user').length;
            return (
              <div
                key={workspace.id}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                  active ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-light-muted dark:hover:bg-dark-muted'
                }`}
                onClick={() => useWorkspaceStore.getState().selectWorkspace(workspace.id)}
              >
                {renaming ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => {
                      useWorkspaceStore.getState().renameWorkspace(workspace.id, renameDraft);
                      setRenamingWorkspaceId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        useWorkspaceStore.getState().renameWorkspace(workspace.id, renameDraft);
                        setRenamingWorkspaceId(null);
                      } else if (e.key === 'Escape') {
                        setRenamingWorkspaceId(null);
                      }
                    }}
                    maxLength={40}
                    className="flex-1 min-w-0 text-sm bg-light-bg dark:bg-dark-bg border border-blue-500 rounded px-1.5 py-0.5 outline-none"
                  />
                ) : (
                  <>
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-blue-600' : 'text-light-muted dark:text-dark-muted'}`} />
                    <span className={`text-sm truncate flex-1 ${active ? 'font-semibold text-blue-700 dark:text-blue-300' : ''}`}>
                      {workspace.name || t('workspace.workspaces.untitled', { n: workspaces.indexOf(workspace) + 1 })}
                    </span>
                    <span className="text-[10px] text-light-muted dark:text-dark-muted shrink-0">{userMsgCount}</span>
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button
                        type="button"
                        title={t('workspace.workspaces.rename')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameDraft(workspace.name || t('workspace.workspaces.untitled', { n: workspaces.indexOf(workspace) + 1 }));
                          setRenamingWorkspaceId(workspace.id);
                        }}
                        className="p-1 rounded hover:bg-light-bg dark:hover:bg-dark-bg"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {workspaces.length > 1 && (
                        <button
                          type="button"
                          title={t('workspace.workspaces.delete')}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(t('workspace.workspaces.delete_confirm', { name: workspace.name || t('workspace.workspaces.untitled', { n: workspaces.indexOf(workspace) + 1 }) }))) {
                              useWorkspaceStore.getState().deleteWorkspace(workspace.id);
                            }
                          }}
                          className="p-1 rounded text-red-500 hover:bg-light-bg dark:hover:bg-dark-bg"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Sources */}
        <div className="border-t border-light-border dark:border-dark-border px-4 pt-3 pb-1 flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-500" /> {t('workspace.sources')}
          </h2>
          <button className="p-1 hover:bg-light-muted dark:hover:bg-dark-muted rounded transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3">
          <div className="relative mb-4">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-light-muted dark:text-dark-muted" />
            <input
              type="text"
              placeholder={t('workspace.search_sources')}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-light-bg dark:bg-dark-bg border border-light-border dark:border-dark-border rounded-md outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-1 overflow-y-auto">
            {sources.map(source => (
              <div key={source.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-light-muted dark:hover:bg-dark-muted cursor-pointer group transition-colors">
                <FileText className="w-4 h-4 text-light-muted dark:text-dark-muted" />
                <span className="text-sm truncate flex-1">{source.name}</span>
                <MoreVertical className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>

        {/* Web UI apps installed from Explore (kind 'webui') */}
        {webApps.length > 0 && (
          <>
            <div className="border-t border-light-border dark:border-dark-border px-4 pt-3 pb-1">
              <h2 className="font-bold flex items-center gap-2">
                <Globe className="w-4 h-4 text-green-500" /> {t('workspace.web.title')}
              </h2>
            </div>
            <div className="px-3 pb-3 pt-1 space-y-1">
              {webApps.map((app) => {
                const status = app.task?.status ?? 'stopped';
                const running = status === 'running';
                const hostPort = app.task?.hostPorts
                  ? (app.task.hostPorts['8080'] || Object.values(app.task.hostPorts)[0])
                  : undefined;
                const webUrl = running && hostPort ? `http://localhost:${hostPort}` : undefined;
                return (
                  <div
                    key={app.id}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-light-muted dark:hover:bg-dark-muted"
                    title={app.description}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${running ? 'bg-green-500' : status === 'failed' ? 'bg-red-500' : 'bg-gray-400 dark:bg-dark-text/60'}`}
                    />
                    <span className="text-sm truncate flex-1">{app.name}</span>
                    {webUrl ? (
                      <button
                        type="button"
                        onClick={() => openWorkspace(app.id, webUrl)}
                        className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors shrink-0"
                      >
                        {t('workspace.web.open')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startApplication(app.id)}
                        className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
                      >
                        {t('app.start')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Part 2: Chat (Middle) */}
      <div className="flex-1 flex flex-col relative min-w-0 bg-light-bg dark:bg-dark-bg">
        {/* Chat Header */}
        <div className="px-6 py-3 border-b border-light-border dark:border-dark-border flex items-center justify-between bg-light-surface dark:bg-dark-surface gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
              <Sparkles className="w-4 h-4 text-blue-600" />
            </div>

            {/* Agent picker (VS Code style) */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => { setAgentMenuOpen(!agentMenuOpen); setModelMenuOpen(false); setToolsMenuOpen(false); }}
                aria-expanded={agentMenuOpen}
                title={t('workspace.agent_picker')}
                className="flex items-center gap-1.5 rounded-full border border-light-border dark:border-dark-border px-2.5 py-1 text-xs font-semibold hover:border-blue-500/50 transition-colors"
              >
                {selectedAgent ? (
                  <span className="flex items-center gap-1 max-w-[10rem]">
                    <span>{selectedAgent.emoji}</span>
                    <span className="truncate">{selectedAgent.name}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5" />
                    <span>{t('workspace.no_agent')}</span>
                  </span>
                )}
                <ChevronDown className="w-3 h-3 shrink-0" />
              </button>

              {agentMenuOpen && (
                <>
                  <div {...closeOverlayProps} />
                  <div className="absolute top-full left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-xl z-50 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => { bindWorkspaceAgent(activeWorkspaceId, null); setAgentMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${!selectedAgent ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'hover:bg-light-muted dark:hover:bg-dark-muted'}`}
                    >
                      <Bot className="w-4 h-4 shrink-0" />
                      <span className="flex-1">{t('workspace.no_agent')}</span>
                      {!selectedAgent && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                    <div className="border-t border-light-border dark:border-dark-border py-1">
                      {agents.map((agent) => {
                        const selected = agent.id === selectedAgentId;
                        return (
                          <button
                            key={agent.id}
                            type="button"
                            onClick={() => { bindWorkspaceAgent(activeWorkspaceId, agent.id); setAgentMenuOpen(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${selected ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'hover:bg-light-muted dark:hover:bg-dark-muted'}`}
                          >
                            <span className="text-base shrink-0">{agent.emoji}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{agent.name}</span>
                              <span className="block truncate text-[10px] text-light-muted dark:text-dark-muted">
                                {t('workspace.agent_meta', {
                                  skills: agent.skillIds.length,
                                  tools: agent.toolIds.length,
                                })}
                              </span>
                            </span>
                            {selected && <Check className="w-4 h-4 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Model picker */}
            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => { setModelMenuOpen(!modelMenuOpen); setAgentMenuOpen(false); setToolsMenuOpen(false); }}
                aria-expanded={modelMenuOpen}
                className="flex items-center gap-1.5 font-semibold text-sm hover:text-blue-600 transition-colors max-w-[18rem]"
              >
                {/* Live engine status next to the model name */}
                {selectedEngine && (
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      selectedEngine.status === 'running'
                        ? 'bg-green-500'
                        : selectedEngine.status === 'starting'
                          ? 'bg-blue-500 animate-pulse'
                          : selectedEngine.status === 'failed'
                            ? 'bg-red-500'
                            : 'bg-gray-400 dark:bg-dark-text/60'
                    }`}
                    title={t(engineStatusKey(selectedEngine.status))}
                  />
                )}
                <span className="truncate">{selectedModel?.label ?? t('workspace.models.none')}</span>
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {modelMenuOpen && (
                <>
                  <div {...closeOverlayProps} />
                  <div className="absolute top-full left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-light-border dark:border-dark-border">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-light-muted dark:text-dark-muted">
                          {t('workspace.models.title')}
                        </p>
                        <p className="text-[10px] text-light-muted dark:text-dark-muted">
                          {t('workspace.models.count', { count: models.length })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => fetchApplications()}
                        title={t('workspace.models.refresh')}
                        className="p-1.5 rounded-md hover:bg-light-muted dark:hover:bg-dark-muted transition-colors"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>

                    {models.length === 0 ? (
                      <div className="flex items-start gap-2 px-4 py-4 text-xs text-light-muted dark:text-dark-muted">
                        <Cpu className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{t('workspace.models.empty')}</span>
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto py-1">
                        {engines.map((engine) => {
                          const running = engine.status === 'running';
                          const starting = engine.status === 'starting';
                          return (
                            <div key={engine.appId}>
                              {/* Engine group header: name + live status */}
                              <div
                                className="flex items-center gap-2 px-3 pt-2 pb-0.5"
                                title={t(engineStatusKey(engine.status))}
                              >
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    running
                                      ? 'bg-green-500'
                                      : starting
                                        ? 'bg-blue-500 animate-pulse'
                                        : engine.status === 'failed'
                                          ? 'bg-red-500'
                                          : 'bg-gray-400 dark:bg-dark-text/60'
                                  }`}
                                />
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-light-muted dark:text-dark-muted truncate">
                                  {engine.name}
                                </span>
                                <span
                                  className={`text-[10px] shrink-0 ${
                                    running
                                      ? 'text-green-600 dark:text-green-400'
                                      : starting
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : engine.status === 'failed'
                                          ? 'text-red-500'
                                          : 'text-light-muted dark:text-dark-muted'
                                  }`}
                                >
                                  {t(engineStatusKey(engine.status))}
                                </span>
                              </div>
                              {engine.models.map((model) => {
                                const selected = model.id === selectedModelId;
                                return (
                                  <button
                                    key={model.id}
                                    type="button"
                                    onClick={() => {
                                      selectModelWithEngineCheck(model.id, engine);
                                      setModelMenuOpen(false);
                                    }}
                                    title={`${t(engineStatusKey(engine.status))} · ${model.path}`}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                                      selected
                                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                        : 'hover:bg-light-muted dark:hover:bg-dark-muted'
                                    }`}
                                  >
                                    <Cpu className={`w-4 h-4 shrink-0 ${selected ? '' : running ? 'text-green-600 dark:text-green-400' : 'text-light-muted dark:text-dark-muted'}`} />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium">{model.label}</span>
                                      <span className="block truncate text-[10px] text-light-muted dark:text-dark-muted">
                                        {t('workspace.models.app', { app: model.appName })}
                                      </span>
                                    </span>
                                    {selected && <Check className="w-4 h-4 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                        {/* Footnote explaining the running-engine rule */}
                        <p className="px-3 py-2 text-[10px] text-light-muted dark:text-dark-muted border-t border-light-border dark:border-dark-border mt-1">
                          {t('workspace.engines.needs_start')}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              title={t('workspace.read_aloud')}
              className="p-2 hover:bg-light-muted dark:hover:bg-dark-muted rounded-full transition-colors"
            >
              <Volume2 className="w-4 h-4 text-light-muted dark:text-dark-muted" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-tl-none'
              }`}>
                <p className="text-sm leading-relaxed">
                  {msg.id === 'welcome' ? t('workspace.initial_message') : msg.content}
                </p>
                <span className="text-[10px] opacity-50 mt-1 block">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border">
                <div className="flex gap-1.5">
                  {[0, 150, 300].map((delay) => (
                    <span key={delay} className="h-2 w-2 rounded-full bg-light-subtle dark:text-dark-subtle animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Attached context chips (agent skills / tools) */}
        {(selectedAgent || attachedToolIds.length > 0) && (
          <div className="px-6 pb-1 flex flex-wrap gap-1.5">
            {selectedAgent && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {selectedAgent.emoji} {selectedAgent.name}
                <button type="button" onClick={() => bindWorkspaceAgent(activeWorkspaceId, null)}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {attachedToolIds.map((key) => {
              const { serverId, toolId } = splitToolKey(key);
              const name = servers.find((s) => s.id === serverId)?.tools.find((tool) => tool.id === toolId)?.name ?? toolId;
              return (
                <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  <Wrench className="w-3 h-3" /> {name}
                  <button
                    type="button"
                    onClick={() => setAttachedToolIds((current) => current.filter((x) => x !== key))}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 bg-transparent relative">
          {/* MCP tools menu */}
          {toolsMenuOpen && (
            <>
              <div {...closeOverlayProps} />
              <div className="absolute bottom-16 left-4 w-80 max-w-[calc(100vw-2rem)] bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-light-border dark:border-dark-border">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-light-muted dark:text-dark-muted">
                    {t('workspace.tools.title')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setAttachedToolIds([])}
                    className="text-[10px] text-light-subtle hover:text-blue-600"
                  >
                    {t('workspace.tools.clear')}
                  </button>
                </div>
                {servers.filter((server) => server.enabled && server.status === 'running').length === 0 ? (
                  <div className="px-4 py-4 text-xs text-light-muted dark:text-dark-muted">
                    {t('workspace.tools.empty')}
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto py-1">
                    {servers.filter((server) => server.enabled && server.status === 'running').map((server) => (
                      <div key={server.id}>
                        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-light-muted dark:text-dark-muted">
                          {server.name}
                        </p>
                        {server.tools.map((tool) => {
                          const key = `${server.id}:${tool.id}`;
                          const checked = attachedToolIds.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() =>
                                setAttachedToolIds((current) => (checked ? current.filter((x) => x !== key) : [...current, key]))
                              }
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                                checked ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'hover:bg-light-muted dark:hover:bg-dark-muted'
                              }`}
                            >
                              <span className={`flex items-center justify-center h-3.5 w-3.5 rounded border shrink-0 ${checked ? 'bg-blue-600 border-blue-600' : 'border-light-border dark:border-dark-border'}`}>
                                {checked && <Check className="w-3 h-3 text-white" />}
                              </span>
                              <span className="font-medium">{tool.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <div className="max-w-3xl mx-auto relative flex items-end gap-2 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-2xl p-2 shadow-lg focus-within:border-blue-500/50 transition-all">
            <button
              type="button"
              onClick={() => { setToolsMenuOpen(!toolsMenuOpen); setModelMenuOpen(false); setAgentMenuOpen(false); }}
              aria-expanded={toolsMenuOpen}
              title={t('workspace.tools.title')}
              className={`p-2 rounded-xl transition-colors border ${
                toolsMenuOpen
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'hover:bg-light-muted dark:hover:bg-dark-muted border-transparent'
              }`}
            >
              <Wrench className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={toggleSpeech}
              className={`p-2 rounded-xl transition-colors ${isSpeaking ? 'bg-red-100 text-red-600 animate-pulse' : 'hover:bg-light-muted dark:hover:bg-dark-muted'}`}
            >
              <Mic className="w-5 h-5" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder={t('workspace.ask_placeholder')}
              className="flex-1 bg-transparent border-none outline-none text-sm py-2 resize-none max-h-32 min-h-[40px]"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400 text-white rounded-xl transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-[10px] text-center text-light-muted dark:text-dark-muted mt-2">
            {t('workspace.disclaimer')}
          </p>
        </div>
      </div>

      {/* Part 3: Agents / Skills / MCP / Studio (Right) */}
      <div className="w-80 border-l border-light-border dark:border-dark-border flex flex-col bg-light-surface dark:bg-dark-surface">
        <div className="p-3 border-b border-light-border dark:border-dark-border flex items-center gap-1">
          {rightTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setRightTab(tab.key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                rightTab === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'text-light-subtle hover:text-light-text dark:text-dark-subtle dark:hover:text-dark-text hover:bg-light-muted dark:hover:bg-dark-muted'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span className="truncate">{t(tab.label, { defaultValue: tab.key })}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0">
          {rightTab === 'agents' && <AgentsPanel modelOptions={models.map((m) => ({ id: m.id, label: m.label }))} />}
          {rightTab === 'skills' && <SkillsPanel />}
          {rightTab === 'mcp' && <McpPanel />}
          {rightTab === 'studio' && <StudioTab />}
        </div>
      </div>

      {/* Engine start flow: ask -> starting -> running/error for the model
          picker's engine association. */}
      {engineStart && (
        <EngineStartDialog
          request={engineStart.request}
          onClose={() => setEngineStart(null)}
          onReady={() => {
            userSelectedRef.current = true;
            setSelectedModelId(engineStart.modelId);
            setEngineStart(null);
          }}
        />
      )}

    </div>
  );
}
