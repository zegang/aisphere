// Shared API types for IPC communication
import type { AppInstallStatus, LanNasConfig } from '@/shared/channel-types';

// --- App ---
export interface AppListResponse { apps: InstalledApplication[] }
export interface AppDetailResponse { app: AppListItem }
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
  hook: LifecycleActionHook | string;
  results: LifecycleActionResult[];
}

/**
 * Application lifecycle hooks aligned with `resources/schema/application-spec.schema.json`.
 * Current builds execute the legacy `post*Actions` fields; the remaining phases
 * are reserved so specs can declare them without a future type change.
 */
export interface LifecycleHooks {
  preInstall?: LifecycleAction[];
  install?: LifecycleAction[];
  postInstall?: LifecycleAction[];
  preStart?: LifecycleAction[];
  starting?: LifecycleAction[];
  postStart?: LifecycleAction[];
  preStop?: LifecycleAction[];
  stopping?: LifecycleAction[];
  postStop?: LifecycleAction[];
  preUninstall?: LifecycleAction[];
  uninstalling?: LifecycleAction[];
  postUninstall?: LifecycleAction[];
  preUpdate?: LifecycleAction[];
  update?: LifecycleAction[];
  postUpdate?: LifecycleAction[];
  preRestart?: LifecycleAction[];
  restarting?: LifecycleAction[];
  postRestart?: LifecycleAction[];
  [phase: string]: LifecycleAction[] | undefined;
}

export interface AppAuthor {
  name: string;
  email?: string;
  url?: string;
  [key: string]: unknown;
}

export type ApplicationIcon =
  | string
  | { type: 'unicode' | 'emoji'; value: string }
  | { type: 'image' | 'svg'; src: string; alt?: string }
  | { type: 'lucide'; name: string };

export interface AppInstallScript {
  file: string;
  interpreter?: 'auto' | 'powershell' | 'cmd' | 'bash' | 'sh' | 'custom';
  command?: string;
  args?: string[];
  workingDirectory?: string;
  environment?: Record<string, string | number | boolean>;
  timeoutSeconds?: number;
  elevated?: boolean;
  [key: string]: unknown;
}

/**
 * Normalized installation plan. Current AiSphere installs from `packages` and
 * `runtime`; this describes the same strategy for newer specs.
 */
export interface AppInstallation {
  method?: 'auto' | 'packages' | 'container' | 'script' | 'native' | 'conda';
  packages?: string[];
  image?: string;
  script?: AppInstallScript;
  workingDirectory?: string;
  environment?: Record<string, string | number | boolean>;
  timeoutSeconds?: number;
  [key: string]: unknown;
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
    provider?: 'filesystem-image';
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

/**
 * Portable application specification (catalog manifest).
 *
 * This is the unit written by Explore > Export and read by Explore > Import.
 * It describes what the application is and how to install/run it, but carries
 * no state from a particular machine. Persisted installations are modelled by
 * {@link InstalledApplication}, which extends this spec with runtime state.
 *
 * Mirrors `resources/schema/application-spec.schema.json`.
 */
export interface ApplicationSpec extends LifecycleActionHooks {
  id: string;
  name: string;
  org: string;
  /** Optional structured publisher, preferred for new specs; `org` stays for compatibility. */
  author?: string | AppAuthor;
  version: string;
  url?: string;
  homepage?: string;
  license?: string;
  icon?: ApplicationIcon;
  description: string;
  /** Longer Markdown notes or setup hints shown to the user. */
  notes?: string;
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
    arch?: 'x64' | 'arm64' | 'any';
  };
  packages: string[];
  /** Normalized installation plan; current builds derive install behavior from `runtime` and `packages`. */
  installation?: AppInstallation;
  /** Workspace capability provided by this catalog entry (default `app`). */
  kind?: AppKind;
  /** Declarative manifest consumed by the workspace after installation. */
  component?: AppComponentManifest;
  /** Model capabilities that affect Workspace request construction. */
  capabilities?: { toolCalling?: boolean };
  /** Cross-platform application lifecycle hooks; legacy `post*Actions` fields are aliases. */
  lifecycle?: LifecycleHooks;
  /** Version of the application-specification format. */
  specVersion?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Vendor or future extensions that do not map to a first-class field. */
  extensions?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Installation state persisted for a single installed application instance. */
export interface AppInstallState {
  installed: boolean;
  status?: AppInstallStatus;
  installed_at?: string;
  installed_by?: string;
  /** Downloaded model/archive path, or the installed container image when no package was downloaded. */
  installed_package?: string;
  /** Container image recorded after installation. */
  installed_image?: string;
  [key: string]: unknown;
}

/**
 * Installed application record (persistence and runtime unit).
 *
 * Extends the portable spec with machine-local state. This is what `APP_LIST`
 * returns and what the app/runtime services act on. `id` is the instance id;
 * `catalogId` links back to the originating {@link ApplicationSpec} when the
 * instance id was generated. Legacy records without `catalogId` use `id` as the
 * catalog key, which is why the field stays optional.
 *
 * Mirrors `resources/schema/installed-application.schema.json`.
 */
export interface InstalledApplication extends ApplicationSpec {
  /** Catalog ID of the spec this instance was installed from. */
  catalogId?: string;
  /** Installation state. Always present on records written by current builds. */
  install: AppInstallState;
  /** Per-instance application home directory. */
  apphomedir?: string;
  /** Last recorded application status (for example `uninstalling`). */
  status?: string;
  /** Live or last known runtime task. */
  task?: AppTask;
  /** Last installation or start error. */
  error?: string;
  /** Configuration of the built-in LAN NAS application. */
  lanNasConfig?: LanNasConfig;
}

/**
 * View model for one row in the Explore catalog: a portable spec enriched with
 * this machine's installation state. Only the Explore UI consumes this shape;
 * install requests still send the underlying spec.
 */
export interface ExploreApplication extends ApplicationSpec {
  catalogId?: string;
  install?: AppInstallState;
  apphomedir?: string;
  status?: string;
  task?: AppTask;
  error?: string;
  lanNasConfig?: LanNasConfig;
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