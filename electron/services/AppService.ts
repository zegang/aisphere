import { App, ipcMain } from 'electron';
import { NAMESPACE_DEFAULT, MODULE_APP } from '../../src/shared/modules';
import { APP_CREATE, APP_DELETE, APP_DETAIL, APP_LIST, APP_OPEN_INTERACTIVE_SHELL, APP_START, APP_STATUS, APP_STOP, APP_UPDATE, APP_INSTALL, IpcResponse } from '../../src/shared/channel-types';
import { Application } from '../../src/types/api';
import { LogService } from './LogService';
import { LowDbStore } from '../utils/dbstore/lowdb-store';
import { DbStoreService } from './DbStoreService';
import { RuntimeService } from './RuntimeService';
import { ServiceContainer } from './ServiceContainer';
import { Service, ServiceName } from '../types/IService';
import { Task } from '../utils/runtime';
import * as pty from 'node-pty';
import { Package } from '../utils/package';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { SettingService } from './SettingService';

export class AppService implements Service {
  name = ServiceName.AppService;
  private ptySessions: Map<string, pty.IPty> = new Map();

  constructor() { }

  private getDBStore() {
    const dbSvc = ServiceContainer.getInstance().get(ServiceName.DbStoreService) as DbStoreService;
    return dbSvc.getDB(LowDbStore, NAMESPACE_DEFAULT, MODULE_APP);
  }

  private getLogger() {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  private getRuntimeService() {
    return ServiceContainer.getInstance().get(ServiceName.RuntimeService) as RuntimeService;
  }

  getAppHomeDir(app: Application): string {
    if (app.apphomedir) {
      return app.apphomedir;
    }
    const settingSvc = ServiceContainer.getInstance().get<SettingService>(ServiceName.SettingService);
    app.apphomedir = join(settingSvc.getAppInstallDir(), app.id);
    if (!existsSync(app.apphomedir)) {
      mkdirSync(app.apphomedir, { recursive: true });
    }
    return app.apphomedir;
  }

  getAppPackageDir(app: Application): string {
    if (!app.apphomedir) {
      throw new Error('Missing apphomedir');
    }
    const pkgPath = join(app.apphomedir, 'package');
    if (!existsSync(pkgPath)) {
      mkdirSync(pkgPath, { recursive: true });
    }
    return pkgPath;
  }

  getAppUserdataDir(app: Application): string {
    if (!app.apphomedir) {
      throw new Error('Missing apphomedir');
    }
    const userdataPath = join(app.apphomedir, 'userdata');
    if (!existsSync(userdataPath)) {
      mkdirSync(userdataPath, { recursive: true });
    }
    return userdataPath;
  }

  init() {
    this.getLogger().info('Starting', this.name);
    this.setupHandlers();
  }

  async shutdown() {
    this.getLogger().info('Shutting down', this.name);
    const apps = await this.listApps();
    for (const app of apps) {
      this.stopApp(app);
    }
    for (const session of this.ptySessions.values()) {
      session.kill();
    }
    this.ptySessions.clear();
  }

  async installApp(app: Application, event?: any): Promise<IpcResponse<any>> {
    const pkg = new Package();
    return pkg.install(app, event);
  }

  listApps(): Promise<Application[]> {
    return this.getDBStore().list();
  }

  createApp(app: Application) {
    this.getAppHomeDir(app);
    this.getAppPackageDir(app);
    this.getAppUserdataDir(app);
    return this.getDBStore().insert(app);
  }

  getAppById(id: string): Promise<Application | undefined> {
    return this.getDBStore().get(id);
  }

  updateApp(id: string, app: Application) {
    return this.getDBStore().update(id, app);
  }

  deleteApp(id: string) {
    return this.getDBStore().delete(id);
  }

  startApp(app: Application) {
    this.getLogger().info(`Starting app ${app.name}`, 'AppService');
    return this.getRuntimeService().run(app);
  }

  stopApp(app: Application) {
    this.getLogger().info(`Stopping app ${app.name}`, 'AppService');
    return this.getRuntimeService().stop(app);
  }

  pauseApp(app: Application) {
    return this.getRuntimeService().pause(app);
  }

  async openInteractiveShell(app: Application) {
    this.getLogger().info(`Opening interactive shell for app ${app.name}`, 'AppService');
    try {
      await this.getRuntimeService().openInteractiveShell(app);
      return { success: true };
    } catch (e: any) {
      this.getLogger().error(`Failed to open interactive shell for app ${app.name}: ${e.message}`, 'AppService');
      return { success: false, error: e.message };
    }
  }

  private setupHandlers() {

    ipcMain.handle(APP_LIST, async () => {
      const apps = await this.listApps();
      return { success: true, data: { apps } };
    });

    ipcMain.handle(APP_DETAIL, async (_event, id: string) => {
      const app = await this.getAppById(id);
      return { success: true, data: { app } };
    });

    ipcMain.handle(APP_CREATE, async (_event, app: Application) => {
      const id = await this.createApp(app);
      return { success: true, data: { id } };
    });

    ipcMain.handle(APP_INSTALL, async (_event, app: Application) => {
      this.installApp(app);
    });

    ipcMain.handle(APP_START, async (_event, id) => {
      const app = await this.getAppById(id);
      if (!app) throw new Error(`Application ${id} not found`);
      try {
        await this.startApp(app);
        // Persist both task status and potential installation updates (e.g. loaded image names)
        await this.getDBStore().update(id, { task: app.task, install: app.install, error: undefined });
        return { success: true, data: { task: app.task } };
      } catch (e: any) {
        this.getLogger().error(`Failed to start app ${id}: ${e.message}`, 'AppService');
        await this.getDBStore().update(id, { task: app.task, error: e.message });
        return { success: false, error: e.message, data: { task: app.task } };
      }
    });

    ipcMain.handle(APP_STOP, async (_event, id: string) => {
      const app = await this.getAppById(id);
      if (!app) throw new Error(`Application ${id} not found`);
      try {
        await this.stopApp(app);
        await this.getDBStore().update(id, { task: app.task });
        return { success: true };
      } catch (e: any) {
        this.getLogger().error(`Failed to stop app ${id}: ${e.message}`, 'AppService');
        await this.getDBStore().update(id, { task: app.task});
        return { success: false, error: e.message };
      }
    });

    ipcMain.handle(APP_DELETE, async (_event, id: string) => {
      this.getLogger().info(`Deleting app ${id}`, 'AppService');
      const pkg = new Package();
      const app = await this.getAppById(id);
      if (!app) throw new Error(`Application ${id} not found`);
      await pkg.uninstall(app);
      await this.getDBStore().delete(id);
      return { success: true };
    });

    ipcMain.handle(APP_STATUS, async (_event, id: string) => {
      try {
        const app = await this.getAppById(id);
        if (!app) return { success: true, data: { status: 'unknown' } };

        if (app.task) {
          const task: Task = { ...app.task, app } as Task;
          this.getLogger().info(`Checking app ${app.id} task ${task.id} status`, 'AppService');
          const status = await this.getRuntimeService().status(task);

          if (status === 'unknown') {
            this.getLogger().info(`Unknown status of app ${app.name}. Removing stale task`, 'AppService');
            await this.getDBStore().update(id, { task: undefined });
            return { success: true, data: { status: 'unknown' } };
          }

          // Check if the task was cleared (set to undefined) because it was stale/missing
          if (!app.task) {
            this.getLogger().info(`No task found for app ${app.name}`, 'AppService');
            await this.getDBStore().update(id, { task: undefined });
            return { success: true, data: { status: 'unknown' } };
          }

          // Persistence: Update database if the real-time runtime status differs from the stored state
          app.task.hostPorts = task.hostPorts;
          await this.getDBStore().update(id, { task: { ...app.task, status } });
          return { success: true, data: { status } };
        }
        return { success: true, data: { status: 'unknown' } };
      } catch (e: any) {
        this.getLogger().error(`Failed to check app ${id} status: ${e.message}`, 'AppService');
        return { success: false, error: e.message };
      }
    });

    ipcMain.handle('app:inspect', async (_event, id: string) => {
      try {
        const app = await this.getAppById(id);
        if (!app) throw new Error(`Application ${id} not found`);
        const data = await this.getRuntimeService().inspect(app);
        return { success: true, data };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    });

    ipcMain.handle(APP_OPEN_INTERACTIVE_SHELL, async (_event, id: string) => {
      const app = await this.getAppById(id);
      if (!app) throw new Error(`Application ${id} not found`);
      return this.openInteractiveShell(app);
    });

    ipcMain.handle('terminal:init', async (event, id: string) => {
      const app = await this.getAppById(id);
      if (!app) throw new Error('App not found');

      if (this.ptySessions.has(id)) {
        this.ptySessions.get(id)?.kill();
      }

      const { command, args } = this.getRuntimeService().shellAttach(app);
      const ptyProcess = pty.spawn(command, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env as any
      });

      ptyProcess.onData((data) => {
        event.sender.send(`terminal:output:${id}`, data);
      });

      this.ptySessions.set(id, ptyProcess);
      return { success: true };
    });

    ipcMain.handle('terminal:logs', async (event, id: string) => {
      const app = await this.getAppById(id);
      if (!app) throw new Error('App not found');

      const logSessionId = `${id}:logs`;
      if (this.ptySessions.has(logSessionId)) {
        this.ptySessions.get(logSessionId)?.kill();
      }

      const { command, args } = this.getRuntimeService().getLogsConfig(app);
      const ptyProcess = pty.spawn(command, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env as any
      });

      ptyProcess.onData((data) => {
        event.sender.send(`terminal:output:${logSessionId}`, data);
      });

      this.ptySessions.set(logSessionId, ptyProcess);
      return { success: true };
    });

    ipcMain.handle('terminal:input', async (_event, { id, data }) => {
      this.ptySessions.get(id)?.write(data);
    });

    ipcMain.handle('terminal:resize', async (_event, { id, cols, rows }) => {
      this.ptySessions.get(id)?.resize(cols, rows);
    });

    ipcMain.handle(APP_UPDATE, async (_event, data: { id: string; config: Record<string, unknown> }) => {
      await this.getDBStore().update(data.id, data.config);
      return { success: true };
    });
  }
}