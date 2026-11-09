import type { APP_INSPECT, APP_OPEN_INTERACTIVE_SHELL, APP_SHUTDOWN_PROGRESS, AppInstallControlRequest, AppInstallControlResult, ENGINE_CHAT, EngineChatRequest, EngineChatResult, IpcResponse, RUNTIME_CHECK, RUNTIME_CONFIG_EXPORT, RUNTIME_CONFIG_IMPORT, RUNTIME_DETAIL, RUNTIME_ENGINE_START, RUNTIME_ENGINE_STATUS, RUNTIME_ENGINE_STOP, RUNTIME_INSTALL, RUNTIME_INSTALL_ABORT, RUNTIME_INSTALL_STATUS, RUNTIME_UNINSTALL, RuntimeConfigExportRequest, RuntimeConfigExportResult, RuntimeConfigImportRequest, RuntimeConfigImportResult, RuntimeDetail, RuntimeEngineStatus, RuntimeInstallStatusEvent, RemoteAccessStatus } from '@/shared/channel-types';
import {
  APP_LIST, APP_DETAIL, APP_CREATE, APP_START, APP_STOP, APP_DELETE, APP_UPDATE, APP_STATUS,
  TERMINAL_INIT, TERMINAL_LOGS, TERMINAL_INPUT, TERMINAL_RESIZE, TERMINAL_CLOSE,
  SETTING_LIST,
  SETTING_GET,
  SETTING_UPDATE,
  SETTING_DELETE,
  AllChannels,
  EXPLORE_DETAIL, EXPLORE_INSTALL, EXPLORE_INSTALL_CONTROL, EXPLORE_LIST, EXPLORE_EXPORT, EXPLORE_IMPORT,
  ExploreExportRequest, ExploreExportResult, ExploreImportRequest, ExploreImportResult,
  SYSTEM_INFO,
  REMOTE_ACCESS_STATUS,
  UTIL_OPEN_PATH, UTIL_SELECT_DIRECTORY,
  LAN_NAS_STATUS, LAN_NAS_START, LAN_NAS_STOP,
  LanNasStartRequest, LanNasStartResult, LanNasStatus,
} from '@/shared/channel-types';
import type {
  AppUpdateRequest,
  AppStartResult,
  AppStopResult,
  AppDetailResponse,
  AppListResponse,
  SettingsListResponse,
  SettingsUpdateRequest,
  ApplicationSpec,
  InstalledApplication,
  AppDeleteResult,
  LifecycleActionRun,
  SystemInfoResponse,
} from './api';

export type ElectronInvokePayloadMap = {
  [APP_LIST]: undefined;
  [APP_DETAIL]: string;
  [APP_CREATE]: InstalledApplication;
  [APP_START]: string;
  [APP_STOP]: string;
  [APP_DELETE]: string;
  [TERMINAL_INIT]: string;
  [TERMINAL_LOGS]: string;
  [TERMINAL_INPUT]: { id: string; data: string };
  [TERMINAL_RESIZE]: { id: string; cols: number; rows: number };
  [TERMINAL_CLOSE]: string;
  [APP_OPEN_INTERACTIVE_SHELL]: string;
  [APP_STATUS]: string;
  [APP_INSPECT]: string;
  [APP_UPDATE]: AppUpdateRequest;

  [SETTING_LIST]: undefined;
  [SETTING_GET]: string;
  [SETTING_UPDATE]: SettingsUpdateRequest;
  [SETTING_DELETE]: string;

  [EXPLORE_LIST]: undefined;
  [EXPLORE_DETAIL]: string;
  [EXPLORE_INSTALL]: ApplicationSpec;
  [EXPLORE_INSTALL_CONTROL]: AppInstallControlRequest;
  [EXPLORE_EXPORT]: ExploreExportRequest;
  [EXPLORE_IMPORT]: ExploreImportRequest;

  [SYSTEM_INFO]: undefined;
  [REMOTE_ACCESS_STATUS]: undefined;

  [RUNTIME_CHECK]: undefined;
  [RUNTIME_INSTALL]: string;
  [RUNTIME_UNINSTALL]: string;
  [RUNTIME_DETAIL]: string;
  [RUNTIME_ENGINE_STATUS]: string;
  [RUNTIME_ENGINE_START]: string;
  [RUNTIME_ENGINE_STOP]: string;
  [RUNTIME_INSTALL_ABORT]: string;
  [RUNTIME_INSTALL_STATUS]: undefined;
  [RUNTIME_CONFIG_EXPORT]: RuntimeConfigExportRequest;
  [RUNTIME_CONFIG_IMPORT]: RuntimeConfigImportRequest;

  [ENGINE_CHAT]: EngineChatRequest;

  [UTIL_OPEN_PATH]: string;
  [UTIL_SELECT_DIRECTORY]: string | undefined;

  [LAN_NAS_STATUS]: undefined;
  [LAN_NAS_START]: LanNasStartRequest;
  [LAN_NAS_STOP]: undefined;
};

export type ElectronInvokeResponseMap = {
  [APP_LIST]: IpcResponse<AppListResponse>;
  [APP_DETAIL]: IpcResponse<AppDetailResponse>;
  [APP_CREATE]: IpcResponse<{ id: string }>;
  [APP_START]: IpcResponse<AppStartResult>;
  [APP_STOP]: IpcResponse<AppStopResult>;
  [APP_DELETE]: IpcResponse<AppDeleteResult>;
  [TERMINAL_INIT]: IpcResponse<undefined>;
  [TERMINAL_LOGS]: IpcResponse<undefined>;
  [TERMINAL_INPUT]: IpcResponse<undefined>;
  [TERMINAL_RESIZE]: IpcResponse<undefined>;
  [TERMINAL_CLOSE]: IpcResponse<undefined>;
  [APP_OPEN_INTERACTIVE_SHELL]: IpcResponse<undefined>;
  [APP_STATUS]: IpcResponse<{ status: string }>;
  [APP_INSPECT]: IpcResponse<any>;
  [APP_UPDATE]: IpcResponse<undefined>;

  [SETTING_LIST]: IpcResponse<SettingsListResponse>;
  [SETTING_GET]: IpcResponse<{ value: unknown }>;
  [SETTING_UPDATE]: IpcResponse<undefined>;
  [SETTING_DELETE]: IpcResponse<undefined>;

  [EXPLORE_LIST]: IpcResponse<{ apps: any[] }>;
  [EXPLORE_DETAIL]: IpcResponse<{ app: any }>;
  [EXPLORE_INSTALL]: IpcResponse<InstalledApplication>;
  [EXPLORE_INSTALL_CONTROL]: IpcResponse<AppInstallControlResult>;
  [EXPLORE_EXPORT]: IpcResponse<ExploreExportResult>;
  [EXPLORE_IMPORT]: IpcResponse<ExploreImportResult>;

  [SYSTEM_INFO]: IpcResponse<SystemInfoResponse>;
  [REMOTE_ACCESS_STATUS]: IpcResponse<RemoteAccessStatus>;

  [RUNTIME_CHECK]: IpcResponse<{ runtimes: { type: string; installed: boolean; managed?: boolean; version?: string }[] }>;
  [RUNTIME_INSTALL]: IpcResponse<{ lifecycleRuns?: LifecycleActionRun[] }>;
  [RUNTIME_UNINSTALL]: IpcResponse<{ lifecycleRuns?: LifecycleActionRun[] }>;
  [RUNTIME_DETAIL]: IpcResponse<RuntimeDetail>;
  [RUNTIME_ENGINE_STATUS]: IpcResponse<RuntimeEngineStatus>;
  [RUNTIME_ENGINE_START]: IpcResponse<RuntimeEngineStatus>;
  [RUNTIME_ENGINE_STOP]: IpcResponse<RuntimeEngineStatus & { lifecycleRuns?: LifecycleActionRun[] }>;
  [RUNTIME_INSTALL_ABORT]: IpcResponse<undefined>;
  [RUNTIME_INSTALL_STATUS]: IpcResponse<{ statuses: RuntimeInstallStatusEvent[] }>;
  [RUNTIME_CONFIG_EXPORT]: IpcResponse<RuntimeConfigExportResult>;
  [RUNTIME_CONFIG_IMPORT]: IpcResponse<RuntimeConfigImportResult>;

  [ENGINE_CHAT]: IpcResponse<EngineChatResult>;

  [UTIL_OPEN_PATH]: IpcResponse<undefined>;
  [UTIL_SELECT_DIRECTORY]: IpcResponse<{ path: string }>;

  [LAN_NAS_STATUS]: IpcResponse<LanNasStatus>;
  [LAN_NAS_START]: IpcResponse<LanNasStartResult>;
  [LAN_NAS_STOP]: IpcResponse<undefined>;
};

export interface ElectronAPI {
  invoke<Channel extends keyof ElectronInvokePayloadMap>(
    channel: Channel,
    payload?: ElectronInvokePayloadMap[Channel],
  ): Promise<ElectronInvokeResponseMap[Channel]>;
  send: (channel: string, payload?: unknown) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
}

export type ElectronChannel = keyof ElectronInvokePayloadMap | AllChannels;
