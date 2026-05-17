import { app, ipcMain } from 'electron';
import { SETTING_DELETE, SETTING_GET, SETTING_LIST, SETTING_UPDATE } from '../../src/shared/channel-types';
import { NAMESPACE_DEFAULT, MODULE_SETTING } from '../../src/shared/modules';
import { LogService } from './LogService';
import { LowDbStore } from '../utils/dbstore/lowdb-store';
import { DbStoreService } from './DbStoreService';
import { Service, ServiceName } from '../types/IService';
import { ServiceContainer } from './ServiceContainer';
import { join } from 'path';

export class SettingService implements Service {
  name = ServiceName.SettingService;

  constructor() { }

  private getLogger() {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  init() {
    this.getLogger().info('Starting', this.name);
    this.setupHandlers();
  }

  private getDBStore() {
    const dbs = ServiceContainer.getInstance().get(ServiceName.DbStoreService) as DbStoreService;
    return dbs.getDB(LowDbStore, NAMESPACE_DEFAULT, MODULE_SETTING);
  }

  getAppInstallDir() {
    return join(app.getAppPath(), 'apps');
  }

  private setupHandlers() {
    ipcMain.handle(SETTING_LIST, async () => {
      const settings = await this.getDBStore().list();
      return { success: true, data: { settings } };
    });

    ipcMain.handle(SETTING_GET, async (_event, key: string) => {
      const settings = await this.getDBStore().getBy({ 'key': key });
      return { success: true, data: { value: settings[0].value } };
    });

    ipcMain.handle(SETTING_UPDATE, async (_event, key: string, value: string) => {
      const settings = await this.getDBStore().getBy({ 'key': key });
      if (settings.length > 0) {
        await this.getDBStore().update(settings[0].id,
          { ...settings[0], key: key, value: value }
        );
      } else {
        await this.getDBStore().insert({ 'key': key, 'value': value });
      }
      return { success: true };
    });

    ipcMain.handle(SETTING_DELETE, async (_event, key: string) => {
      await this.getDBStore().deleteBy({ 'key': key });
      return { success: true };
    });
  }
}