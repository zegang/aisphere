// All IPC channel type definitions for type-safe communication between main and renderer

// App channels
export const APP_INSTALL = 'app:install' as const;
export const APP_LIST = 'app:list' as const;
export const APP_DETAIL = 'app:detail' as const;
export const APP_CREATE = 'app:create' as const;
export const APP_START = 'app:start' as const;
export const APP_STOP = 'app:stop' as const;
export const APP_DELETE = 'app:delete' as const;
export const APP_UPDATE = 'app:update' as const;
export const APP_STATUS = 'app:status' as const;
export const APP_INSPECT = 'app:inspect' as const;
export const APP_OPEN_INTERACTIVE_SHELL = 'app:openInteractiveShell' as const;

// Settings channels
export const SETTING_LIST = 'setting:list' as const;
export const SETTING_GET = 'setting:get' as const;
export const SETTING_UPDATE = 'setting:update' as const;
export const SETTING_DELETE = 'setting:delete' as const;

// System channels
export const SYSTEM_INFO = 'system:info' as const;
export const RUNTIME_CHECK = 'runtime:check' as const;
export const RUNTIME_INSTALL = 'runtime:install' as const;
export const RUNTIME_UNINSTALL = 'runtime:uninstall' as const;
export const RUNTIME_DETAIL = 'runtime:detail' as const;
export const RUNTIME_ENGINE_STATUS = 'runtime:engine:status' as const;
export const RUNTIME_ENGINE_START = 'runtime:engine:start' as const;
export const RUNTIME_ENGINE_STOP = 'runtime:engine:stop' as const;
export const RUNTIME_INSTALL_ABORT = 'runtime:install:abort' as const;
export const RUNTIME_INSTALL_INPUT = 'runtime:install:input' as const;
export const RUNTIME_INSTALL_RESIZE = 'runtime:install:resize' as const;
/** Returns the last known installation status for every runtime type. */
export const RUNTIME_INSTALL_STATUS = 'runtime:install:status' as const;

export const RUNTIME_CONFIG_EXPORT = 'runtime:config:export' as const;
export const RUNTIME_CONFIG_IMPORT = 'runtime:config:import' as const;

/**
 * Workspace chat proxied to an installed engine app. The request is sent from
 * the main process because the renderer cannot call the local engine directly
 * (CORS / CSP), and only the main process knows the container's host ports.
 */
export const ENGINE_CHAT = 'engine:chat' as const;
/** Main → renderer stream of partial chat tokens (`engine:chat` with a requestId). */
export const ENGINE_CHAT_STREAM = 'engine:chat:stream' as const;

export type RuntimeKind = 'docker' | 'podman' | 'apptainer' | 'conda';
export type RuntimeInstallState = 'starting' | 'downloading' | 'installing' | 'completed' | 'failed' | 'aborted';

/** Whether the runtime CLI and its background engine (daemon) are available. */
export interface RuntimeEngineStatus {
  type: RuntimeKind;
  /** The runtime CLI was found (either in the AiSphere folder or on PATH). */
  installed: boolean;
  /** The engine/daemon is answering. CLI-only runtimes report `true` when installed. */
  running: boolean;
  /** The runtime lives inside the AiSphere data folder and can be uninstalled here. */
  managed: boolean;
  version?: string;
  error?: string;
}

/** Detailed information shown on the runtime details page. */
export interface RuntimeDetail {
  type: RuntimeKind;
  installed: boolean;
  managed: boolean;
  version?: string;
  platform: string;
  arch: string;
  installDir: string;
  installDirExists: boolean;
  executable?: string;
  /** PATH entries owned by this runtime installation. */
  pathEntries: string[];
  engine?: {
    /** Runtimes without a background engine (conda/apptainer) set this to false. */
    hasEngine: boolean;
    running: boolean;
    version?: string;
    info?: Array<{ label: string; value: string }>;
    error?: string;
  };
}

/** Payload pushed on `runtimeInstallStatusChannel(type)` while an install runs. */
export interface RuntimeInstallStatusEvent {
  type: RuntimeKind;
  state: RuntimeInstallState;
  /** Human readable detail, e.g. the installer currently running. */
  message?: string;
  /** Download progress, only present while `state` is `downloading`. */
  percent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  /** Timestamp used to discard out-of-order updates. */
  at: number;
}

export function runtimeInstallStatusChannel(type: string): string {
  return `runtime:install:status:${type}`;
}

export function runtimeInstallOutputChannel(type: string): string {
  return `runtime:install:output:${type}`;
}

// Log channels
export const LOG_SEND = 'log:send' as const;

// Utils
export const UTIL_OPEN_PATH = 'util:openPath' as const;
export const UTIL_SELECT_DIRECTORY = 'util:selectDirectory' as const;

// Explore
export const EXPLORE_LIST = 'explore:list' as const;
export const EXPLORE_DETAIL = 'explore:detail' as const;
export const EXPLORE_INSTALL = 'explore:install' as const;
export const EXPLORE_EXPORT = 'explore:export' as const;
export const EXPLORE_IMPORT = 'explore:import' as const;

/** Export payload: catalog app specs to save. `targetPath` bypasses the native save/folder dialog (automation). */
export interface ExploreExportRequest {
  mode: 'single' | 'folder' | 'zip';
  apps: unknown[];
  targetPath?: string;
}

/** Import payload: `source` picks the native dialog mode; explicit `paths` bypass it (automation). */
export interface ExploreImportRequest {
  source: 'file' | 'folder';
  paths?: string[];
}

export interface ExploreExportResult {
  kind: 'file' | 'folder' | 'zip';
  path: string;
  count: number;
}

export interface ExploreImportResult {
  imported: Array<{ id: string; name: string }>;
  skipped: Array<{ id: string; name: string; reason?: string }>;
}

/**
 * One runtime configuration record (runtime 配置). `autoStart` is the
 * remembered preference from the runtime prompt ('always' | 'never'), or null
 * when never chosen; the remaining fields are informational snapshots taken
 * at export time and are not replayed on import.
 */
export interface RuntimeConfigSpec {
  type: RuntimeKind;
  name: string;
  hasEngine: boolean;
  autoStart: 'always' | 'never' | null;
  installed: boolean;
  managed: boolean;
  version?: string;
}

export interface RuntimeConfigExportRequest {
  mode: 'single' | 'folder' | 'zip';
  /** Bypasses the native save/folder dialog (automation). */
  targetPath?: string;
}

export type RuntimeConfigExportResult = ExploreExportResult;

export interface RuntimeConfigImportRequest {
  source: 'file' | 'folder';
  /** Explicit spec paths (files, a folder or a .zip) bypass the native dialog. */
  paths?: string[];
}

export interface RuntimeConfigImportResult {
  imported: Array<{ type: string; name: string; autoStart: string | null }>;
  skipped: Array<{ type: string; reason?: string }>;
}

/** One message in an engine chat request (OpenAI chat-completions shape). */
export interface EngineChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface EngineChatRequest {
  /** Installed engine app (`Application.id`) that serves the model. */
  appId: string;
  messages: EngineChatMessage[];
  /** When set, the answer is also streamed on `ENGINE_CHAT_STREAM`. */
  requestId?: string;
}

/** One streamed piece of an engine answer (OpenAI delta shape). */
export interface EngineChatStreamEvent {
  requestId: string;
  /** Visible answer text appended since the previous event. */
  delta?: string;
  /** Chain-of-thought text (DeepSeek-R1 class models). */
  reasoning?: string;
  /** Final marker: the full answer is available in `content`. */
  done?: boolean;
  /** Failure message when the stream could not be completed. */
  error?: string;
  content?: string;
  model?: string;
  endpoint?: string;
}

export interface EngineChatResult {
  /** Assistant reply returned by the engine. */
  content: string;
  /** Model name reported by the engine, when present. */
  model?: string;
  /** Base URL that answered (e.g. http://127.0.0.1:8091). */
  endpoint: string;
}

// Generic response/error wrapper
export interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// All channel name union
export type AppChannel =
  | typeof APP_INSTALL | typeof APP_LIST | typeof APP_DETAIL | typeof APP_CREATE
  | typeof APP_START | typeof APP_STOP | typeof APP_DELETE
  | typeof APP_UPDATE | typeof APP_STATUS;


export type SettingChannel =
  | typeof SETTING_LIST | typeof SETTING_GET
  | typeof SETTING_UPDATE | typeof SETTING_DELETE;

export type SystemChannel =
  | typeof SYSTEM_INFO | typeof RUNTIME_CHECK | typeof RUNTIME_INSTALL | typeof RUNTIME_UNINSTALL
  | typeof RUNTIME_DETAIL | typeof RUNTIME_ENGINE_STATUS | typeof RUNTIME_ENGINE_START | typeof RUNTIME_ENGINE_STOP
  | typeof RUNTIME_INSTALL_ABORT | typeof RUNTIME_INSTALL_INPUT | typeof RUNTIME_INSTALL_RESIZE
  | typeof RUNTIME_INSTALL_STATUS
  | typeof RUNTIME_CONFIG_EXPORT | typeof RUNTIME_CONFIG_IMPORT
  | typeof ENGINE_CHAT;

export type LogChannel = typeof LOG_SEND;

export type UtilChannel = typeof UTIL_OPEN_PATH | typeof UTIL_SELECT_DIRECTORY;

export type ExploreChannel =
  | typeof EXPLORE_LIST | typeof EXPLORE_DETAIL | typeof EXPLORE_INSTALL
  | typeof EXPLORE_EXPORT | typeof EXPLORE_IMPORT;

export type AllChannels =
  | LogChannel | SettingChannel | AppChannel | ExploreChannel | UtilChannel;
