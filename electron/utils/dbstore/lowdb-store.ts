import { join } from 'path';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { JSONFilePreset } from 'lowdb/node';
import { AbstractDataStore } from './abstract-store';

type Schema = Record<string, Record<string, any[]>>;

export class LowDbStore extends AbstractDataStore {
  rootpath: string;
  namespace: string;
  module: string;
  private dbPromise: Promise<any> | null = null;
  private filePath: string;

  constructor(rootpath: string, namespace: string, module: string) {
    super();
    this.rootpath = rootpath;
    this.namespace = namespace;
    this.module = module;
    this.filePath = join(rootpath, namespace, module + '.json');
  }

  private async getDb() {
    if (!this.dbPromise) {
      this.dbPromise = this.openDb().catch((error) => {
        this.dbPromise = null;
        throw error;
      });
    }
    return this.dbPromise;
  }

  private async openDb() {
    try {
      return await JSONFilePreset<Schema>(this.filePath, {});
    } catch (error) {
      if (!(error instanceof SyntaxError) || !existsSync(this.filePath)) {
        throw error;
      }

      const contents = readFileSync(this.filePath, 'utf8');
      let recoveredData: Schema | undefined;
      const position = /position (\d+)/i.exec(error.message);
      if (position) {
        try {
          const parsed: unknown = JSON.parse(contents.slice(0, Number(position[1])).trim());
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            recoveredData = parsed as Schema;
          }
        } catch {
          // Keep the original file as a backup and initialize an empty store.
        }
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.filePath}.corrupt-${timestamp}`;
      renameSync(this.filePath, backupPath);
      if (recoveredData) {
        writeFileSync(this.filePath, `${JSON.stringify(recoveredData, null, 2)}\n`, 'utf8');
        console.error(`Recovered valid JSON data from ${this.filePath}; preserved the original at ${backupPath}.`, error);
      } else {
        console.error(`Invalid database JSON at ${this.filePath}; preserved the original at ${backupPath} and initialized an empty store.`, error);
      }
      return JSONFilePreset<Schema>(this.filePath, {});
    }
  }

  async list(): Promise<any[]> {
    const db = await this.getDb();
    return db.data[this.namespace]?.[this.module] || [];
  }

  async replaceAll<T>(items: T[]): Promise<void> {
    const db = await this.getDb();
    if (!db.data[this.namespace]) db.data[this.namespace] = {};
    db.data[this.namespace][this.module] = items;
    await db.write();
  }

  async get<T>(id: string): Promise<T | undefined> {
    const items = await this.list();
    return items.find((i: any) => (i.id === id || i.uuid === id)) || undefined;
  }

  async insert(data: any): Promise<string> {
    const db = await this.getDb();
    if (!db.data[this.namespace]) db.data[this.namespace] = {};
    if (!db.data[this.namespace][this.module]) db.data[this.namespace][this.module] = [];
    
    const id = data.id || data.uuid || Math.random().toString(36).substring(2, 9);
    const item = { ...data, id };
    db.data[this.namespace][this.module].push(item);
    await db.write();
    return id;
  }

  async update(id: string, data: any): Promise<void> {
    const db = await this.getDb();
    const items = db.data[this.namespace]?.[this.module] || [];
    const index = items.findIndex((i: any) => (i.id === id || i.uuid === id));
    if (index !== -1) {
      items[index] = { ...items[index], ...data };
      await db.write();
    }
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    const items = db.data[this.namespace]?.[this.module] || [];
    const index = items.findIndex((i: any) => (i.id === id || i.uuid === id));
    if (index !== -1) {
      items.splice(index, 1);
      await db.write();
    }
  }

  async getBy<T>(criteria: Record<string, any>): Promise<T[]> {
    const items = await this.list();
    return items.filter((item: any) => 
      Object.entries(criteria).every(([k, v]) => item[k] === v)
    ) as T[];
  }

  async deleteBy(criteria: Record<string, any>): Promise<void> {
    const db = await this.getDb();
    const items = db.data[this.namespace]?.[this.module] || [];
    db.data[this.namespace][this.module] = items.filter((item: any) => 
      !Object.entries(criteria).every(([k, v]) => item[k] === v)
    );
    await db.write();
  }

  async close(): Promise<void> {}
}