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
export const RUNTIME_INSTALL_ABORT = 'runtime:install:abort' as const;

// Log channels
export const LOG_SEND = 'log:send' as const;

// Utils
export const UTIL_OPEN_PATH = 'util:openPath' as const;

// Explore
export const EXPLORE_LIST = 'explore:list' as const;
export const EXPLORE_DETAIL = 'explore:detail' as const;
export const EXPLORE_INSTALL = 'explore:install' as const;

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
  | typeof SYSTEM_INFO | typeof RUNTIME_CHECK | typeof RUNTIME_INSTALL | typeof RUNTIME_INSTALL_ABORT;

export type LogChannel = typeof LOG_SEND;

export type UtilChannel = typeof UTIL_OPEN_PATH;

export type ExploreChannel = typeof EXPLORE_LIST | typeof EXPLORE_DETAIL | typeof EXPLORE_INSTALL;

export type AllChannels =
  | LogChannel | SettingChannel | AppChannel | ExploreChannel | UtilChannel;
