import type { APP_INSPECT, APP_OPEN_INTERACTIVE_SHELL, IpcResponse, RUNTIME_CHECK, RUNTIME_CONFIG_EXPORT, RUNTIME_CONFIG_IMPORT, RUNTIME_DETAIL, RUNTIME_ENGINE_START, RUNTIME_ENGINE_STATUS, RUNTIME_ENGINE_STOP, RUNTIME_INSTALL, RUNTIME_INSTALL_ABORT, RUNTIME_INSTALL_STATUS, RUNTIME_UNINSTALL, RuntimeConfigExportRequest, RuntimeConfigExportResult, RuntimeConfigImportRequest, RuntimeConfigImportResult, RuntimeDetail, RuntimeEngineStatus, RuntimeInstallStatusEvent } from '@/shared/channel-types';
import {
  APP_LIST, APP_DETAIL, APP_CREATE, APP_START, APP_STOP, APP_DELETE, APP_UPDATE, APP_STATUS,
  SETTING_LIST,
  SETTING_GET,
  SETTING_UPDATE,
  SETTING_DELETE,
  AllChannels,
  EXPLORE_DETAIL, EXPLORE_INSTALL, EXPLORE_LIST, EXPLORE_EXPORT, EXPLORE_IMPORT,
  ExploreExportRequest, ExploreExportResult, ExploreImportRequest, ExploreImportResult,
  SYSTEM_INFO,
  UTIL_OPEN_PATH, UTIL_SELECT_DIRECTORY,
} from '@/shared/channel-types';
import type {
  AppCreateRequest,
  AppUpdateRequest,
  AppDetailResponse,
  AppListResponse,
  SettingsListResponse,
  SettingsUpdateRequest,
  Application,
  SystemInfoResponse,
} from './api';

export type ElectronInvokePayloadMap = {
  [APP_LIST]: undefined;
  [APP_DETAIL]: string;
  [APP_CREATE]: AppCreateRequest;
  [APP_START]: string;
  [APP_STOP]: string;
  [APP_DELETE]: string;
  ['terminal:init']: string;
  ['terminal:input']: { id: string; data: string };
  ['terminal:resize']: { id: string; cols: number; rows: number };
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
  [EXPLORE_INSTALL]: Application;
  [EXPLORE_EXPORT]: ExploreExportRequest;
  [EXPLORE_IMPORT]: ExploreImportRequest;

  [SYSTEM_INFO]: undefined;

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

  [UTIL_OPEN_PATH]: string;
  [UTIL_SELECT_DIRECTORY]: string | undefined;
};

export type ElectronInvokeResponseMap = {
  [APP_LIST]: IpcResponse<AppListResponse>;
  [APP_DETAIL]: IpcResponse<AppDetailResponse>;
  [APP_CREATE]: IpcResponse<{ id: string }>;
  [APP_START]: IpcResponse<undefined>;
  [APP_STOP]: IpcResponse<undefined>;
  [APP_DELETE]: IpcResponse<undefined>;
  ['terminal:init']: IpcResponse<undefined>;
  ['terminal:input']: IpcResponse<undefined>;
  ['terminal:resize']: IpcResponse<undefined>;
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
  [EXPLORE_INSTALL]: IpcResponse<Application>;
  [EXPLORE_EXPORT]: IpcResponse<ExploreExportResult>;
  [EXPLORE_IMPORT]: IpcResponse<ExploreImportResult>;

  [SYSTEM_INFO]: IpcResponse<SystemInfoResponse>;

  [RUNTIME_CHECK]: IpcResponse<{ runtimes: { type: string; installed: boolean; managed?: boolean; version?: string }[] }>;
  [RUNTIME_INSTALL]: IpcResponse<undefined>;
  [RUNTIME_UNINSTALL]: IpcResponse<undefined>;
  [RUNTIME_DETAIL]: IpcResponse<RuntimeDetail>;
  [RUNTIME_ENGINE_STATUS]: IpcResponse<RuntimeEngineStatus>;
  [RUNTIME_ENGINE_START]: IpcResponse<RuntimeEngineStatus>;
  [RUNTIME_ENGINE_STOP]: IpcResponse<RuntimeEngineStatus>;
  [RUNTIME_INSTALL_ABORT]: IpcResponse<undefined>;
  [RUNTIME_INSTALL_STATUS]: IpcResponse<{ statuses: RuntimeInstallStatusEvent[] }>;
  [RUNTIME_CONFIG_EXPORT]: IpcResponse<RuntimeConfigExportResult>;
  [RUNTIME_CONFIG_IMPORT]: IpcResponse<RuntimeConfigImportResult>;

  [UTIL_OPEN_PATH]: IpcResponse<undefined>;
  [UTIL_SELECT_DIRECTORY]: IpcResponse<{ path: string }>;
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
