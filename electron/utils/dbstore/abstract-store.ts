/**
 * AbstractDataStore provides a unified interface for Insert, Update, Get, Delete, List) operations.
 * It supports both in-memory and on-disk persistence models.
 */
export abstract class AbstractDataStore {
  abstract rootpath: string;
  abstract namespace: string;
  abstract module: string;

  /** Add a new record */
  abstract insert<T>(item: T): Promise<string>;
  /** Update an existing record */
  abstract update<T>(id: string, updates: Partial<T>): Promise<void>;
  /** Get information about a specific record */
  abstract get<T>(id: string): Promise<T | undefined>;
  /** Delete a record */
  abstract delete(id: string): Promise<void>;
  /** List all records */
  abstract list<T>(): Promise<T[]>;
  /** Get by conditions */
  async getBy<T>(condition: Record<string, unknown>): Promise<T[]> {
    throw new Error('Not implemented');
  }
  async deleteBy(condition: Record<string, unknown>): Promise<void> {
    throw new Error('Not implemented');
  }
  abstract close(): void;
}

