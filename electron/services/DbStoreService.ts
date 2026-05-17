import { IService, ServiceName } from "../types/IService";
import { AbstractDataStore } from "../utils/dbstore/abstract-store";
import { LogService } from "./LogService";
import { ServiceContainer } from "./ServiceContainer";

interface DbStoreContainer {
    [namespace: string]: {
        [module: string]: AbstractDataStore;
    };
}

export class DbStoreService implements IService {
    name = ServiceName.DbStoreService;
    private rootpath: string;
    private dbs: DbStoreContainer = {};

    constructor(rootpath: string) {
        this.rootpath = rootpath;
    }

    private getLogger() {
        return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
    }

    init(): void {
        this.getLogger().info('Starting', this.name);
    }

    shutdown(): void {
        this.close();
    }

    getDB<T extends AbstractDataStore>(
        DataStoreClass: new (rootpath: string, namespace: string, module: string) => T,
        namespace: string,
        module: string,
    ) : T {
        if (!this.dbs[namespace]) {
            this.dbs[namespace] = {};
        }
        if (!this.dbs[namespace][module]) {
            this.dbs[namespace][module] = new DataStoreClass(
                this.rootpath,
                namespace,
                module
            );
        }
        return this.dbs[namespace][module] as T;
    }

    closeDB(namespace: string, module: string) {
        if (this.dbs[namespace] && this.dbs[namespace][module]) {
            this.dbs[namespace][module].close();
            delete this.dbs[namespace][module];
        }
    }

    close() {
        Object.keys(this.dbs).forEach(namespace => {
            Object.keys(this.dbs[namespace]).forEach(module => {
                this.dbs[namespace][module].close();
                delete this.dbs[namespace][module];
            });
        });
    }
}
