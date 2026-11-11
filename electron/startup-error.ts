import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme } from 'electron';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// The main process is bundled as an ES module, so Node's CommonJS globals are
// not available here. Derive them from this module's own URL instead.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let dialogShown = false;
let exitPromise: Promise<void> | null = null;

const formatError = (error: unknown): string => {
  if (error instanceof Error) return error.stack ?? error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error, null, 2) ?? String(error);
  } catch {
    return String(error);
  }
};

export async function showStartupError(error: unknown, onExit?: () => Promise<void>): Promise<void> {
  if (dialogShown) return;
  dialogShown = true;
  const isChinese = app.getLocale().toLowerCase().startsWith('zh');

  const exitApplication = () => {
    if (exitPromise) return exitPromise;
    // Guarantee the process ends even if a service shutdown hangs (for example
    // while stopping a container). The user already confirmed the exit.
    const watchdog = setTimeout(() => app.exit(1), 20000);
    watchdog.unref();
    exitPromise = (async () => {
      try {
        await onExit?.();
      } catch (shutdownError) {
        console.error('Could not shut down AiSphere after a startup error:', shutdownError);
      } finally {
        clearTimeout(watchdog);
        app.exit(1);
      }
    })();
    return exitPromise;
  };
  try {
    const details = formatError(error);
    // Always surface the failure on stderr and in the user data log folder.
    // The window may not be able to render, so this is the last-resort
    // diagnostic trail.
    console.error('AiSphere failed to start:', details);
    try {
      const logDir = join(app.getPath('userData'), 'log');
      mkdirSync(logDir, { recursive: true });
      appendFileSync(join(logDir, 'startup-error.log'), `[${new Date().toISOString()}]\n${details}\n\n`, 'utf8');
    } catch (logError) {
      console.error('Could not write the AiSphere startup error log:', logError);
    }

    const language = isChinese ? 'zh' : 'en';
    const encodedDetails = Buffer.from(details, 'utf8').toString('base64');
    await app.whenReady();

    const errorPage = new BrowserWindow({
      width: 720,
      height: 700,
      minWidth: 580,
      minHeight: 560,
      frame: false,
      resizable: true,
      maximizable: false,
      minimizable: false,
      autoHideMenuBar: true,
      show: false,
      title: isChinese ? 'AiSphere 启动失败' : 'AiSphere failed to start',
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#111827' : '#f5f7fb',
      webPreferences: {
        preload: join(__dirname, 'startup-error-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    const cleanupIpc = () => {
      ipcMain.removeHandler('startup-error:copy');
      ipcMain.removeHandler('startup-error:exit');
    };

    ipcMain.handle('startup-error:copy', async (event) => {
      if (event.sender !== errorPage.webContents || errorPage.isDestroyed()) {
        throw new Error('Invalid startup error window.');
      }
      clipboard.writeText(details);
      return true;
    });
    ipcMain.handle('startup-error:exit', (event) => {
      if (event.sender !== errorPage.webContents || errorPage.isDestroyed()) {
        throw new Error('Invalid startup error window.');
      }
      return exitApplication();
    });

    errorPage.on('close', () => {
      void exitApplication();
    });
    errorPage.on('closed', () => {
      cleanupIpc();
    });

    if (!app.isPackaged) {
      const pageUrl = new URL('/startup-error.html', process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173');
      pageUrl.searchParams.set('language', language);
      pageUrl.searchParams.set('data', encodedDetails);
      await errorPage.loadURL(pageUrl.toString());
    } else {
      await errorPage.loadFile(join(__dirname, '..', 'dist', 'startup-error.html'), {
        query: { language, data: encodedDetails },
      });
    }

    errorPage.center();
    errorPage.show();
  } catch (dialogError) {
    console.error('Could not show the AiSphere startup error window:', dialogError);
    try {
      dialog.showErrorBox(
        isChinese ? 'AiSphere 启动失败' : 'AiSphere failed to start',
        formatError(error),
      );
    } catch (fallbackError) {
      console.error('Could not show the fallback AiSphere startup error dialog:', fallbackError);
    }
    await exitApplication();
  }
}
