import { ipcMain } from 'electron';
import { SETTING_DELETE, SETTING_GET, SETTING_LIST, SETTING_UPDATE } from '../../src/shared/channel-types';
import { NAMESPACE_DEFAULT, MODULE_SETTING } from '../../src/shared/modules';
import { LogService } from './LogService';
import { LowDbStore } from '../utils/dbstore/lowdb-store';
import { DbStoreService } from './DbStoreService';
import { Service, ServiceName } from '../types/IService';
import { ServiceContainer } from './ServiceContainer';
import { getDataPath } from '../utils/app-paths';

export interface SettingRecord {
  id: string;
  key: string;
  value: string;
}

export class SettingService implements Service {
  name = ServiceName.SettingService;

  constructor() { }

  private getLogger() {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  init() {
    this.getLogger().info('Starting', this.name);
    this.setupHandlers();
    // Older builds stored the whole { key, value } payload as the key. Drop
    // those malformed records so they can't shadow real settings.
    this.sanitize().catch((error) => {
      this.getLogger().warn('Failed to sanitize settings: ' + error);
    });
  }

  private isSettingRecord(value: unknown): value is SettingRecord {
    const record = value as Partial<SettingRecord> | null;
    return (
      !!record &&
      typeof record.id === 'string' &&
      typeof record.key === 'string' &&
      typeof record.value === 'string'
    );
  }

  private async sanitize(): Promise<void> {
    const store = this.getDBStore();
    const records = await store.list();
    for (const record of records) {
      if (!this.isSettingRecord(record)) {
        const id = (record as { id?: unknown } | null)?.id;
        if (typeof id === 'string') {
          await store.delete(id);
        }
      }
    }
  }

  private getDBStore() {
    const dbs = ServiceContainer.getInstance().get(ServiceName.DbStoreService) as DbStoreService;
    return dbs.getDB(LowDbStore, NAMESPACE_DEFAULT, MODULE_SETTING);
  }

  getAppInstallDir() {
    return getDataPath('apps');
  }

  /** Inserts a setting only when the key has no stored value yet. */
  async ensureDefault(key: string, value: string): Promise<void> {
    const store = this.getDBStore();
    const existing = await store.getBy<SettingRecord>({ key });
    if (existing.length === 0) {
      await store.insert({ key, value });
    }
  }

  async getValue(key: string): Promise<string | undefined> {
    const records = await this.getDBStore().getBy<SettingRecord>({ key });
    return records[0]?.value;
  }

  private setupHandlers() {
    ipcMain.handle(SETTING_LIST, async () => {
      const records = await this.getDBStore().list();
      const settings = records.filter((record) => this.isSettingRecord(record));
      return { success: true, data: { settings } };
    });

    ipcMain.handle(SETTING_GET, async (_event, key: string) => {
      const settings = await this.getDBStore().getBy<SettingRecord>({ 'key': key });
      return { success: true, data: { value: settings[0]?.value } };
    });

    ipcMain.handle(SETTING_UPDATE, async (_event, payload: { key: string; value: string }) => {
      const { key, value } = payload ?? {};
      const settings = await this.getDBStore().getBy<SettingRecord>({ 'key': key });
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