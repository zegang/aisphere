// Electron main process entry point
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path, { join } from 'path';
import { mkdirSync } from 'fs';
import { registerHandlers } from './ipc/handlers';
import { ExploreService } from './services/ExploreService';
import { AppService } from './services/AppService';
import { SettingService } from './services/SettingService';
import { LogService } from './services/LogService';
import { UTIL_OPEN_PATH } from '../src/shared/channel-types';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { DbStoreService } from './services/DbStoreService';
import { RuntimeService } from './services/RuntimeService';
import { ServiceContainer } from './services/ServiceContainer';
import { ServiceName } from './types/IService';
import { SystemService } from './services/SystemService';
import { SandboxService } from './services/SandboxService';

if (process.platform === 'linux') {
  process.env.DRI_PRIME = '0';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

// App directory
const isDev = !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    title: 'AiSphere',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    // Use VITE_DEV_SERVER_URL if provided by the plugin, otherwise fallback to 127.0.0.1
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initServices(): void {
  ServiceContainer.getInstance().register(ServiceName.LogService, new LogService());
  const logService = ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  logService.info('Running on platform ' + process.platform);
  logService.info('Initializing application services...');
  logService.info('AiSphere Root Director: ' + app.getAppPath());

  // Use userData for persistent storage in production, and app path for development visibility
  const dbRootDir = isDev 
    ? path.join(app.getAppPath(), 'db')
    : path.join(app.getPath('userData'), 'db');

  // Ensure the database directory and default workspace folder exist
  mkdirSync(path.join(dbRootDir, 'default'), { recursive: true });

  logService.info('AiSphere Database Root Director: ' + dbRootDir);
  
  ServiceContainer.getInstance().register(ServiceName.SystemService, new SystemService());
  ServiceContainer.getInstance().register(ServiceName.DbStoreService, new DbStoreService(dbRootDir));
  ServiceContainer.getInstance().register(ServiceName.SettingService, new SettingService());
  ServiceContainer.getInstance().register(ServiceName.SandboxService, new SandboxService());
  ServiceContainer.getInstance().register(ServiceName.RuntimeService, new RuntimeService());
  ServiceContainer.getInstance().register(ServiceName.AppService, new AppService());
  ServiceContainer.getInstance().register(ServiceName.ExploreService, new ExploreService());

  registerHandlers(ipcMain);

  // Register utility handlers
  ipcMain.handle(UTIL_OPEN_PATH, async (_event, target: string) => {
    if (!target) return { success: false, error: 'No target provided' };
    if (target.startsWith('http')) {
      await shell.openExternal(target);
    } else {
      await shell.openPath(target);
    }
    return { success: true };
  });
}

async function shutdownServices() : Promise<void> {
  const logService = ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  logService.info('Shutting down application services...');
  await ServiceContainer.getInstance().shutdownAllService();
}

// App lifecycle
app.whenReady().then(() => {
  initServices();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  } else {
    shutdownServices();
  }
});

app.on('before-quit', () => {
  shutdownServices();
});
