import { join } from 'path';
import { existsSync } from 'fs';
import { JSONFilePreset } from 'lowdb/node';
import { AbstractDataStore } from './abstract-store';

type Schema = Record<string, Record<string, any[]>>;

export class LowDbStore extends AbstractDataStore {
  rootpath: string;
  namespace: string;
  module: string;
  private db: any = null;
  private filePath: string;

  constructor(rootpath: string, namespace: string, module: string) {
    super();
    this.rootpath = rootpath;
    this.namespace = namespace;
    this.module = module;
    this.filePath = join(rootpath, namespace, module + '.json');
  }

  private async getDb() {
    if (!this.db) {
      this.db = await JSONFilePreset<Schema>(this.filePath, {});
    } else {
      if (!existsSync(this.filePath)) {
        this.db.data = {};
      } else {
        await this.db.read();
      }
    }

    if (this.db.data === null || this.db.data === undefined) {
      this.db.data = {};
    }

    return this.db;
  }

  async list(): Promise<any[]> {
    const db = await this.getDb();
    return db.data[this.namespace]?.[this.module] || [];
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