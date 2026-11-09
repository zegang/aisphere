import { app } from 'electron';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { randomBytes, timingSafeEqual } from 'crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { networkInterfaces } from 'os';
import { extname, join, normalize, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import { REMOTE_ACCESS_STATUS, type RemoteAccessStatus } from '../../src/shared/channel-types';
import { getRemoteInvokeListener, dispatchRemoteEvent } from '../utils/remote-ipc-registry';
import { LogService } from './LogService';
import { Service, ServiceName } from '../types/IService';
import { ServiceContainer } from './ServiceContainer';

interface RemoteAccessConfig {
  networkAccess: {
    enabled: boolean;
    port: number;
  };
}

interface QueuedRemoteEvent {
  id: number;
  channel: string;
  args: unknown[];
}

interface RemoteClientEvents {
  events: QueuedRemoteEvent[];
  lastSeen: number;
}

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_EVENTS_PER_CLIENT = 1000;
const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{16,80}$/;

function getResourceConfigPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'config', 'config.json')
    : join(app.getAppPath(), 'resources', 'config', 'config.json');
}

function getRendererRoot(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return resolve(currentDir, '..', 'dist');
}

function getMimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    case '.woff2': return 'font/woff2';
    case '.woff': return 'font/woff';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

function getLanAddresses(): string[] {
  const addresses = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (!entry.internal && entry.family === 'IPv4') addresses.add(entry.address);
    }
  }
  return [...addresses];
}

export class RemoteAccessService implements Service {
  name = ServiceName.RemoteAccessService;
  private server: Server | null = null;
  private readonly clientEvents = new Map<string, RemoteClientEvents>();
  private nextEventId = 1;
  private config: RemoteAccessConfig = { networkAccess: { enabled: false, port: 3210 } };
  private token = '';
  private lastError: string | undefined;
  private readonly rendererRoot = getRendererRoot();

  private getLogger(): LogService {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  init(): void {
    ipcMain.handle(REMOTE_ACCESS_STATUS, async () => ({ success: true, data: this.getStatus() }));
  }

  async start(): Promise<void> {
    this.config = this.loadConfig();
    if (!this.config.networkAccess.enabled) {
      this.getLogger().info('LAN browser access is disabled by resources/config/config.json.', this.name);
      return;
    }

    if (!existsSync(join(this.rendererRoot, 'index.html'))) {
      this.lastError = `Renderer bundle not found at ${this.rendererRoot}.`;
      this.getLogger().error(`LAN browser access cannot start: ${this.lastError}`, this.name);
      return;
    }

    try {
      this.token = this.loadOrCreateToken();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.getLogger().error(`LAN browser access cannot create its authentication token: ${this.lastError}`, this.name);
      return;
    }
    this.server = createServer((request, response) => {
      void this.handleRequest(request, response).catch((error) => {
        this.getLogger().error(`LAN browser request failed: ${error instanceof Error ? error.message : String(error)}`, this.name);
        if (!response.headersSent) this.sendJson(response, 500, { success: false, error: 'Internal server error' });
        else response.destroy();
      });
    });

    try {
      await new Promise<void>((resolveListen, rejectListen) => {
        const onError = (error: Error) => rejectListen(error);
        this.server!.once('error', onError);
        this.server!.listen(this.config.networkAccess.port, '0.0.0.0', () => {
          this.server!.removeListener('error', onError);
          resolveListen();
        });
      });
    } catch (error) {
      this.server = null;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.getLogger().error(`Could not start LAN browser access: ${this.lastError}`, this.name);
      return;
    }

    const addresses = getLanAddresses();
    const urls = addresses.map((address) => `http://${address}:${this.config.networkAccess.port}`);
    this.getLogger().info(
      `LAN browser access is enabled on port ${this.config.networkAccess.port}. ` +
      `Connect using ${urls.join(', ') || 'a LAN address on this computer'}. ` +
      `The access token is available in AiSphere Settings. Token file: ${join(app.getPath('userData'), 'remote-access-token')}`,
      this.name,
    );
  }

  async shutdown(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolveClose, rejectClose) => {
      this.server!.close((error) => error ? rejectClose(error) : resolveClose());
    });
    this.server = null;
    this.clientEvents.clear();
  }

  getStatus(): RemoteAccessStatus {
    const enabled = !!this.server?.listening;
    return {
      enabled: this.config.networkAccess.enabled,
      listening: enabled,
      port: this.config.networkAccess.port,
      urls: enabled
        ? getLanAddresses().map((address) => `http://${address}:${this.config.networkAccess.port}`)
        : [],
      token: enabled ? this.token : undefined,
      error: this.lastError,
    };
  }

  private loadConfig(): RemoteAccessConfig {
    const configPath = getResourceConfigPath();
    try {
      const value: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
      if (!value || typeof value !== 'object') throw new Error('The root must be a JSON object.');
      const networkAccess = (value as Record<string, unknown>).networkAccess;
      if (!networkAccess || typeof networkAccess !== 'object') throw new Error('networkAccess must be an object.');
      const { enabled, port } = networkAccess as Record<string, unknown>;
      if (typeof enabled !== 'boolean') throw new Error('networkAccess.enabled must be a boolean.');
      if (!Number.isInteger(port) || Number(port) < 1024 || Number(port) > 65535) {
        throw new Error('networkAccess.port must be an integer from 1024 to 65535.');
      }
      return { networkAccess: { enabled, port: Number(port) } };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.getLogger().error(
        `Invalid LAN access configuration at ${configPath}: ${this.lastError}. LAN access remains disabled.`,
        this.name,
      );
      return { networkAccess: { enabled: false, port: 3210 } };
    }
  }

  private loadOrCreateToken(): string {
    const tokenPath = join(app.getPath('userData'), 'remote-access-token');
    mkdirSync(dirname(tokenPath), { recursive: true });
    try {
      const token = readFileSync(tokenPath, 'utf8').trim();
      if (/^[a-f0-9]{64}$/.test(token)) return token;
    } catch {
      // Create a token when this is the first launch with LAN access enabled.
    }
    const token = randomBytes(32).toString('hex');
    writeFileSync(tokenPath, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
    return token;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (request.method === 'POST' && requestUrl.pathname === '/__aisphere/auth') {
      const body = await this.readJson(request);
      if (typeof body.token !== 'string' || !this.tokenMatches(body.token)) {
        this.sendJson(response, 401, { success: false, error: 'Invalid access token.' });
        return;
      }
      response.setHeader('Set-Cookie', `aisphere_access=${this.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
      this.sendJson(response, 200, { success: true });
      return;
    }

    if (!this.isAuthenticated(request)) {
      if (request.method === 'GET' && requestUrl.pathname === '/') {
        this.sendLoginPage(response);
      } else {
        this.sendJson(response, 401, { success: false, error: 'Authentication required.' });
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/__aisphere/invoke') {
      const body = await this.readJson(request);
      if (typeof body.channel !== 'string' || typeof body.clientId !== 'string' || !CLIENT_ID_PATTERN.test(body.clientId)) {
        this.sendJson(response, 400, { success: false, error: 'Invalid IPC request.' });
        return;
      }
      const listener = getRemoteInvokeListener(body.channel);
      if (!listener) {
        this.sendJson(response, 404, { success: false, error: `No handler is registered for ${body.channel}.` });
        return;
      }
      try {
        const event = this.createInvokeEvent(body.clientId);
        const result = await listener(event, body.payload);
        this.sendJson(response, 200, result ?? { success: true });
      } catch (error) {
        this.sendJson(response, 500, {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/__aisphere/send') {
      const body = await this.readJson(request);
      if (
        typeof body.channel !== 'string' ||
        typeof body.clientId !== 'string' ||
        !CLIENT_ID_PATTERN.test(body.clientId)
      ) {
        this.sendJson(response, 400, { success: false, error: 'Invalid IPC event.' });
        return;
      }
      const event = this.createEvent(body.clientId);
      const handled = dispatchRemoteEvent(body.channel, event, body.payload);
      this.sendJson(response, handled ? 200 : 404, { success: handled });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/__aisphere/events') {
      const clientId = requestUrl.searchParams.get('clientId') ?? '';
      const after = Number(requestUrl.searchParams.get('after') ?? 0);
      if (!CLIENT_ID_PATTERN.test(clientId) || !Number.isSafeInteger(after) || after < 0) {
        this.sendJson(response, 400, { success: false, error: 'Invalid event cursor.' });
        return;
      }
      const client = this.getClient(clientId);
      const events = client.events.filter((event) => event.id > after);
      this.sendJson(response, 200, { success: true, data: { events } });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      this.sendJson(response, 405, { success: false, error: 'Method not allowed.' });
      return;
    }

    this.serveStaticFile(requestUrl.pathname, response, request.method === 'HEAD');
  }

  private createInvokeEvent(clientId: string): IpcMainInvokeEvent {
    return {
      sender: this.createSender(clientId),
    } as IpcMainInvokeEvent;
  }

  private createEvent(clientId: string): IpcMainEvent {
    return { sender: this.createSender(clientId) } as IpcMainEvent;
  }

  private createSender(clientId: string) {
    return {
      isDestroyed: () => false,
      send: (channel: string, ...args: unknown[]) => {
        const client = this.getClient(clientId);
        client.events.push({ id: this.nextEventId++, channel, args });
        if (client.events.length > MAX_EVENTS_PER_CLIENT) {
          client.events.splice(0, client.events.length - MAX_EVENTS_PER_CLIENT);
        }
      },
    };
  }

  private getClient(clientId: string): RemoteClientEvents {
    const now = Date.now();
    for (const [id, client] of this.clientEvents) {
      if (now - client.lastSeen > 30 * 60 * 1000) this.clientEvents.delete(id);
    }
    let client = this.clientEvents.get(clientId);
    if (!client) {
      client = { events: [], lastSeen: now };
      this.clientEvents.set(clientId, client);
    }
    client.lastSeen = now;
    return client;
  }

  private tokenMatches(value: string): boolean {
    const candidate = Buffer.from(value);
    const expected = Buffer.from(this.token);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }

  private isAuthenticated(request: IncomingMessage): boolean {
    const cookieHeader = request.headers.cookie ?? '';
    const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('aisphere_access='));
    const value = cookie?.slice('aisphere_access='.length);
    return !!value && this.tokenMatches(decodeURIComponent(value));
  }

  private async readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.');
      chunks.push(buffer);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Request body must be a JSON object.');
    }
    return value as Record<string, unknown>;
  }

  private serveStaticFile(requestPath: string, response: ServerResponse, headOnly: boolean): void {
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(requestPath);
    } catch {
      this.sendJson(response, 400, { success: false, error: 'Invalid URL path.' });
      return;
    }
    const relativePath = normalize(decodedPath.replace(/^[/\\]+/, ''));
    let filePath = relativePath === '.' ? join(this.rendererRoot, 'index.html') : resolve(this.rendererRoot, relativePath);
    if (filePath !== this.rendererRoot && !filePath.startsWith(`${this.rendererRoot}${sep}`)) {
      this.sendJson(response, 403, { success: false, error: 'Forbidden.' });
      return;
    }
    if (!existsSync(filePath)) {
      if (extname(filePath)) {
        this.sendJson(response, 404, { success: false, error: 'Not found.' });
        return;
      }
      filePath = join(this.rendererRoot, 'index.html');
    }

    response.writeHead(200, {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self' data: blob:; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:",
    });
    if (headOnly) {
      response.end();
      return;
    }
    createReadStream(filePath).on('error', (error) => {
      this.getLogger().error(`Failed reading LAN renderer resource ${filePath}: ${error.message}`, this.name);
      response.destroy(error);
    }).pipe(response);
  }

  private sendLoginPage(response: ServerResponse): void {
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AiSphere sign in</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#e5e7eb;font:16px system-ui}main{width:min(360px,calc(100% - 40px));padding:28px;border:1px solid #26314a;border-radius:16px;background:#111a2e}h1{margin:0 0 8px;font-size:22px}p{color:#aab6ca;font-size:14px;line-height:1.5}input,button{box-sizing:border-box;width:100%;padding:12px;border-radius:8px;font:inherit}input{margin:14px 0;background:#0b1020;border:1px solid #34415d;color:white}button{border:0;background:#2563eb;color:white;font-weight:600;cursor:pointer}#error{color:#fca5a5}</style></head>
<body><main><h1>AiSphere</h1><p>Enter the access token shown in AiSphere Settings on the desktop.</p>
<form id="login"><input id="token" type="password" autocomplete="current-password" placeholder="Access token" required><button>Connect</button><p id="error" role="alert"></p></form></main>
<script>document.getElementById('login').addEventListener('submit',async e=>{e.preventDefault();const error=document.getElementById('error');error.textContent='';try{const r=await fetch('/__aisphere/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:document.getElementById('token').value})});if(!r.ok){const d=await r.json();throw new Error(d.error||'Sign-in failed')}location.replace('/')}catch(x){error.textContent=x.message||String(x)}})</script></body></html>`;
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'",
    });
    response.end(html);
  }

  private sendJson(response: ServerResponse, status: number, value: unknown): void {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(JSON.stringify(value));
  }
}
