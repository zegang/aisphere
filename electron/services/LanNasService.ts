import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { networkInterfaces } from 'os';
import { randomBytes, timingSafeEqual } from 'crypto';
import { createReadStream } from 'fs';
import { open, readdir, realpath, rm, stat } from 'fs/promises';
import { AddressInfo } from 'net';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { pipeline } from 'stream/promises';
import { ipcMain } from 'electron';
import { LAN_NAS_APP_ID, LAN_NAS_START, LAN_NAS_STATUS, LAN_NAS_STOP, IpcResponse, LanNasConfig, LanNasStartRequest, LanNasStartResult, LanNasStatus } from '../../src/shared/channel-types';
import { Service, ServiceName } from '../types/IService';
import { AppService } from './AppService';
import { LogService } from './LogService';
import { ServiceContainer } from './ServiceContainer';

const DEFAULT_CONFIG: LanNasConfig = { directory: '', authenticationEnabled: true };

class NasRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export class LanNasService implements Service {
  name = ServiceName.LanNasService;
  private servers: Server[] = [];
  private activeStatus: LanNasStatus | null = null;

  private getAppService(): AppService {
    return ServiceContainer.getInstance().get<AppService>(ServiceName.AppService);
  }

  private getLogger(): LogService {
    return ServiceContainer.getInstance().get<LogService>(ServiceName.LogService);
  }

  init(): void {
    ipcMain.handle(LAN_NAS_STATUS, async (): Promise<IpcResponse<LanNasStatus>> => ({
      success: true,
      data: await this.getStatus(),
    }));

    ipcMain.handle(LAN_NAS_START, async (_event, config: LanNasStartRequest): Promise<IpcResponse<LanNasStartResult>> => {
      try {
        return { success: true, data: await this.start(config) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.getLogger().error(`Failed to start LAN NAS: ${message}`, 'LanNasService');
        return { success: false, error: message };
      }
    });

    ipcMain.handle(LAN_NAS_STOP, async (): Promise<IpcResponse<undefined>> => {
      try {
        await this.stop();
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.getLogger().error(`Failed to stop LAN NAS: ${message}`, 'LanNasService');
        return { success: false, error: message };
      }
    });
  }

  async shutdown(): Promise<void> {
    await this.stop();
  }

  private async getStatus(): Promise<LanNasStatus> {
    if (this.activeStatus) return { ...this.activeStatus, urls: [...this.activeStatus.urls] };

    const app = await this.getAppService().getAppByCatalogId(LAN_NAS_APP_ID);
    const config = app?.lanNasConfig as LanNasConfig | undefined;
    return {
      running: false,
      directory: config?.directory ?? DEFAULT_CONFIG.directory,
      authenticationEnabled: config?.authenticationEnabled ?? DEFAULT_CONFIG.authenticationEnabled,
      urls: [],
    };
  }

  private async start(config: LanNasStartRequest): Promise<LanNasStartResult> {
    if (this.activeStatus) return this.getStatus();
    if (!config || typeof config.directory !== 'string' || !config.directory.trim()) {
      throw new Error('Choose a folder to share first.');
    }

    const directory = await realpath(config.directory);
    if (!(await stat(directory)).isDirectory()) throw new Error('The selected share path is not a folder.');

    const addresses = this.getLanAddresses();
    if (addresses.length === 0) {
      throw new Error('No private IPv4 network address is available. Connect to a local network and try again.');
    }

    const app = await this.getAppService().getAppByCatalogId(LAN_NAS_APP_ID);
    if (!app) throw new Error('Install the LAN NAS app from Explore first.');

    const authenticationEnabled = config.authenticationEnabled !== false;
    const password = authenticationEnabled ? randomBytes(15).toString('base64url') : undefined;
    await this.getAppService().updateApp(app.id, {
      ...app,
      lanNasConfig: { directory, authenticationEnabled },
    });
    const servers: Server[] = [];
    const urls: string[] = [];
    let port = 0;

    try {
      for (const address of addresses) {
        const server = createServer((request, response) => {
          void this.handleRequest(request, response, directory, authenticationEnabled, password).catch((error: unknown) => {
            const clientError = error instanceof NasRequestError;
            if (!response.headersSent) {
              this.sendJson(response, clientError ? error.status : 500, {
                error: clientError ? error.message : 'The request could not be completed.',
              });
            }
            else response.destroy();
            if (!clientError) {
              this.getLogger().error(`LAN NAS request failed: ${error instanceof Error ? error.message : String(error)}`, 'LanNasService');
            }
          });
        });
        const listeningPort = await this.listen(server, address, port);
        port = listeningPort;
        server.on('error', (error) => this.getLogger().error(`LAN NAS listener error: ${error.message}`, 'LanNasService'));
        servers.push(server);
        urls.push(`http://${address}:${port}/`);
      }
    } catch (error) {
      await Promise.all(servers.map((server) => this.closeServer(server)));
      throw error;
    }

    this.servers = servers;
    this.activeStatus = { running: true, directory, authenticationEnabled, urls, password };

    this.getLogger().info(`LAN NAS started on ${urls.join(', ')}`, 'LanNasService');

    return this.getStatus();
  }

  private async stop(): Promise<void> {
    const servers = this.servers;
    this.servers = [];
    try {
      await Promise.all(servers.map((server) => this.closeServer(server)));
    } finally {
      if (this.activeStatus) this.getLogger().info('LAN NAS stopped', 'LanNasService');
      this.activeStatus = null;
    }
  }

  private getLanAddresses(): string[] {
    const addresses = Object.values(networkInterfaces()).flatMap((items) => items ?? [])
      .filter((item) => item.family === 'IPv4' && !item.internal && this.isPrivateAddress(item.address))
      .map((item) => item.address);
    return [...new Set(addresses)];
  }

  private isPrivateAddress(address: string): boolean {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    return parts[0] === 10
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || (parts[0] === 169 && parts[1] === 254);
  }

  private listen(server: Server, address: string, port: number): Promise<number> {
    return new Promise((resolveListen, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        const boundAddress = server.address() as AddressInfo;
        resolveListen(boundAddress.port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, address);
    });
  }

  private closeServer(server: Server): Promise<void> {
    if (!server.listening) return Promise.resolve();
    return new Promise((resolveClose, reject) => {
      server.close((error) => error ? reject(error) : resolveClose());
    });
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    root: string,
    authenticationEnabled: boolean,
    password?: string,
  ): Promise<void> {
    this.applySecurityHeaders(response);
    if (authenticationEnabled && !this.isAuthorized(request.headers.authorization, password ?? '')) {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="AiSphere NAS", charset="UTF-8"' });
      response.end('Authentication required.');
      return;
    }

    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(this.getBrowserPage());
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/list') {
      const directory = await this.resolveExistingPath(root, url.searchParams.get('path') ?? '');
      if (!(await stat(directory)).isDirectory()) {
        this.sendJson(response, 400, { error: 'The requested path is not a folder.' });
        return;
      }
      const entries = await readdir(directory, { withFileTypes: true });
      const items: Array<{ name: string; directory: boolean; size?: number; modified: string }> = [];
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const target = await this.resolveExistingPath(root, this.relativePath(root, join(directory, entry.name)));
        const details = await stat(target);
        items.push({
          name: entry.name,
          directory: details.isDirectory(),
          size: details.isFile() ? details.size : undefined,
          modified: details.mtime.toISOString(),
        });
      }
      this.sendJson(response, 200, { path: this.relativePath(root, directory), items });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/file') {
      const file = await this.resolveExistingPath(root, url.searchParams.get('path') ?? '');
      const details = await stat(file);
      if (!details.isFile()) {
        this.sendJson(response, 400, { error: 'The requested path is not a file.' });
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': details.size,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(basename(file))}`,
      });
      await pipeline(createReadStream(file), response);
      return;
    }

    if (request.method === 'PUT' && url.pathname === '/api/upload') {
      const folder = await this.resolveExistingPath(root, url.searchParams.get('path') ?? '');
      if (!(await stat(folder)).isDirectory()) {
        this.sendJson(response, 400, { error: 'The upload destination is not a folder.' });
        return;
      }
      const name = this.sanitizeFilename(url.searchParams.get('name') ?? '');
      const { target, file } = await this.createUploadTarget(root, folder, name);
      try {
        await pipeline(request, file.createWriteStream());
      } catch (error) {
        await rm(target, { force: true });
        throw error;
      }
      this.sendJson(response, 201, { name: basename(target) });
      return;
    }

    this.sendJson(response, 404, { error: 'Not found.' });
  }

  private applySecurityHeaders(response: ServerResponse): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  }

  private isAuthorized(header: string | undefined, password: string): boolean {
    if (!header?.startsWith('Basic ')) return false;
    let credentials: string;
    try {
      credentials = Buffer.from(header.slice(6), 'base64').toString('utf8');
    } catch {
      return false;
    }
    const separator = credentials.indexOf(':');
    if (separator < 0 || credentials.slice(0, separator) !== 'aisphere') return false;
    const provided = Buffer.from(credentials.slice(separator + 1));
    const expected = Buffer.from(password);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }

  private async resolveExistingPath(root: string, relativePath: string): Promise<string> {
    if (typeof relativePath !== 'string' || relativePath.includes('\\') || relativePath.includes('\0') || isAbsolute(relativePath)) {
      throw new NasRequestError(400, 'Invalid path.');
    }
    const segments = relativePath.split('/').filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..')) throw new NasRequestError(400, 'Invalid path.');
    const target = resolve(root, ...segments);
    if (!this.isWithin(root, target)) throw new NasRequestError(400, 'Invalid path.');
    let resolved: string;
    try {
      resolved = await realpath(target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') throw new NasRequestError(404, 'The requested path does not exist.');
      if (code === 'EACCES' || code === 'EPERM') throw new NasRequestError(403, 'The requested path cannot be accessed.');
      throw error;
    }
    if (!this.isWithin(root, resolved)) throw new NasRequestError(403, 'The requested path is outside the shared folder.');
    return resolved;
  }

  private async createUploadTarget(root: string, folder: string, name: string): Promise<{ target: string; file: Awaited<ReturnType<typeof open>> }> {
    const safeFolder = await this.resolveExistingPath(root, this.relativePath(root, folder));
    for (let index = 1; ; index++) {
      const suffix = index === 1 ? '' : ` (${index})`;
      const extension = index === 1 ? '' : this.fileExtension(name);
      const stem = index === 1 ? name : name.slice(0, name.length - extension.length);
      const target = join(safeFolder, `${stem}${suffix}${extension}`);
      if (!this.isWithin(root, target)) throw new NasRequestError(400, 'Invalid upload path.');
      try {
        const file = await open(target, 'wx');
        return { target, file };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
        throw error;
      }
    }
  }

  private fileExtension(name: string): string {
    const extensionIndex = name.lastIndexOf('.');
    return extensionIndex > 0 ? name.slice(extensionIndex) : '';
  }

  private sanitizeFilename(name: string): string {
    if (name.includes('/') || name.includes('\\')) throw new NasRequestError(400, 'Choose a file name without path separators.');
    const sanitized = basename(name)
      .replace(/[<>:"|?*\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim();
    if (!sanitized || sanitized === '.' || sanitized === '..') throw new NasRequestError(400, 'Choose a valid file name.');
    return sanitized;
  }

  private relativePath(root: string, target: string): string {
    return relative(root, target).split(sep).join('/');
  }

  private isWithin(root: string, target: string): boolean {
    const pathFromRoot = relative(root, target);
    return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot));
  }

  private sendJson(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
  }

  private getBrowserPage(): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AiSphere NAS</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f6fb;color:#172033;font:15px system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:920px;margin:32px auto;padding:24px;background:white;border:1px solid #dfe5ef;border-radius:16px;box-shadow:0 12px 40px #1c2a4410}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}h1{font-size:22px;margin:0}button,.upload{border:0;border-radius:8px;padding:10px 14px;background:#2563eb;color:#fff;font:inherit;cursor:pointer}button:disabled{opacity:.55;cursor:wait}.upload input{display:none}
#crumbs{color:#64748b;margin:0 0 14px}#crumbs button{background:none;color:#2563eb;padding:0 4px}
.row{display:flex;align-items:center;gap:12px;padding:12px;border-top:1px solid #edf0f5}.name{flex:1;min-width:0;overflow-wrap:anywhere}.meta{color:#64748b;font-size:12px}
a{color:#2563eb;text-decoration:none}.empty{padding:24px;text-align:center;color:#64748b}.notice{min-height:22px;color:#b42318;font-size:13px;margin:10px 0}
@media(max-width:600px){main{margin:0;padding:16px;border:0;border-radius:0;min-height:100vh}header{align-items:flex-start;flex-direction:column}.row{padding:12px 4px}}
</style>
</head>
<body><main>
<header><div><h1>AiSphere NAS</h1><div class="meta">Browse and transfer files in the shared folder</div></div><label class="upload">Upload files<input id="files" type="file" multiple></label></header>
<div id="crumbs"></div><div id="notice" class="notice" role="status"></div><section id="items"></section>
</main>
<script>
const items=document.getElementById('items'),crumbs=document.getElementById('crumbs'),notice=document.getElementById('notice'),picker=document.getElementById('files');let current='';
const bytes=n=>n<1024? n+' B':n<1048576?(n/1024).toFixed(1)+' KB':n<1073741824?(n/1048576).toFixed(1)+' MB':(n/1073741824).toFixed(1)+' GB';
function makeCrumbs(){crumbs.replaceChildren();const root=document.createElement('button');root.textContent='Shared folder';root.onclick=()=>{current='';load()};crumbs.append(root);let path='';for(const part of current.split('/').filter(Boolean)){path=path?path+'/'+part:part;const captured=path;const sep=document.createTextNode(' / ');const button=document.createElement('button');button.textContent=part;button.onclick=()=>{current=captured;load()};crumbs.append(sep,button)}}
async function load(){notice.textContent='';makeCrumbs();items.innerHTML='<div class="empty">Loading…</div>';try{const response=await fetch('/api/list?path='+encodeURIComponent(current));if(!response.ok)throw new Error((await response.json()).error||'Could not load folder');const data=await response.json();items.replaceChildren();data.items.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));if(!data.items.length){items.innerHTML='<div class="empty">This folder is empty.</div>';return}for(const item of data.items){const row=document.createElement('div');row.className='row';const icon=document.createElement('span');icon.textContent=item.directory?'📁':'📄';const name=document.createElement('span');name.className='name';name.textContent=item.name;const meta=document.createElement('span');meta.className='meta';meta.textContent=item.directory?'Folder':bytes(item.size||0);row.append(icon,name,meta);if(item.directory){const button=document.createElement('button');button.textContent='Open';button.onclick=()=>{current=current?current+'/'+item.name:item.name;load()};row.append(button)}else{const link=document.createElement('a');link.textContent='Download';link.href='/api/file?path='+encodeURIComponent(current?current+'/'+item.name:item.name);row.append(link)}items.append(row)}}catch(error){items.replaceChildren();notice.textContent=error.message||String(error)}}
picker.addEventListener('change',async()=>{const files=Array.from(picker.files||[]),renamed=[];for(let i=0;i<files.length;i++){notice.textContent='Uploading '+(i+1)+' of '+files.length+': '+files[i].name;try{const query='path='+encodeURIComponent(current)+'&name='+encodeURIComponent(files[i].name);const response=await fetch('/api/upload?'+query,{method:'PUT',body:files[i]});const result=await response.json();if(!response.ok)throw new Error(result.error||'Upload failed');if(result.name!==files[i].name)renamed.push(result.name)}catch(error){notice.textContent=error.message||String(error);picker.value='';return}}picker.value='';await load();notice.textContent=renamed.length?'Upload complete. Renamed duplicates: '+renamed.join(', '):files.length?'Upload complete.':''});
load();
</script></body></html>`;
  }
}
