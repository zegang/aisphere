// Shared API types for IPC communication

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
  install?: string[];
  options?: string[];
  startscript?: string;
  args?: string[];
}

export interface Application {
  id: string;
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
  install?: {
    installed: boolean;
    installed_at: string;
    installed_by?: string;
    installed_package: string;
    installed_image?: string;
  };
  apphomedir?: string,
  status?: string;
  task?: AppTask;
  error?: string;
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