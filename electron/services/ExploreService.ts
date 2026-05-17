import { ipcMain, app } from 'electron';
import { LogService } from './LogService';
import { NAMESPACE_DEFAULT, MODULE_EXPLORE } from '../../src/shared/modules';
import { EXPLORE_LIST, EXPLORE_DETAIL, EXPLORE_INSTALL, IpcResponse } from '../../src/shared/channel-types';
import { Application } from '../../src/types/api';
import { MOCK_APPLICATIONS } from '../tests/MOCKDB';
import { DbStoreService } from './DbStoreService';
import { LowDbStore } from '../utils/dbstore/lowdb-store';
import { IService, ServiceName } from '../types/IService';
import { ServiceContainer } from './ServiceContainer';
import { SettingService } from './SettingService';
import { AppService } from './AppService';
import { join } from 'path';
import { mkdirSync } from 'fs';

export class ExploreService implements IService {
  name = ServiceName.ExploreService;
  
  constructor() { }

  private getDBStore() {
    const dbSvc = ServiceContainer.getInstance().get(ServiceName.DbStoreService) as DbStoreService;
    return dbSvc.getDB(LowDbStore, NAMESPACE_DEFAULT, MODULE_EXPLORE);
  }

  private getLogger() {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  init() {
    this.getLogger().info('Starting', this.name);
    this.setupHandlers();
  }

  private getAppInstallDir() {
    return ServiceContainer.getInstance().get<SettingService>(ServiceName.SettingService).getAppInstallDir();
  }

  private getAppService() {
    return ServiceContainer.getInstance().get<AppService>(ServiceName.AppService);
  }

  private setupHandlers() {
    ipcMain.handle(EXPLORE_LIST, async () => {
      let appsMarket = await this.getDBStore().list();
      // Merge Mock for tests
      let apps = [ ...MOCK_APPLICATIONS, ...appsMarket ];
      let installedApps = await this.getAppService().listApps();

      const mergedApps = apps.map(app => {
        const installedInfo = installedApps.find(a => a.id === app.id);
        return installedInfo ? { ...app, ...installedInfo } : app;
      });

      return { success: true, data: { apps: mergedApps } };
    });

    ipcMain.handle(EXPLORE_DETAIL, async (_event, uuid: string) => {
      const app = await this.getDBStore().get(uuid);
      return { success: true, data: { app } };
    });

    ipcMain.handle(EXPLORE_INSTALL, async (event, app: Application): Promise<IpcResponse<any>> => {
      this.getLogger().info(`Installation requested for: ${app.name}`);
      const appRootDir = join(this.getAppInstallDir(), app.id);
      mkdirSync(appRootDir, { recursive: true });
      app.apphomedir = appRootDir;
      return this.getAppService().installApp(app, event);
    });
  }
}