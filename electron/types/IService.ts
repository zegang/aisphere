
export enum ServiceName {
  LogService = 'LogServcie',
  SystemService = 'SystemService',
  DbStoreService = 'DbStoreService',
  SettingService = 'SettingService',
  RuntimeService = 'RuntimeService',
  AppService = 'AppService',
  ExploreService = 'ExploreService',
  LanNasService = 'LanNasService',
  SandboxService = 'SandboxService',
  EnvService = 'EnvService',
  AiServerManager = 'AiServerManager',
  LlmManager = 'LlmManager',
  ChatManager = 'ChatManager',
  AiProviderManager = 'AiProviderManager',
  DownloadManager = 'DownloadManager',
  ConfigFileManager = 'ConfigFileManager',
}

export interface Service {
  name?: string;
  init?(): void | Promise<void>;
  shutdown?(): void | Promise<void>;
}
