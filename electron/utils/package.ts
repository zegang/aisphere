import os from 'os';
import { existsSync, mkdirSync, rmdirSync, rmSync } from 'fs';
import { Application } from '../../src/types/api';
import { Downloader } from './downloader';
import { Tar } from './tar';
import { ServiceContainer } from '../services/ServiceContainer';
import { ServiceName } from '../types/IService';
import { LogService } from '../services/LogService';
import { IpcResponse } from '../../src/shared/channel-types';
import { join } from 'path';
import { SandboxService } from '../services/SandboxService';
import { AppService } from '../services/AppService';
import type { RuntimeService } from '../services/RuntimeService';

/**
 * Package utility to handle application installation lifecycle: download, unpack, and runtime setup.
 */
export class Package {
  private getLogger() {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  private getSandbox() {
    return ServiceContainer.getInstance().get(ServiceName.SandboxService) as SandboxService;
  }

  async download(app: Application, event?: any): Promise<IpcResponse<any>> {
    const logger = this.getLogger();
    const downloader = new Downloader(logger);
    const appSvc = ServiceContainer.getInstance().get<AppService>(ServiceName.AppService);

    const msg = `Downloading ${app.packages.length} packages for ${app.name}`;
    logger.info(msg, 'Package');
    if (event) event.sender.send(`app:install:log:${app.id}`, msg);
    const downloadResults = await downloader.downloads(app.packages, appSvc.getAppHomeDir(app), {
      onProgress: (p) => {
        const percentage = p.totalBytes > 0 ? Math.round((p.downloadedBytes / p.totalBytes) * 100) : 0;
        if (event) {
          event.sender.send(`app:install:progress:${app.id}`, { percentage });
        }
      }
    });

    const failedResult = downloadResults.find(r => !r.success);
    if (failedResult) {
        return { success: false, error: failedResult.error || 'Download failed' };
    }

    app.install = {
      installed: false,
      installed_at: new Date().toISOString(),
      installed_package: downloadResults[0]?.filePath || ''
    };

    return { success: true, data: app };
  }

  async unpack(app: Application, event?: any): Promise<IpcResponse<any>> {
    const logger = this.getLogger();
    const appSvc = ServiceContainer.getInstance().get<AppService>(ServiceName.AppService);
    const tar = new Tar();

    if (!app.install || !app.install.installed_package) {
      throw new Error(`Missing installed package for application ${app.name}`);
    }

    const isArchive = app.install.installed_package.match(/\.(tar|tgz|tar\.gz|zip|7z|\d{3})$/i);
    if (!isArchive) {
      logger.info(`File ${app.install.installed_package} is not a recognized archive, skipping unpack.`, 'Package');
      return { success: true, data: app };
    }

    const is7z = app.install.installed_package.endsWith('.7z') || /\.\d{3}$/.test(app.install.installed_package);

    logger.info(`Unpacking package to ${appSvc.getAppPackageDir(app)} for ${app.name} from ${app.install.installed_package}`, 'Package');
    try {
      await tar.decompress(app.install.installed_package, appSvc.getAppPackageDir(app), {
        onLog: (data) => {
          if (event) event.sender.send(`app:install:log:${app.id}`, data);
        }
      });
      return { success: true, data: app };
    } catch (error: any) {
      logger.error(`Package unpacking failed for ${app.name}: ${error.message}`, 'Package');
      return { success: false, error: error.message };
    }
  }

  async delete(app: Application, event?: any): Promise<IpcResponse<any>> {
    throw new Error('Method not implemented.');
  }

  async runInstallScript(app: Application, event?: any): Promise<IpcResponse<any>> {
    const logger = this.getLogger();
    const appSvc = ServiceContainer.getInstance().get<AppService>(ServiceName.AppService);
    const appHomeDir = appSvc.getAppHomeDir(app);
    if (!appHomeDir) return { success: false, error: 'Application home directory is not set.' };

    const platform = os.platform();
    const potentialScripts = platform === 'win32'
      ? ['install.ps1', 'install.bat']
      : ['install.sh'];

    let scriptPath = '';
    for (const script of potentialScripts) {
      const fullPath = join(appHomeDir, script);
      if (existsSync(fullPath)) {
        scriptPath = fullPath;
        break;
      }
    }

    if (!scriptPath) {
      logger.info(`No 'install' script found for ${app.name}, skipping script execution.`, 'Package');
      return { success: true };
    }

    logger.info(`Running 'install' script for ${app.name}: ${scriptPath}`, 'Package');
    if (event) event.sender.send(`app:install:log:${app.id}`, `Running 'install' script for ${app.name}: ${scriptPath}`);
    try {
      await this.getSandbox().runShellCommand(scriptPath, [], {
        cwd: appHomeDir,
        onLog: (data) => {
          this.getLogger().debug(data, 'Package:AfterDownloadScript');
          if (event) event.sender.send(`app:install:log:${app.id}`, data);
        }
      });
      return { success: true };
    } catch (error: any) {
      logger.error(`'install' script execution failed: ${error.message}`, 'Package');
      return { success: false, error: `'install' script failed: ${error.message}` };
    }
  }

  /**
   * Orchestrates the full installation process for an application.
   * @param app The application to install.
   * @param event Optional Electron IPC event for reporting progress.
   */
  async install(app: Application, event?: any): Promise<IpcResponse<any>> {
    const appSvc = ServiceContainer.getInstance().get<AppService>(ServiceName.AppService);
    this.getLogger().info(`App home directory for ${app.name}: ${appSvc.getAppHomeDir(app)}`, 'Package');

    try {
      if (event) event.sender.send(`app:install:log:${app.id}`, `Starting installation of ${app.name}...`);

      // 1. Download
      const downloadResult = await this.download(app, event);
      if (!downloadResult.success || !app.install || !app.install.installed_package) {
        if (event) event.sender.send(`app:install:log:${app.id}`, `Download failed: ${downloadResult.error}`);
        return downloadResult;
      }
      if (event) event.sender.send(`app:install:log:${app.id}`, `Download successful: ${app.install.installed_package}`);

      // 2. Provision the container runtime for image-based apps (pull image).
      if (app.runtime?.runtime === 'docker') {
        if (event) event.sender.send(`app:install:log:${app.id}`, `Provisioning the Docker image...`);
        const runtimeService = ServiceContainer.getInstance().get<RuntimeService>(ServiceName.RuntimeService);
        const runtimeResult = await runtimeService.install(app, event);
        if (!runtimeResult.success) {
          if (event) event.sender.send(`app:install:log:${app.id}`, `Docker image setup failed: ${runtimeResult.error}`);
          return runtimeResult;
        }
      }

      // 3. Run install script if one exists
      if (event) event.sender.send(`app:install:log:${app.id}`, `Looking for 'afterdownload' scripts...`);
      const afterDownloadResult = await this.runInstallScript(app, event);
      if (event) {
        event.sender.send(`app:install:log:${app.id}`,
          afterDownloadResult.success ? `Installation complete!` : `Installation failed: ${afterDownloadResult.error}`);
      }
      // Mark the installation complete. Docker-based apps flip this in
      // RuntimeService only after the container image has been pulled; every
      // other kind (components, native apps) is fully installed once its
      // packages are downloaded and the post-install scripts have run.
      if (afterDownloadResult.success && app.runtime?.runtime !== 'docker') {
        app.install = {
          ...app.install,
          installed: true,
        } as Application['install'];
      }
      // Return the mutated application so the renderer can update the card's
      // installed state immediately instead of showing "Install" again.
      return afterDownloadResult.success
        ? { ...afterDownloadResult, data: app }
        : afterDownloadResult;
    } catch (error: any) {
      this.getLogger().error(`Package installation failed for ${app.name}: ${error.message}`, 'Package');
      return { success: false, error: error.message };
    }
  }

  async uninstall(app:Application, event?: any): Promise<IpcResponse<any>> {
    const appSvc = ServiceContainer.getInstance().get<AppService>(ServiceName.AppService);
    this.getLogger().info(`Uninstalling ${app.name}`, 'Package');
    this.getLogger().info(`Removing app package directory: ${appSvc.getAppPackageDir(app)}`, 'Package');
    rmSync(appSvc.getAppPackageDir(app), { recursive: true });
    this.getLogger().info(`Removing app userdata directory: ${appSvc.getAppUserdataDir(app)}`, 'Package');
    rmSync(appSvc.getAppUserdataDir(app), { recursive: true });
    this.getLogger().info(`Removing app home directory: ${appSvc.getAppHomeDir(app)}`, 'Package');
    rmSync(appSvc.getAppHomeDir(app), { recursive: true });
    app.install = undefined;
    appSvc.updateApp(app.id, app);
    return { success: true };
  }
}
