// Shared API types for IPC communication
import type { AppInstallStatus, LanNasConfig } from '@/shared/channel-types';

// --- App ---
export interface AppListResponse { apps: Application[] }
export interface AppDetailResponse { app: AppListItem }
export interface AppCreateRequest { name: string }
export interface AppStartRequest { id: string }
export interface AppStopRequest { id: string }
export interface AppDeleteRequest { id: string }
export interface AppUpdateRequest { id: string; config: Record<string, unknown> }

export interface AppListItem {
  id: string;
  name: string;
  description: string;
  version: string;
  status: string;
  install_type: string;
  path: string | null;
  config: Record<string, unknown>;
  installed_at: string;
  updated_at: string;
}

// --- Settings ---
export interface SettingsListResponse { settings: SettingItem[] }
export interface SettingsGetRequest { key: string }
export interface SettingsGetResponse { value: unknown }
export interface SettingsUpdateRequest { key: string; value: unknown }
export interface SettingsDeleteRequest { key: string }

export interface SettingItem {
  key: string;
  value: unknown;
}

// --- Exploer ---

export interface AppTask {
  id: string;
  rc: string;
  options?: string[];
  startscript?: string;
  args?: string[];
  status: 'starting' | 'running' | 'pausing' | 'paused' | 'stopping' | 'stopped' | 'failed' | 'uninstalling' | 'installing' | 'unknown';
  hostPorts?: Record<string, string>;
}

export interface AppRuntime {
  runtime: 'apptainer' | 'docker' | 'podman' | 'native' | 'conda';
  /** Container image reference (Docker/Podman), e.g. ghcr.io/org/image:tag. */
  image?: string;
  install?: string[];
  options?: string[];
  startscript?: string;
  args?: string[];
}

export type LifecycleAction =
  | {
      id: string;
      type: 'docker-log-credentials';
      patterns: string[];
      tailLines?: number;
    }
  | {
      id: string;
      type: 'windows-firewall';
      operation: 'ensure' | 'remove';
      port: number;
      ruleName: string;
      profile: 'private';
      remoteAddress: 'localsubnet';
    };

export interface LifecycleActionHooks {
  postInstallActions?: LifecycleAction[];
  postStopActions?: LifecycleAction[];
  postUnInstallActions?: LifecycleAction[];
}

export interface LifecycleActionResult {
  id: string;
  status: 'completed' | 'skipped' | 'failed';
  message: string;
}

export type LifecycleActionHook = keyof LifecycleActionHooks;

export interface LifecycleActionRun {
  hook: LifecycleActionHook;
  results: LifecycleActionResult[];
}

export interface AppStartResult {
  task?: AppTask;
  lifecycleRuns?: LifecycleActionRun[];
}

export interface AppStopResult {
  lifecycleRuns?: LifecycleActionRun[];
}

export interface AppDeleteResult {
  lifecycleRuns?: LifecycleActionRun[];
}

// --- Explore kinds: what a catalog entry provides to the workspace ---

/**
 * Kinds follow the industry component model for AI workstations:
 * - `engine`       LLM inference engine exposing an OpenAI-compatible API
 *                  (llama.cpp, Ollama, vLLM…), models auto-detected from packages
 * - `webui`        chat web front-end (Open WebUI …) openable in the workspace web view
 * - `agent`        agent profile (VS Code / Claude subagent convention)
 * - `skill`        agent skill pack (Anthropic SKILL.md convention)
 * - `hook`         lifecycle hooks (session-start / message-send / assistant-reply / tool-call)
 * - `instructions` global instruction pack (AGENTS.md convention)
 * - `tool`         local tool pack exposed through the workspace tools menu
 * - `mcp`          MCP server (Model Context Protocol)
 * - `app`          plain runnable application
 */
export type AppKind =
  | 'engine'
  | 'webui'
  | 'agent'
  | 'skill'
  | 'hook'
  | 'tool'
  | 'instructions'
  | 'mcp'
  | 'app';

export type HookEvent = 'session-start' | 'message-send' | 'assistant-reply' | 'tool-call';

export interface HookDefinition {
  event: HookEvent;
  name: string;
  description?: string;
}

/**
 * Declarative manifest describing what gets registered in the workspace after
 * the app is installed. Only the section matching `kind` is consumed.
 */
export interface AppComponentManifest {
  /** kinds `mcp` / `tool`: server definition registered in the workspace. */
  server?: {
    transport: 'stdio' | 'http' | 'sse' | 'local';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    tools?: Array<{ name: string; description: string }>;
  };
  /** kind `skill`: instruction the model receives while the skill is active. */
  skill?: { instructions: string };
  /** kind `agent`: agent profile payload. `skillIds` may reference other installed skills. */
  agent?: { emoji?: string; instructions?: string; skillIds?: string[]; toolIds?: string[] };
  /** kind `hook`: hook definitions registered on the workspace lifecycle events. */
  hooks?: HookDefinition[];
  /** kind `instructions`: AGENTS.md-style instruction content. */
  instructions?: { content: string };
}

export interface Application extends LifecycleActionHooks {
  id: string;
  /** Stable catalog ID for installed apps, whose `id` is a generated instance UUID. */
  catalogId?: string;
  name: string;
  org: string;
  version: string;
  url?: string;
  icon?: string;
  description: string;
  category: string;
  type: 'llm' | 'tool' | 'agent' | 'dataset' | 'other';
  runtime: AppRuntime;
  labels: string[];
  requirements: {
    platform: 'windows' | 'linux' | 'mac' | 'any';
    cpu: string;
    memory: string;
    storage: string;
    gpu: string;
  };
  packages: string[];
  /** Workspace capability provided by this catalog entry (default `app`). */
  kind?: AppKind;
  /** Declarative manifest consumed by the workspace after installation. */
  component?: AppComponentManifest;
  install?: {
    installed: boolean;
    status?: AppInstallStatus;
    installed_at?: string;
    installed_by?: string;
    installed_package?: string;
    installed_image?: string;
  };
  apphomedir?: string,
  status?: string;
  task?: AppTask;
  error?: string;
  lanNasConfig?: LanNasConfig;
  [key: string]: unknown;
}

// --- System ---
export interface SystemInfoResponse {
  data_path: string;
  llm_path: string;
  chat_path: string;
  download_path: string;
  platform: string;
  os_type: string;
  release: string;
  arch: string;
  cpus: {
    model: string;
    speed: number;
  }[];
  gpus: {
    model: string;
    vendor?: string;
  }[];
  disks: {
    name: string;
    mount: string;
    size: number;
    free: number;
  }[];
  memory: {
    total: number;
    free: number;
  };
}