import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme } from 'electron';
import { join } from 'path';

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
    exitPromise = (async () => {
      try {
        await onExit?.();
      } catch (shutdownError) {
        console.error('Could not shut down AiSphere after a startup error:', shutdownError);
      } finally {
        app.exit(1);
      }
    })();
    return exitPromise;
  };
  try {
    const details = formatError(error);
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

    if (isDev) {
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
