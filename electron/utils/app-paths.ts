import { app } from 'electron';
import { dirname, join } from 'path';

/**
 * Root directory for data the application writes at runtime.
 *
 * Packaged builds use the folder that contains the executable. With the NSIS
 * installer this is the installation directory the user selected, so the app's
 * root directory matches the chosen install root by default.
 *
 * Development keeps everything next to the sources so it is easy to inspect.
 */
export function getDataRootDir(): string {
  if (!app.isPackaged) {
    return app.getAppPath();
  }
  // On Windows, process.execPath is `<install dir>\aisphere.exe`; the directory
  // is the user-selected install root and is not inside the read-only app.asar.
  // Other platforms keep data in userData (a macOS .app bundle is read-only).
  if (process.platform === 'win32') {
    return dirname(process.execPath);
  }
  return app.getPath('userData');
}

export function getDataPath(...segments: string[]): string {
  return join(getDataRootDir(), ...segments);
}
