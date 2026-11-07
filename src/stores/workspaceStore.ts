// Workspace intelligence store: multiple chat workspaces, MCP servers, skills
// and agents.
//
// Workspaces mirror VS Code's chat sessions (and modern AI workstation apps
// like ChatGPT/Cursor): the user can create any number of named workspaces,
// each with its own conversation and active agent. Everything is persisted
// locally so configuration survives restarts.

import { create } from 'zustand';
import type { McpServer, McpStatus, Skill, Agent, McpTool, Hook, InstructionPack } from '@/types/workspace';
import type { Application } from '@/types/api';

const STORAGE_KEY = 'aisphere.workspace.v2';
/** Simulated handshake latency for MCP servers when enabling them. */
const CONNECT_DELAY_MS = 1200;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface WorkspaceDoc {
  id: string;
  /** Empty name renders the localized "untitled" label in the UI. */
  name: string;
  createdAt: number;
  messages: ChatMessage[];
  /** Agent bound to this workspace (`agent.id`, or null for direct chat). */
  agentId: string | null;
}

interface PersistedWorkspace {
  servers: McpServer[];
  skills: Skill[];
  agents: Agent[];
  hooks: Hook[];
  instructions: InstructionPack[];
  workspaces: WorkspaceDoc[];
  activeWorkspaceId: string;
}

interface WorkspaceState {
  servers: McpServer[];
  skills: Skill[];
  agents: Agent[];
  hooks: Hook[];
  instructions: InstructionPack[];
  workspaces: WorkspaceDoc[];
  activeWorkspaceId: string;

  // Workspaces
  createWorkspace: (name?: string) => string;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  selectWorkspace: (id: string) => void;
  appendMessage: (workspaceId: string, message: Omit<ChatMessage, 'timestamp'> & { timestamp?: number }) => void;
  clearMessages: (workspaceId: string) => void;

  /** Registers the components carried by an Explore catalog app (idempotent). */
  registerAppComponents: (app: Application) => void;

  // Agents bound to the active workspace
  bindWorkspaceAgent: (workspaceId: string, agentId: string | null) => void;

  // Hooks / instruction packs
  setHookEnabled: (id: string, enabled: boolean) => void;
  setInstructionEnabled: (id: string, enabled: boolean) => void;

  // MCP
  addServer: (server: Omit<McpServer, 'id' | 'status' | 'tools'> & { tools?: string[] }) => void;
  updateServer: (id: string, patch: Partial<McpServer>) => void;
  removeServer: (id: string) => void;
  setServerEnabled: (id: string, enabled: boolean) => void;
  setToolEnabled: (serverId: string, toolId: string, enabled: boolean) => void;

  // Skills
  addSkill: (skill: Omit<Skill, 'id' | 'source' | 'enabled'>) => void;
  updateSkill: (id: string, patch: Partial<Skill>) => void;
  removeSkill: (id: string) => void;

  // Agents
  addAgent: (agent: Omit<Agent, 'id' | 'builtin' | 'enabled'>) => void;
  updateAgent: (id: string, patch: Partial<Agent>) => void;
  removeAgent: (id: string) => void;
}

export const uid = () => Math.random().toString(36).slice(2, 9);

const builtinTools = (prefix: string, names: string[]): McpTool[] =>
  names.map((name, i) => ({
    id: `${prefix}-tool-${i + 1}`,
    name,
    enabled: true,
    description: `${name} tool provided by the ${prefix} MCP server.`,
  }));

const makeWorkspace = (name = ''): WorkspaceDoc => ({
  id: `ws-${uid()}`,
  name,
  createdAt: Date.now(),
  messages: [{ id: 'welcome', role: 'assistant', content: '', timestamp: Date.now() }],
  agentId: null,
});

const defaultServers: McpServer[] = [
  {
    id: 'srv-file',
    name: 'Filesystem',
    description: 'Read, write and organize files in selected folders.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '{workspace}'],
    env: {},
    enabled: true,
    autoStart: true,
    status: 'running',
    tools: builtinTools('fs', ['read_file', 'write_file', 'list_directory', 'search_files']),
  },
  {
    id: 'srv-fetch',
    name: 'Fetch',
    description: 'Retrieve web pages and documentation for research tasks.',
    transport: 'http',
    url: 'https://mcp.aisphere.io/fetch',
    enabled: true,
    autoStart: true,
    status: 'running',
    tools: builtinTools('fetch', ['get_page', 'download_url']),
  },
  {
    id: 'srv-memory',
    name: 'Memory',
    description: 'Persist a knowledge graph of notes and facts across sessions.',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: {},
    enabled: false,
    autoStart: false,
    status: 'stopped',
    tools: builtinTools('mem', ['create_entities', 'search_nodes']),
  },
  {
    id: 'srv-time',
    name: 'Time',
    description: 'Get current time and convert between timezones.',
    transport: 'stdio',
    command: 'uvx',
    args: ['mcp-server-time'],
    env: {},
    enabled: false,
    autoStart: false,
    status: 'stopped',
    tools: builtinTools('time', ['get_current_time', 'convert_time']),
  },
];

const defaultSkills: Skill[] = [
  {
    id: 'skill-summary',
    name: 'Document Summarizer',
    description: 'Condense long documents into executive briefs with key takeaways.',
    instructions: 'Summarize the provided material in 3–5 bullet points, then give one recommendation.',
    enabled: true,
    source: 'builtin',
  },
  {
    id: 'skill-translate',
    name: 'Translator',
    description: 'Translate between English and Chinese with technical terminology preserved.',
    instructions: 'Translate the input preserving technical terms and code identifiers.',
    enabled: true,
    source: 'builtin',
  },
  {
    id: 'skill-code-review',
    name: 'Code Reviewer',
    description: 'Review snippets for bugs, security and style, then suggest fixes.',
    instructions: 'Review code for correctness, security and readability; propose a patch.',
    enabled: false,
    source: 'builtin',
  },
  {
    id: 'skill-report',
    name: 'Report Writer',
    description: 'Turn analysis into structured Markdown reports ready to export.',
    instructions: 'Write a structured Markdown report: overview, findings, actions.',
    enabled: false,
    source: 'builtin',
  },
];

const defaultAgents: Agent[] = [
  {
    id: 'agent-research',
    name: 'Research Assistant',
    emoji: '🔎',
    description: 'Reads sources and web pages, then synthesizes findings with citations.',
    instructions: 'You are a meticulous research assistant. Cite the provided sources.',
    model: null,
    skillIds: ['skill-summary', 'skill-translate'],
    toolIds: ['srv-fetch:fetch-tool-1', 'srv-file:fs-tool-1'],
    enabled: true,
    builtin: true,
  },
  {
    id: 'agent-coder',
    name: 'Code Helper',
    emoji: '🧑‍💻',
    description: 'Reviews diffs, explains errors and drafts patches using file tools.',
    instructions: 'You are a pragmatic programming pair. Prefer minimal, safe changes.',
    model: null,
    skillIds: ['skill-code-review'],
    toolIds: ['srv-file:fs-tool-1', 'srv-file:fs-tool-2'],
    enabled: true,
    builtin: true,
  },
  {
    id: 'agent-writer',
    name: 'Report Writer',
    emoji: '✍️',
    description: 'Composes clean, structured reports from your notes and analyses.',
    instructions: 'Write concise, well-structured deliverables in Markdown.',
    model: null,
    skillIds: ['skill-report'],
    toolIds: [],
    enabled: true,
    builtin: true,
  },
];

function loadPersisted(): PersistedWorkspace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedWorkspace;
    if (
      !parsed ||
      !Array.isArray(parsed.servers) ||
      !Array.isArray(parsed.skills) ||
      !Array.isArray(parsed.agents) ||
      !Array.isArray(parsed.workspaces) ||
      parsed.workspaces.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null; // corrupted state resets to defaults
  }
}

function persist(state: WorkspaceState): void {
  try {
    const snapshot: PersistedWorkspace = {
      servers: state.servers,
      skills: state.skills,
      agents: state.agents,
      hooks: state.hooks,
      instructions: state.instructions,
      workspaces: state.workspaces,
      activeWorkspaceId: state.activeWorkspaceId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // storage may be unavailable; configuration stays in memory
  }
}

const persisted = loadPersisted();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const patchWorkspace = (id: string, patch: Partial<WorkspaceDoc>) => set((state) => ({
    workspaces: state.workspaces.map((workspace) => (workspace.id === id ? { ...workspace, ...patch } : workspace)),
  }));

  return {
    servers: persisted?.servers ?? defaultServers,
    skills: persisted?.skills ?? defaultSkills,
    agents: persisted?.agents ?? defaultAgents,
    hooks: persisted?.hooks ?? [],
    instructions: persisted?.instructions ?? [],
    workspaces: persisted?.workspaces ?? [makeWorkspace()],
    activeWorkspaceId: persisted?.activeWorkspaceId ?? (persisted?.workspaces?.[0]?.id ?? ''),

    // ---- Workspaces ----
    createWorkspace: (name = '') => {
      const workspace = makeWorkspace(name);
      set((state) => ({ workspaces: [...state.workspaces, workspace], activeWorkspaceId: workspace.id }));
      return workspace.id;
    },

    renameWorkspace: (id, name) => patchWorkspace(id, { name: name.trim() }),

    deleteWorkspace: (id) => set((state) => {
      if (state.workspaces.length <= 1) return state; // keep at least one workspace
      const workspaces = state.workspaces.filter((workspace) => workspace.id !== id);
      return {
        workspaces,
        activeWorkspaceId: state.activeWorkspaceId === id ? workspaces[0].id : state.activeWorkspaceId,
      };
    }),

    selectWorkspace: (id) => set({ activeWorkspaceId: id }),

    appendMessage: (workspaceId, message) => set((state) => ({
      workspaces: state.workspaces.map((workspace) =>
        workspace.id === workspaceId
          ? {
              ...workspace,
              messages: [
                ...workspace.messages,
                { ...message, timestamp: message.timestamp ?? Date.now() },
              ],
            }
          : workspace,
      ),
    })),

    clearMessages: (workspaceId) => patchWorkspace(workspaceId, {
      messages: [{ id: 'welcome', role: 'assistant', content: '', timestamp: Date.now() }],
    }),

    bindWorkspaceAgent: (workspaceId, agentId) => patchWorkspace(workspaceId, { agentId }),

    // ---- Hooks / instruction packs ----
    setHookEnabled: (id, enabled) => set((state) => ({
      hooks: state.hooks.map((hook) => (hook.id === id ? { ...hook, enabled } : hook)),
    })),

    setInstructionEnabled: (id, enabled) => set((state) => ({
      instructions: state.instructions.map((pack) => (pack.id === id ? { ...pack, enabled } : pack)),
    })),

    // ---- Market component registration ----
    // Ingests the declarative manifest (`component`) of an installed Explore
    // app into the workspace registry. Component ids are derived from the app
    // id, so re-ingesting the same app is a no-op (idempotent).
    registerAppComponents: (app) => {
      if (!app.install?.installed) return;
      const manifest = app.component;
      const marketId = `mkt-${app.id}`;

      switch (app.kind) {
        case 'mcp':
        case 'tool': {
          const cfg = manifest?.server;
          if (!cfg || get().servers.some((server) => server.id === marketId)) return;
          set((state) => ({
            servers: [
              ...state.servers,
              {
                id: marketId,
                appId: app.id,
                name: app.name,
                description: app.description,
                transport: cfg.transport,
                command: cfg.command,
                args: cfg.args,
                env: cfg.env,
                url: cfg.url,
                enabled: false,
                autoStart: false,
                status: 'stopped',
                tools: (cfg.tools ?? []).map((tool, i) => ({
                  id: `${marketId}-tool-${i + 1}`,
                  name: tool.name,
                  description: tool.description || `${tool.name} tool`,
                  enabled: true,
                })),
              } as McpServer,
            ],
          }));
          return;
        }
        case 'skill': {
          if (get().skills.some((skill) => skill.id === marketId)) return;
          set((state) => ({
            skills: [
              ...state.skills,
              {
                id: marketId,
                appId: app.id,
                name: app.name,
                description: app.description,
                instructions: manifest?.skill?.instructions ?? '',
                enabled: true,
                source: 'local',
              } as Skill,
            ],
          }));
          return;
        }
        case 'agent': {
          if (get().agents.some((agent) => agent.id === marketId)) return;
          set((state) => ({
            agents: [
              ...state.agents,
              {
                id: marketId,
                appId: app.id,
                name: app.name,
                emoji: manifest?.agent?.emoji ?? '🤖',
                description: app.description,
                instructions: manifest?.agent?.instructions ?? '',
                model: null,
                skillIds: manifest?.agent?.skillIds ?? [],
                toolIds: manifest?.agent?.toolIds ?? [],
                enabled: true,
                builtin: false,
              } as Agent,
            ],
          }));
          return;
        }
        case 'hook': {
          if (get().hooks.some((hook) => hook.appId === app.id)) return;
          set((state) => ({
            hooks: [
              ...state.hooks,
              ...(manifest?.hooks ?? []).map((hook, i) => ({
                id: `${marketId}-hook-${i + 1}`,
                appId: app.id,
                name: hook.name,
                description: hook.description ?? app.description,
                event: hook.event,
                enabled: true,
              })),
            ],
          }));
          return;
        }
        case 'instructions': {
          if (get().instructions.some((pack) => pack.id === marketId)) return;
          set((state) => ({
            instructions: [
              ...state.instructions,
              {
                id: marketId,
                appId: app.id,
                name: app.name,
                description: app.description,
                content: manifest?.instructions?.content ?? '',
                enabled: true,
              } as InstructionPack,
            ],
          }));
          return;
        }
        default:
          // `engine` is represented by detected GGUF models; `webui` entries
          // are read straight from the installed app list. Nothing to ingest.
          return;
      }
    },

    // ---- MCP ----
    addServer: (server) => set((state) => ({
      servers: [
        ...state.servers,
        {
          ...server,
          id: `srv-${uid()}`,
          status: server.enabled ? 'connecting' : 'stopped',
          tools:
            server.tools && server.tools.length > 0
              ? server.tools.map((name, i) => ({
                  id: `srv-${uid()}-tool-${i + 1}`,
                  name,
                  description: `${name} tool`,
                  enabled: true,
                }))
              : [],
        } as McpServer,
      ],
    })),

    updateServer: (id, patch) => set((state) => ({
      servers: state.servers.map((server) => (server.id === id ? { ...server, ...patch } : server)),
    })),

    removeServer: (id) => set((state) => ({
      servers: state.servers.filter((server) => server.id !== id),
      agents: state.agents.map((agent) => ({
        ...agent,
        toolIds: agent.toolIds.filter((tool) => !tool.startsWith(`${id}:`)),
      })),
      workspaces: state.workspaces.map((workspace) => ({ ...workspace })),
    })),

    setServerEnabled: (id, enabled) => {
      const { updateServer } = get();
      if (!enabled) {
        updateServer(id, { status: 'stopped' });
        return;
      }
      updateServer(id, { status: 'connecting' });
      setTimeout(() => {
        const server = get().servers.find((item) => item.id === id);
        if (server?.enabled) updateServer(id, { status: 'running' as McpStatus });
      }, CONNECT_DELAY_MS);
    },

    setToolEnabled: (serverId, toolId, enabled) => set((state) => ({
      servers: state.servers.map((server) =>
        server.id === serverId
          ? {
              ...server,
              tools: server.tools.map((tool) => (tool.id === toolId ? { ...tool, enabled } : tool)),
            }
          : server,
      ),
    })),

    // ---- Skills ----
    addSkill: (skill) => set((state) => ({
      skills: [...state.skills, { ...skill, id: `skill-${uid()}`, source: 'custom', enabled: true } as Skill],
    })),
    updateSkill: (id, patch) => set((state) => ({
      skills: state.skills.map((skill) => (skill.id === id ? { ...skill, ...patch } : skill)),
    })),
    removeSkill: (id) => set((state) => ({
      skills: state.skills.filter((skill) => skill.id !== id),
      agents: state.agents.map((agent) => ({ ...agent, skillIds: agent.skillIds.filter((s) => s !== id) })),
      workspaces: state.workspaces.map((workspace) => ({ ...workspace })),
    })),

    // ---- Agents ----
    addAgent: (agent) => set((state) => ({
      agents: [...state.agents, { ...agent, id: `agent-${uid()}`, builtin: false, enabled: true } as Agent],
    })),
    updateAgent: (id, patch) => set((state) => ({
      agents: state.agents.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)),
    })),
    removeAgent: (id) => set((state) => ({
      agents: state.agents.filter((agent) => agent.id !== id),
      workspaces: state.workspaces.map((workspace) => ({
        ...workspace,
        agentId: workspace.agentId === id ? null : workspace.agentId,
      })),
    })),
  };
});

// Persist on every state change.
useWorkspaceStore.subscribe((state) => {
  persist(state);
});
