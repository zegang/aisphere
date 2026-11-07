import { ipcMain, dialog, shell } from 'electron';
import { LogService } from './LogService';
import { NAMESPACE_DEFAULT, MODULE_EXPLORE } from '../../src/shared/modules';
import {
  EXPLORE_LIST, EXPLORE_DETAIL, EXPLORE_INSTALL, EXPLORE_EXPORT, EXPLORE_IMPORT,
  IpcResponse, ExploreExportRequest, ExploreExportResult, ExploreImportRequest, ExploreImportResult,
} from '../../src/shared/channel-types';
import { Application } from '../../src/types/api';
import { MOCK_APPLICATIONS } from '../tests/MOCKDB';
import { DbStoreService } from './DbStoreService';
import { LowDbStore } from '../utils/dbstore/lowdb-store';
import { Service, ServiceName } from '../types/IService';
import { ServiceContainer } from './ServiceContainer';
import { AppService } from './AppService';
import { Package } from '../utils/package';
import { fileStamp, slugName, compressDirectory, extractArchive, collectSpecJsonFiles } from '../utils/spec-io';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';

export class ExploreService implements Service {
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
      this.getLogger().info(`Installation requested for: ${app.name}`, 'ExploreService');
      this.getAppService().createApp(app);

      const pkg = new Package();
      const result = await pkg.install(app, event);
      await this.getAppService().updateApp(app.id, app);
      this.getLogger().info(`Installation ${app.name} result: ${result}`);
      return result;
    });

    ipcMain.handle(EXPLORE_EXPORT, async (_event, req: ExploreExportRequest): Promise<IpcResponse<ExploreExportResult>> => {
      try {
        return { success: true, data: await this.exportApps(req) };
      } catch (e: any) {
        this.getLogger().error(`Export failed: ${e?.message ?? e}`, 'ExploreService');
        return { success: false, error: e?.message ?? String(e) };
      }
    });

    ipcMain.handle(EXPLORE_IMPORT, async (_event, req: ExploreImportRequest): Promise<IpcResponse<ExploreImportResult>> => {
      try {
        return { success: true, data: await this.importSpecs(req) };
      } catch (e: any) {
        this.getLogger().error(`Import failed: ${e?.message ?? e}`, 'ExploreService');
        return { success: false, error: e?.message ?? String(e) };
      }
    });
  }

  // ---- Export: app catalog specs (app说明) ----

  /**
   * Writes the given catalog applications to disk.
   * - `single`: one combined JSON file (`aisphere-apps-<ts>.json`)
   * - `folder`: a new folder (`aisphere-apps-<ts>`) with one JSON per app
   * - `zip`: the same folder layout, packaged as `<folder name>.zip`
   * File and folder names embed a timestamp. `targetPath` (file path for
   * `single`, destination directory for `folder`/`zip`) skips the native
   * dialog — used by tests; the UI flow always goes through the dialogs.
   */
  private async exportApps(req: ExploreExportRequest): Promise<ExploreExportResult> {
    const mode = req?.mode ?? 'single';
    const apps = (Array.isArray(req?.apps) ? req.apps : []).filter((a: any) => a && typeof a.id === 'string') as Application[];
    if (apps.length === 0) throw new Error('No app specs to export.');
    const ts = fileStamp();

    if (mode === 'single') {
      let filePath = req.targetPath || '';
      if (!filePath) {
        const r = await dialog.showSaveDialog({
          title: 'Export app specs',
          defaultPath: `aisphere-apps-${ts}.json`,
          filters: [{ name: 'AiSphere App Specs (JSON)', extensions: ['json'] }],
        });
        if (r.canceled || !r.filePath) throw new Error('Export canceled.');
        filePath = r.filePath;
      }
      writeFileSync(
        filePath,
        JSON.stringify({ schema: 'aisphere.app-catalog', version: 1, exportedAt: new Date().toISOString(), count: apps.length, apps }, null, 2) + '\n',
        'utf8',
      );
      shell.showItemInFolder(filePath);
      this.getLogger().info(`Exported ${apps.length} app specs to ${filePath}`, 'ExploreService');
      return { kind: 'file', path: filePath, count: apps.length };
    }

    // folder / zip: choose (or take) a destination directory
    let parent = req.targetPath || '';
    if (!parent) {
      const r = await dialog.showOpenDialog({
        title: 'Choose export location',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (r.canceled || !r.filePaths[0]) throw new Error('Export canceled.');
      parent = r.filePaths[0];
    }
    const folderName = `aisphere-apps-${ts}`;
    const folder = join(parent, folderName);
    mkdirSync(folder, { recursive: true });

    for (const app of apps) {
      const file = join(folder, `${app.id}-${slugName(String(app.name))}-${ts}.json`);
      writeFileSync(
        file,
        JSON.stringify({ schema: 'aisphere.app-spec', version: 1, exportedAt: new Date().toISOString(), app }, null, 2) + '\n',
        'utf8',
      );
    }

    if (mode !== 'zip') {
      shell.openPath(folder);
      this.getLogger().info(`Exported ${apps.length} app specs to folder ${folder}`, 'ExploreService');
      return { kind: 'folder', path: folder, count: apps.length };
    }

    const zipPath = join(parent, `${folderName}.zip`);
    await compressDirectory(folder, zipPath);
    rmSync(folder, { recursive: true, force: true });
    shell.showItemInFolder(zipPath);
    this.getLogger().info(`Exported ${apps.length} app specs to archive ${zipPath}`, 'ExploreService');
    return { kind: 'zip', path: zipPath, count: apps.length };
  }

  // ---- Import: app catalog specs (app说明) ----

  /**
   * Reads app specs from files (.json single or combined), a folder of
   * per-app JSON files, or a .zip archive, and registers the new entries in
   * the Explore catalog. Entries whose id already exists (built-in catalog,
   * installed apps or previously imported records) are skipped.
   */
  private async importSpecs(req: ExploreImportRequest): Promise<ExploreImportResult> {
    let paths = req?.paths ?? [];
    if (paths.length === 0) {
      const source = req?.source ?? 'file';
      const r = await dialog.showOpenDialog({
        title: 'Import app specs',
        properties: source === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
        filters: source === 'folder' ? undefined : [
          { name: 'AiSphere App Specs (JSON/ZIP)', extensions: ['json', 'zip'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'ZIP archive', extensions: ['zip'] },
        ],
      });
      if (r.canceled || r.filePaths.length === 0) throw new Error('Import canceled.');
      paths = r.filePaths;
    }

    // Collect every spec JSON readable from the chosen paths.
    const { files: specFiles, tempDirs } = await collectSpecJsonFiles(paths);
    try {
      if (specFiles.length === 0) throw new Error('No .json app spec files found in the selection.');

      // Parse every file: raw single app, `{ app }` wrapper, or `{ apps: […] }` catalog.
      const parsed: any[] = [];
      for (const file of specFiles) {
        let json: unknown;
        try { json = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
        if (Array.isArray(json)) parsed.push(...json);
        else if (json && typeof json === 'object') {
          const obj = json as Record<string, unknown>;
          if (Array.isArray(obj.apps)) parsed.push(...obj.apps);
          else parsed.push(obj);
        }
      }

      const normalized = parsed.map((raw) => this.normalizeImportedApp(raw)).filter((a): a is Application => a !== null);
      if (normalized.length === 0) throw new Error('No valid app specs found in the selection.');

      // Skip anything already known (built-ins, installed apps, prior imports).
      const stores = await Promise.all([this.getDBStore().list(), this.getAppService().listApps()]);
      const existingIds = new Set<string>([
        ...MOCK_APPLICATIONS.map((a) => a.id),
        ...stores[0].map((a: any) => String(a.id)),
        ...stores[1].map((a: any) => String(a.id)),
      ]);

      const imported: Array<{ id: string; name: string }> = [];
      const skipped: Array<{ id: string; name: string; reason?: string }> = [];
      for (const app of normalized) {
        if (existingIds.has(app.id)) {
          skipped.push({ id: app.id, name: app.name, reason: 'exists' });
          continue;
        }
        await this.getDBStore().insert(app);
        existingIds.add(app.id);
        imported.push({ id: app.id, name: app.name });
      }

      this.getLogger().info(`Imported ${imported.length} app specs (${skipped.length} skipped)`, 'ExploreService');
      return { imported, skipped };
    } finally {
      for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
    }
  }

  /** Coerces an arbitrary parsed spec object into a clean, never-installed Application. */
  private normalizeImportedApp(raw: unknown): Application | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, any>;
    if (obj.app && typeof obj.app === 'object') return this.normalizeImportedApp(obj.app);
    if (typeof obj.id !== 'string' || !obj.id.trim()) return null;

    const kindValues = ['engine', 'webui', 'agent', 'skill', 'hook', 'tool', 'instructions', 'mcp', 'app'];
    const runtime = obj.runtime && typeof obj.runtime === 'object'
      ? { runtime: String(obj.runtime.runtime || 'native') }
      : { runtime: 'native' };

    const app = {
      ...obj,
      id: obj.id.trim(),
      name: String(obj.name ?? obj.id),
      org: String(obj.org ?? 'Imported'),
      version: String(obj.version ?? 'imported'),
      description: String(obj.description ?? ''),
      category: String(obj.category ?? 'Imported'),
      type: ['llm', 'tool', 'agent', 'dataset', 'other'].includes(obj.type) ? obj.type : 'other',
      kind: kindValues.includes(obj.kind) ? obj.kind : 'app',
      runtime,
      labels: Array.isArray(obj.labels) ? obj.labels.map(String) : [],
      requirements: {
        platform: ['windows', 'linux', 'mac', 'any'].includes(obj.requirements?.platform) ? obj.requirements.platform : 'any',
        cpu: String(obj.requirements?.cpu ?? '—'),
        memory: String(obj.requirements?.memory ?? '—'),
        storage: String(obj.requirements?.storage ?? '—'),
        gpu: String(obj.requirements?.gpu ?? 'Not required'),
      },
      packages: Array.isArray(obj.packages) ? obj.packages.map(String) : [],
    } as Application;

    if (obj.component && typeof obj.component === 'object') app.component = obj.component;
    // Imported specs are catalog definitions only — never carry install state,
    // task status or paths from the exporting machine.
    delete app.install;
    delete (app as any).task;
    delete (app as any).status;
    delete (app as any).error;
    delete (app as any).apphomedir;
    return app;
  }
}