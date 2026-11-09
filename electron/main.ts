// Electron main process entry point
import { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, nativeImage, type OpenDialogOptions } from 'electron';
import path, { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { registerHandlers } from './ipc/handlers';
import { ExploreService } from './services/ExploreService';
import { AppService } from './services/AppService';
import { SettingService } from './services/SettingService';
import { LogService } from './services/LogService';
import { APP_SHUTDOWN_PROGRESS, UTIL_OPEN_PATH, UTIL_SELECT_DIRECTORY, type AppShutdownProgressEvent } from '../src/shared/channel-types';
import { SettingKey } from '../src/shared/types';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { DbStoreService } from './services/DbStoreService';
import { RuntimeService } from './services/RuntimeService';
import { ServiceContainer } from './services/ServiceContainer';
import { ServiceName } from './types/IService';
import { SystemService } from './services/SystemService';
import { SandboxService } from './services/SandboxService';
import { LanNasService } from './services/LanNasService';
import { RemoteAccessService } from './services/RemoteAccessService';
import { captureRemoteIpcHandlers } from './utils/remote-ipc-registry';
import { getDataRootDir } from './utils/app-paths';

if (process.platform === 'linux') {
  process.env.DRI_PRIME = '0';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
// Distinguishes "user closed the window" (hide to tray) from "app is quitting".
let isQuitting = false;
let shutdownInProgress = false;
let servicesInitialized = false;

// App directory
const isDev = !app.isPackaged;

// Windows groups the window with the taskbar entry (and shows its icon
// correctly at small sizes) through the AppUserModelID, which must match the
// appId used by electron-builder.
if (process.platform === 'win32') {
  app.setAppUserModelId('io.aisphere');
}

function getTrayIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icons', 'icon.png')
    : join(__dirname, '..', 'resources', 'icons', 'icon.png');
}

function getWindowIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icons', 'icon.ico')
    : join(__dirname, '..', 'resources', 'icons', 'icon.ico');
}

function showMainWindow(): void {
  if (!app.isReady()) {
    return;
  }
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  if (tray) return;

  const iconPath = getTrayIconPath();
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.warn(`Tray icon not found at ${iconPath}`);
  } else {
    // Notification-area icons are tiny; downscale the 256px source here so the
    // tray shows crisp artwork instead of a shell-scaled render.
    icon = icon.resize({ width: 16, height: 16, quality: 'best' });
  }

  tray = new Tray(icon);
  tray.setToolTip('AiSphere');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open AiSphere', click: showMainWindow },
    { type: 'separator' },
    {
      label: 'Quit AiSphere',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));

  // Clicking the tray icon restores the window, like a taskbar entry.
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    titleBarStyle: 'default',
    title: 'AiSphere',
    icon: getWindowIconPath(),
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

  mainWindow.on('close', (event) => {
    if (shutdownInProgress) {
      event.preventDefault();
      return;
    }
    // Closing the window hides the app to the system tray instead of quitting.
    // The tray menu (or a second launch) brings the window back.
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function initServices(): Promise<void> {
  captureRemoteIpcHandlers();
  ServiceContainer.getInstance().register(ServiceName.LogService, new LogService());
  const logService = ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  logService.info('Running on platform ' + process.platform);
  logService.info('Initializing application services...');
  logService.info('AiSphere Root Director: ' + app.getAppPath());

  // Development keeps data beside the sources for visibility; packaged builds
  // must use userData because the app itself lives in a read-only asar archive.
  const dbRootDir = path.join(getDataRootDir(), 'db');

  // Ensure the database directory and default workspace folder exist
  mkdirSync(path.join(dbRootDir, 'default'), { recursive: true });

  logService.info('AiSphere Database Root Director: ' + dbRootDir);
  
  ServiceContainer.getInstance().register(ServiceName.SystemService, new SystemService());
  ServiceContainer.getInstance().register(ServiceName.DbStoreService, new DbStoreService(dbRootDir));
  ServiceContainer.getInstance().register(ServiceName.SettingService, new SettingService());
  ServiceContainer.getInstance().register(ServiceName.SandboxService, new SandboxService());
  ServiceContainer.getInstance().register(ServiceName.RuntimeService, new RuntimeService());
  ServiceContainer.getInstance().register(ServiceName.AppService, new AppService());
  ServiceContainer.getInstance().register(ServiceName.LanNasService, new LanNasService());
  ServiceContainer.getInstance().register(ServiceName.ExploreService, new ExploreService());
  const remoteAccessService = new RemoteAccessService();
  ServiceContainer.getInstance().register(ServiceName.RemoteAccessService, remoteAccessService);
  const exploreService = ServiceContainer.getInstance().get<ExploreService>(ServiceName.ExploreService);
  const runtimeService = ServiceContainer.getInstance().get<RuntimeService>(ServiceName.RuntimeService);
  const sendShutdownProgress = (progress: AppShutdownProgressEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(APP_SHUTDOWN_PROGRESS, progress);
    }
  };
  runtimeService.setShutdownProgressHandler(sendShutdownProgress);
  exploreService.setShutdownProgressHandler(sendShutdownProgress);

  registerHandlers(ipcMain);
  const startRemoteAccess = remoteAccessService.start();

  const settingService = ServiceContainer.getInstance().get(ServiceName.SettingService) as SettingService;

  // Register utility handlers
  ipcMain.handle(UTIL_OPEN_PATH, async (_event, target: string) => {
    if (!target) return { success: false, error: 'No target provided' };
    try {
      if (target.startsWith('http')) {
        await shell.openExternal(target);
        return { success: true };
      }
      const openError = await shell.openPath(target);
      return openError ? { success: false, error: openError } : { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle(UTIL_SELECT_DIRECTORY, async (_event, defaultPath?: string) => {
    // Windows shows an error dialog for a missing default path, so only pass it
    // when the directory really exists; otherwise the picker opens at its own
    // last-used/start location.
    const usableDefaultPath =
      typeof defaultPath === 'string' && defaultPath.trim() && existsSync(defaultPath)
        ? defaultPath
        : undefined;
    const options: OpenDialogOptions = {
      title: 'Select AiSphere Root Directory',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: usableDefaultPath,
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'Selection canceled' };
    }
    return { success: true, data: { path: result.filePaths[0] } };
  });

  // Give the root directory setting a valid default so the settings page shows
  // the real data location instead of an empty or Linux-only placeholder.
  return startRemoteAccess.then(() => Promise.all([
    settingService.ensureDefault(SettingKey.RootDirectory, getDataRootDir()),
    settingService.ensureDefault(SettingKey.RuntimeAutoInstall, 'ask'),
    settingService.ensureDefault(SettingKey.DockerRegistryMirror, ''),
    settingService.ensureDefault(SettingKey.StopRuntimesOnExit, 'always'),
  ])).then(async () => {
    await (ServiceContainer.getInstance().get(ServiceName.RuntimeService) as RuntimeService)
      .refreshPersistedApplicationStatuses();
  });
}

async function shutdownServices(): Promise<void> {
  const logService = ServiceContainer.getInstance().get(ServiceName.LogService) as LogService | undefined;
  logService?.info('Shutting down application services...');
  try {
    await ServiceContainer.getInstance().shutdownAllService();
  } catch (error) {
    console.error('Failed to shut down application services:', error);
  }
}

// App lifecycle
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady()
    .then(async () => {
      await initServices();
      servicesInitialized = true;
      createWindow();
      createTray();
    })
    .catch((error) => {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      console.error('AiSphere failed to start:', message);
      dialog.showErrorBox('AiSphere failed to start', message);
      isQuitting = true;
      app.quit();
    });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showMainWindow();
    }
  });
}

app.on('window-all-closed', () => {
  // The window is normally hidden rather than destroyed, so this only runs
  // during a real quit (or on macOS). On macOS the app stays in the dock and
  // its runtimes should remain available until the user actually quits.
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});

let shutdownPromise: Promise<void> | null = null;
let shutdownComplete = false;

app.on('before-quit', (event) => {
  if (shutdownComplete) return;

  event.preventDefault();
  isQuitting = true;
  if (!servicesInitialized) {
    shutdownComplete = true;
    app.quit();
    return;
  }
  if (shutdownPromise) return;

  shutdownPromise = (async () => {
    const runtimeService = ServiceContainer.getInstance().get<RuntimeService>(ServiceName.RuntimeService);
    const preference = await runtimeService.getShutdownPreference();
    let decision: 'always' | 'never' = preference === 'never' ? 'never' : 'always';
    let activeResources: { apps: string[]; runtimes: string[]; installs: string[] } | null = null;

    if (preference === 'ask') {
      activeResources = await runtimeService.getShutdownStatus();
      if (activeResources.apps.length > 0 || activeResources.runtimes.length > 0 || activeResources.installs.length > 0) {
        const language = await (ServiceContainer.getInstance().get(ServiceName.SettingService) as SettingService)
          .getValue(SettingKey.Language);
        const copy = language === 'zh'
          ? {
              title: '退出 AiSphere？',
              message: '仍有应用或受管理的运行环境正在运行。',
              apps: '正在运行的应用',
              runtimes: '正在运行的受管理运行环境',
              installs: '正在进行的安装',
              question: '退出前停止它们吗？',
              stop: '停止并退出',
              leave: '保持运行并退出',
              cancel: '取消',
            }
          : {
              title: 'Quit AiSphere?',
              message: 'Some apps or managed runtimes are still running.',
              apps: 'Running apps',
              runtimes: 'Running managed runtimes',
              installs: 'Active installations (will be cancelled on exit)',
              question: 'Stop them before quitting?',
              stop: 'Stop and Quit',
              leave: 'Leave Running',
              cancel: 'Cancel',
            };
        const description = [
          activeResources.apps.length > 0 ? `${copy.apps}: ${activeResources.apps.join(', ')}` : '',
          activeResources.runtimes.length > 0 ? `${copy.runtimes}: ${activeResources.runtimes.join(', ')}` : '',
          activeResources.installs.length > 0 ? `${copy.installs}: ${activeResources.installs.join(', ')}` : '',
        ].filter(Boolean).join('\n');
        const result = await dialog.showMessageBox({
          type: 'question',
          title: copy.title,
          message: copy.message,
          detail: `${description}\n\n${copy.question}`,
          buttons: [copy.stop, copy.leave, copy.cancel],
          defaultId: 0,
          cancelId: 2,
          noLink: true,
        });

        if (result.response === 2) {
          isQuitting = false;
          shutdownPromise = null;
          return;
        }
        decision = result.response === 0 ? 'always' : 'never';
      }
    }

    runtimeService.setShutdownDecision(decision);
    const exploreService = ServiceContainer.getInstance().get<ExploreService>(ServiceName.ExploreService);
    const hasActiveInstalls = exploreService.hasActiveInstallations();
    if (decision === 'always' || hasActiveInstalls) {
      shutdownInProgress = true;
      showMainWindow();
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(APP_SHUTDOWN_PROGRESS, {
            phase: 'preparing',
            current: 0,
            total: (activeResources?.apps.length ?? 0) +
              (activeResources?.runtimes.length ?? 0) +
              (activeResources?.installs.length ?? 0),
          });
        }
      }
    }
    await shutdownServices();
    shutdownInProgress = false;
    shutdownComplete = true;
    app.quit();
  })().catch((error) => {
    console.error('AiSphere shutdown failed:', error);
    isQuitting = false;
    shutdownInProgress = false;
    shutdownPromise = null;
    dialog.showErrorBox(
      'AiSphere could not quit cleanly',
      error instanceof Error ? error.message : String(error),
    );
  });
});
