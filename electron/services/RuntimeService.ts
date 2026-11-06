import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import os from 'os';
import { execFile, spawn } from 'child_process';
import { existsSync, readdirSync, promises as fs } from 'fs';
import { delimiter, dirname, join } from 'path';
import * as pty from 'node-pty';
import { Application, AppRuntime } from '../../src/types/api';
import { LogService } from './LogService';
import { RuntimeApptainer, RuntimePodman, RuntimeConda, RuntimeDocker, RuntimeClass, Runtime, Task } from '../utils/runtime';
import { Service, ServiceName } from '../types/IService';
import { ServiceContainer } from './ServiceContainer';
import { SandboxService } from './SandboxService';
import { Downloader } from '../utils/downloader';
import { getDataPath } from '../utils/app-paths';
import {
  IpcResponse,
  RUNTIME_CHECK,
  RUNTIME_DETAIL,
  RUNTIME_ENGINE_START,
  RUNTIME_ENGINE_STATUS,
  RUNTIME_ENGINE_STOP,
  RUNTIME_INSTALL,
  RUNTIME_INSTALL_ABORT,
  RUNTIME_INSTALL_INPUT,
  RUNTIME_INSTALL_RESIZE,
  RUNTIME_INSTALL_STATUS,
  RUNTIME_UNINSTALL,
  RuntimeDetail,
  RuntimeEngineStatus,
  RuntimeInstallState,
  RuntimeInstallStatusEvent,
  RuntimeKind,
  runtimeInstallOutputChannel,
  runtimeInstallStatusChannel,
} from '../../src/shared/channel-types';

const SUPPORTED_RUNTIMES: RuntimeKind[] = ['docker', 'podman', 'apptainer', 'conda'];

function runtimeLabel(type: string): string {
  switch (type) {
    case 'docker': return 'Docker';
    case 'podman': return 'Podman';
    case 'conda': return 'Conda';
    case 'apptainer': return 'Apptainer';
    default: return type;
  }
}

interface RuntimeInstallSession {
  controller: AbortController;
  pty?: pty.IPty;
  /** Set after the first byte of terminal input was forwarded (avoids log spam). */
  inputLogged?: boolean;
  /** Reports a state transition to the renderer and stores it for late joiners. */
  onStatus?: (state: RuntimeInstallState, extra?: Omit<Partial<RuntimeInstallStatusEvent>, 'type' | 'state' | 'at'>) => void;
}

interface InstallerArtifact {
  url: string;
  fileName: string;
}

interface InteractiveRunOptions {
  cwd: string;
  emit: (data: string) => void;
}

export class RuntimeService implements Service {
  name = ServiceName.RuntimeService;
  protected runtimes: Partial<Record<RuntimeClass, Runtime>>;
  protected tasks: Record<string, Task>;
  private installSessions: Map<string, RuntimeInstallSession> = new Map();
  /**
   * Last known status per runtime. Kept after the install finishes so a page
   * that is opened later can still show what happened.
   */
  private installStates: Map<string, RuntimeInstallStatusEvent> = new Map();

  constructor() {
    this.runtimes = {};
    this.tasks = {};
  }

  private getLogger() {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  private getSandbox() {
    return ServiceContainer.getInstance().get(ServiceName.SandboxService) as SandboxService;
  }

  init() {
    const logger = ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
    logger.info('Starting', this.name);
    this.registerRuntimePaths();
    this.setupHandlers();
  }

  private setupHandlers() {
    ipcMain.handle(RUNTIME_CHECK, async () => {
      // Make runtimes installed under the app root available to PATH before
      // probing, otherwise a runtime installed by a previous session would be
      // reported as missing.
      this.registerRuntimePaths();
      const results = await Promise.all(SUPPORTED_RUNTIMES.map(async (type) => {
        const managed = existsSync(getDataPath('runtimes', type));
        try {
          let version = '';
          await this.getSandbox().runCommand(type, ['--version'], {
            onLog: (data) => { version += data; }
          });
          return { type, installed: true, managed, version: version.trim() };
        } catch {
          return { type, installed: false, managed };
        }
      }));
      return { success: true, data: { runtimes: results } };
    });

    ipcMain.handle(RUNTIME_DETAIL, async (_event, type: string) => {
      if (!SUPPORTED_RUNTIMES.includes(type as RuntimeKind)) {
        return { success: false, error: `Unknown runtime type: ${type}` };
      }
      try {
        const data = await this.getRuntimeDetail(type as RuntimeKind);
        return { success: true, data };
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    });

    ipcMain.handle(RUNTIME_ENGINE_STATUS, async (_event, type: string) => {
      if (!SUPPORTED_RUNTIMES.includes(type as RuntimeKind)) {
        return { success: false, error: `Unknown runtime type: ${type}` };
      }
      try {
        const data = await this.getEngineStatus(type as RuntimeKind);
        return { success: true, data };
      } catch (error: any) {
        return { success: false, error: error?.message || String(error) };
      }
    });

    ipcMain.handle(RUNTIME_ENGINE_START, async (_event, type: string) => {
      if (!SUPPORTED_RUNTIMES.includes(type as RuntimeKind)) {
        return { success: false, error: `Unknown runtime type: ${type}` };
      }
      try {
        const data = await this.startEngine(type as RuntimeKind);
        return { success: true, data };
      } catch (error: any) {
        const message = error?.message || String(error);
        this.getLogger().error(`Failed to start the ${type} engine: ${message}`, this.name);
        return { success: false, error: message };
      }
    });

    ipcMain.handle(RUNTIME_ENGINE_STOP, async (_event, type: string) => {
      if (!SUPPORTED_RUNTIMES.includes(type as RuntimeKind)) {
        return { success: false, error: `Unknown runtime type: ${type}` };
      }
      try {
        const data = await this.stopEngine(type as RuntimeKind);
        return { success: true, data };
      } catch (error: any) {
        const message = error?.message || String(error);
        this.getLogger().error(`Failed to stop the ${type} engine: ${message}`, this.name);
        return { success: false, error: message };
      }
    });

    ipcMain.handle(RUNTIME_UNINSTALL, async (event, type: string) => {
      if (!SUPPORTED_RUNTIMES.includes(type as RuntimeKind)) {
        return { success: false, error: `Unknown runtime type: ${type}` };
      }
      if (this.installSessions.has(type)) {
        return { success: false, error: `An installation for ${type} is currently running.` };
      }

      const emit = (data: string) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(runtimeInstallOutputChannel(type), data);
        }
      };
      const sendStatus = (state: RuntimeInstallState, extra?: Omit<Partial<RuntimeInstallStatusEvent>, 'type' | 'state' | 'at'>) => {
        const payload: RuntimeInstallStatusEvent = { type: type as RuntimeKind, state, at: Date.now(), ...extra };
        this.installStates.set(type, payload);
        if (!event.sender.isDestroyed()) {
          event.sender.send(runtimeInstallStatusChannel(type), payload);
        }
      };

      try {
        sendStatus('installing', { message: `Uninstalling ${runtimeLabel(type)}...` });
        emit(`\x1b[1;34mAiSphere runtime uninstaller\x1b[0m\r\n`);
        emit(`Runtime : ${type}\r\n`);
        emit(`Folder  : ${getDataPath('runtimes', type)}\r\n\r\n`);

        await this.uninstallRuntime(type as RuntimeKind, emit);

        this.registerRuntimePaths();
        this.installStates.delete(type);
        emit(`\r\n\x1b[1;32m${runtimeLabel(type)} was uninstalled.\x1b[0m\r\n`);
        sendStatus('completed', { message: `${runtimeLabel(type)} uninstalled` });
        return { success: true };
      } catch (error: any) {
        const message = error?.message || String(error);
        this.getLogger().error(`Failed to uninstall ${type}: ${message}`, this.name);
        emit(`\r\n\x1b[1;31mUninstall failed: ${message}\x1b[0m\r\n`);
        sendStatus('failed', { message });
        return { success: false, error: message };
      }
    });

    ipcMain.handle(RUNTIME_INSTALL, async (event, type: string) => {
      const supported = ['docker', 'podman', 'apptainer', 'conda'];
      if (!supported.includes(type)) {
        return { success: false, error: `Unknown runtime type: ${type}` };
      }
      if (this.installSessions.has(type)) {
        return { success: false, error: `An installation for ${type} is already running.` };
      }

      const controller = new AbortController();
      const session: RuntimeInstallSession = { controller };
      this.installSessions.set(type, session);

      const emit = (data: string) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(runtimeInstallOutputChannel(type), data);
        }
      };

      const sendStatus: RuntimeInstallSession['onStatus'] = (state, extra) => {
        const payload: RuntimeInstallStatusEvent = {
          type: type as RuntimeKind,
          state,
          at: Date.now(),
          ...extra,
        };
        this.installStates.set(type, payload);
        if (!event.sender.isDestroyed()) {
          event.sender.send(runtimeInstallStatusChannel(type), payload);
        }
      };
      session.onStatus = sendStatus;

      const downloadsDir = getDataPath('downloads');
      const runtimeDir = getDataPath('runtimes', type);

      try {
        sendStatus('starting', { message: 'Preparing installation...' });
        await fs.mkdir(downloadsDir, { recursive: true });
        await fs.mkdir(runtimeDir, { recursive: true });

        emit('\x1b[1;34mAiSphere runtime installer\x1b[0m\r\n');
        emit(`Runtime  : ${type}\r\n`);
        emit(`Platform : ${os.platform()} (${os.arch()})\r\n`);
        emit(`Downloads: ${downloadsDir}\r\n`);
        emit(`Install  : ${runtimeDir}\r\n\r\n`);

        await this.installRuntime({
          type,
          platform: os.platform(),
          arch: os.arch(),
          downloadsDir,
          runtimeDir,
          session,
          emit,
        });

        this.registerRuntimePaths();
        emit(`\r\n\x1b[1;32mInstallation of ${type} completed successfully.\x1b[0m\r\n`);
        sendStatus('completed', { message: `${type} installed successfully` });
        return { success: true };
      } catch (e: any) {
        const message = e?.message || String(e);
        if (session.controller.signal.aborted || message === 'Command aborted' || message === 'Installation aborted') {
          this.getLogger().info(`Installation of ${type} was aborted.`, this.name);
          emit('\r\n\x1b[1;33mInstallation aborted.\x1b[0m\r\n');
          sendStatus('aborted', { message: 'Installation aborted' });
          return { success: true };
        }
        this.getLogger().error(`Failed to install ${type}: ${message}`, this.name);
        emit(`\r\n\x1b[1;31mInstallation failed: ${message}\x1b[0m\r\n`);
        sendStatus('failed', { message });
        return { success: false, error: message };
      } finally {
        this.installSessions.delete(type);
      }
    });

    ipcMain.handle(RUNTIME_INSTALL_STATUS, async () => {
      return { success: true, data: { statuses: [...this.installStates.values()] } };
    });

    ipcMain.handle(RUNTIME_INSTALL_ABORT, async (_event, type: string) => {
      const session = this.installSessions.get(type);
      if (!session) {
        return { success: false, error: `No active installation found for ${type}` };
      }
      session.controller.abort();
      try {
        session.pty?.kill();
      } catch {
        // The process may already have exited; aborting is best-effort.
      }
      return { success: true };
    });

    // Raw terminal input from the renderer. Keeping the PTY in the main process
    // means prompts from installers (password, license, [Y/n], ...) can be
    // answered exactly like in a normal terminal.
    ipcMain.on(RUNTIME_INSTALL_INPUT, (_event, payload: { type?: string; data?: string }) => {
      if (!payload?.type || typeof payload.data !== 'string') return;
      const session = this.installSessions.get(payload.type);
      if (!session?.pty) return;
      if (!session.inputLogged) {
        session.inputLogged = true;
        this.getLogger().info(`Terminal input is being forwarded to the ${payload.type} installer.`, this.name);
      }
      session.pty.write(payload.data);
    });

    ipcMain.on(RUNTIME_INSTALL_RESIZE, (_event, payload: { type?: string; cols?: number; rows?: number }) => {
      if (!payload?.type) return;
      const session = this.installSessions.get(payload.type);
      if (session?.pty && payload.cols && payload.rows) {
        try {
          session.pty.resize(payload.cols, payload.rows);
        } catch {
          // Ignore resize races while the process is exiting.
        }
      }
    });
  }

  /** Runtime folder owned by AiSphere. */
  private getRuntimeDir(type: RuntimeKind): string {
    return getDataPath('runtimes', type);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async runCapture(command: string, args: string[]): Promise<string> {
    let output = '';
    await this.getSandbox().runCommand(command, args, {
      onLog: (data) => { output += data; },
    });
    return output;
  }

  /** Resolves the executable inside the AiSphere runtime folder, falling back to PATH. */
  private runtimeBins: Map<string, string> = new Map();

  private resolveRuntimeBin(type: RuntimeKind): string {
    const cached = this.runtimeBins.get(type);
    if (cached && existsSync(cached)) return cached;

    const fileName = type === 'docker'
      ? 'docker.exe'
      : type === 'podman'
      ? 'podman.exe'
      : type === 'conda'
      ? 'conda.exe'
      : process.platform === 'win32' ? 'apptainer.exe' : 'apptainer';
    const managed = this.findExecutable(this.getRuntimeDir(type), fileName, 4);
    if (managed) {
      this.runtimeBins.set(type, managed);
      return managed;
    }
    return type;
  }

  /** Checks whether the CLI exists and whether its daemon is answering. */
  private async getEngineStatus(type: RuntimeKind): Promise<RuntimeEngineStatus> {
    const managed = existsSync(this.getRuntimeDir(type));
    const bin = this.resolveRuntimeBin(type);

    let installed = false;
    let version = '';
    try {
      version = (await this.runCapture(bin, ['--version'])).trim();
      installed = true;
    } catch {
      installed = false;
    }

    if (!installed) {
      return { type, installed: false, running: false, managed };
    }

    // Conda and Apptainer are plain CLI tools without a background engine.
    if (type === 'conda' || type === 'apptainer') {
      return { type, installed: true, running: true, managed, version };
    }

    const args = type === 'docker'
      ? ['info', '--format', '{{.ServerVersion}}']
      : ['info', '--format', '{{.Version.Version}}'];

    try {
      const serverVersion = (await this.runCapture(bin, args)).trim();
      return { type, installed: true, running: true, managed, version: serverVersion || version };
    } catch (error: any) {
      return {
        type,
        installed: true,
        running: false,
        managed,
        version,
        error: error?.message || String(error),
      };
    }
  }

  private engineStarts: Map<string, Promise<RuntimeEngineStatus>> = new Map();

  /** Starts the runtime engine (Docker Desktop / Podman machine) and waits for it. */
  private startEngine(type: RuntimeKind): Promise<RuntimeEngineStatus> {
    const current = this.engineStarts.get(type);
    if (current) return current;
    const startup = this.doStartEngine(type).finally(() => this.engineStarts.delete(type));
    this.engineStarts.set(type, startup);
    return startup;
  }

  /**
   * Docker Desktop opens its Dashboard window on startup unless this setting is
   * disabled. AiSphere runs the engine in the background, so make sure its GUI
   * stays out of the user's way.
   */
  private async disableDockerDashboardOnStartup(): Promise<void> {
    if (process.platform !== 'win32') return;
    const appData = process.env.APPDATA;
    if (!appData) return;

    const settingsPath = join(appData, 'Docker', 'settings-store.json');
    try {
      let settings: Record<string, unknown> = {};
      if (existsSync(settingsPath)) {
        const raw = await fs.readFile(settingsPath, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          this.getLogger().warn(`Unexpected Docker settings format in ${settingsPath}; leaving it unchanged.`, this.name);
          return;
        }
        settings = parsed as Record<string, unknown>;
      } else {
        await fs.mkdir(dirname(settingsPath), { recursive: true });
      }

      if (settings.OpenUIOnStartupDisabled === true) return;
      settings.OpenUIOnStartupDisabled = true;
      await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
      this.getLogger().info('Configured Docker Desktop to start without opening its Dashboard.', this.name);
    } catch (error: any) {
      // The engine can still be started even when this setting cannot be
      // written; the user may simply see the Docker Dashboard window.
      this.getLogger().warn(`Could not update Docker Desktop startup settings: ${error?.message || error}`, this.name);
    }
  }

  private async doStartEngine(type: RuntimeKind): Promise<RuntimeEngineStatus> {
    const label = runtimeLabel(type);
    const status = await this.getEngineStatus(type);
    if (!status.installed) {
      throw new Error(`${label} is not installed. Install it from the Runtimes page first.`);
    }
    if (status.running) return status;

    if (type === 'docker') {
      // Start the engine through Docker's own CLI. Unlike launching Docker
      // Desktop.exe directly, this can start Docker in the background without
      // opening the Dashboard window. The startup setting below also keeps the
      // Dashboard closed when Docker Desktop was not running yet.
      await this.disableDockerDashboardOnStartup();
      try {
        const output = (await this.runCapture(this.resolveRuntimeBin('docker'), ['desktop', 'start', '-d'])).trim();
        this.getLogger().info(`Docker Desktop start requested${output ? `: ${output}` : ''}`, this.name);
      } catch (error: any) {
        this.getLogger().warn(
          `Could not start Docker Desktop through its CLI (${error?.message || error}); launching the application directly.`,
          this.name,
        );
        const exe = this.findExecutable(this.getRuntimeDir('docker'), 'Docker Desktop.exe', 3);
        if (!exe) {
          throw new Error('Docker Desktop was not found in the AiSphere runtime folder. Start it manually and try again.');
        }
        const child = spawn(exe, [], { detached: true, stdio: 'ignore' });
        child.on('error', (spawnError) => {
          this.getLogger().error(`Failed to launch Docker Desktop: ${spawnError.message}`, this.name);
        });
        child.unref();
      }
    } else if (type === 'podman') {
      try {
        await this.runCapture(this.resolveRuntimeBin('podman'), ['machine', 'start']);
      } catch (error: any) {
        this.getLogger().warn(`Podman machine start failed: ${error?.message || error}`, this.name);
      }
    }

    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      await this.delay(2000);
      const next = await this.getEngineStatus(type);
      if (next.running) {
        this.getLogger().info(`${label} engine is ready (${next.version || 'unknown version'}).`, this.name);
        return next;
      }
    }

    throw new Error(`Timed out waiting for ${label} to start. Open ${label} manually and try again.`);
  }

  private engineStops: Map<string, Promise<RuntimeEngineStatus>> = new Map();

  /** Stops the runtime engine (Docker Desktop / Podman machine) and waits for it. */
  private stopEngine(type: RuntimeKind): Promise<RuntimeEngineStatus> {
    const current = this.engineStops.get(type);
    if (current) return current;
    const stopping = this.doStopEngine(type).finally(() => this.engineStops.delete(type));
    this.engineStops.set(type, stopping);
    return stopping;
  }

  private async doStopEngine(type: RuntimeKind): Promise<RuntimeEngineStatus> {
    const label = runtimeLabel(type);
    const status = await this.getEngineStatus(type);
    if (!status.installed) {
      throw new Error(`${label} is not installed.`);
    }
    if (type === 'conda' || type === 'apptainer') {
      throw new Error(`${label} does not have a background engine to stop.`);
    }
    if (!status.running) return status;

    if (type === 'docker') {
      try {
        const output = (await this.runCapture(this.resolveRuntimeBin('docker'), ['desktop', 'stop'])).trim();
        this.getLogger().info(`Docker Desktop stop requested${output ? `: ${output}` : ''}`, this.name);
      } catch (error: any) {
        // `docker desktop stop` fails when only the engine is left running
        // (e.g. the Dashboard was already closed); the polling below decides
        // whether the engine is actually gone.
        this.getLogger().warn(`Docker Desktop stop returned: ${error?.message || error}`, this.name);
      }
    } else if (type === 'podman') {
      try {
        await this.runCapture(this.resolveRuntimeBin('podman'), ['machine', 'stop']);
      } catch (error: any) {
        this.getLogger().warn(`Podman machine stop failed: ${error?.message || error}`, this.name);
      }
    }

    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await this.delay(1500);
      const next = await this.getEngineStatus(type);
      if (!next.running) {
        if (type === 'docker') {
          // Make sure no Docker GUI/helper processes are left in the tray.
          await this.stopProcessesUnder(this.getRuntimeDir('docker'), () => undefined);
        }
        this.getLogger().info(`${label} engine stopped.`, this.name);
        return { ...next, running: false };
      }
    }

    throw new Error(`Timed out waiting for ${label} to stop. Stop it manually and try again.`);
  }

  private async getRuntimeDetail(type: RuntimeKind): Promise<RuntimeDetail> {
    const installDir = this.getRuntimeDir(type);
    const installDirExists = existsSync(installDir);
    const status = await this.getEngineStatus(type);
    const bin = this.resolveRuntimeBin(type);
    const managedExecutable = this.findExecutable(
      installDir,
      type === 'docker' ? 'docker.exe' : type === 'podman' ? 'podman.exe' : type === 'conda' ? 'conda.exe' : 'apptainer.exe',
      4,
    );

    const lowerRoot = installDir.replace(/[\\/]+$/, '').toLowerCase();
    const pathEntries = (process.env.PATH || '')
      .split(delimiter)
      .filter((entry) => entry && entry.replace(/[\\/]+$/, '').toLowerCase().startsWith(lowerRoot));

    const detail: RuntimeDetail = {
      type,
      installed: status.installed,
      managed: installDirExists,
      version: status.version,
      platform: os.platform(),
      arch: os.arch(),
      installDir,
      installDirExists,
      executable: managedExecutable,
      pathEntries,
      engine: {
        hasEngine: type === 'docker' || type === 'podman',
        running: status.running,
        version: status.running ? status.version : undefined,
      },
    };

    if (detail.engine?.hasEngine && status.installed && !status.running) {
      detail.engine.error = `The ${runtimeLabel(type)} engine is not running.`;
    }

    if (type === 'docker' && status.installed && status.running) {
      try {
        const info = await this.runCapture(bin, ['info']);
        detail.engine!.info = this.parseDockerInfo(info);
      } catch (error: any) {
        detail.engine!.error = error?.message || String(error);
      }
    }

    return detail;
  }

  /** Extracts the useful fields from the human-readable `docker info` output. */
  private parseDockerInfo(text: string): Array<{ label: string; value: string }> {
    const fields = new Set([
      'Server Version', 'Storage Driver', 'Docker Root Dir', 'Operating System', 'OSType',
      'Architecture', 'CPUs', 'Total Memory', 'Containers', 'Running', 'Paused', 'Stopped',
      'Images', 'Logging Driver', 'Cgroup Driver', 'Cgroup Version', 'Kernel Version',
      'Default Runtime', 'Live Restore Enabled',
    ]);
    const seen = new Set<string>();
    const info: Array<{ label: string; value: string }> = [];

    for (const rawLine of text.split(/\r?\n/)) {
      // `docker info` indents most server fields with leading spaces.
      const match = rawLine.match(/^\s*([A-Za-z][A-Za-z0-9 _./-]*):\s*(.+)$/);
      if (!match) continue;
      const label = match[1].trim();
      const value = match[2].trim();
      if (!fields.has(label) || seen.has(label)) continue;
      seen.add(label);
      info.push({ label, value });
    }
    return info;
  }

  /** Stops every process whose executable lives under `dir` (Docker Desktop helper processes). */
  private async stopProcessesUnder(dir: string, emit: (data: string) => void): Promise<void> {
    if (process.platform !== 'win32') return;
    const script = [
      `$root = ${this.powerShellQuote(dir)};`,
      'Get-Process -ErrorAction SilentlyContinue | Where-Object {',
      '  try { $_.Path -and $_.Path.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) } catch { $false }',
      '} | ForEach-Object {',
      '  try { Stop-Process -Id $_.Id -Force -ErrorAction Stop; Write-Output ("Stopped " + $_.ProcessName) } catch { }',
      '}',
    ].join('\n');

    await new Promise<void>((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true,
        timeout: 30_000,
      }, (error, stdout, stderr) => {
        if (stdout) emit(stdout.replace(/\r?\n/g, '\r\n'));
        if (stderr) emit(stderr.replace(/\r?\n/g, '\r\n'));
        if (error) emit(`Process cleanup warning: ${error.message}\r\n`);
        resolve();
      });
    });
  }

  /** Removes uninstall registrations that point at the AiSphere runtime folder. */
  private async removeUninstallRegistrations(dir: string, emit: (data: string) => void): Promise<void> {
    if (process.platform !== 'win32') return;
    const script = [
      `$root = ${this.powerShellQuote(dir)};`,
      `$paths = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');`,
      '$removed = @();',
      'Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object {',
      '  $_.InstallLocation -and $_.InstallLocation.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)',
      '} | ForEach-Object {',
      '  $name = $_.PSChildName;',
      '  $removed += $name;',
      `  Remove-Item ("HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + $name) -Recurse -Force -ErrorAction SilentlyContinue;`,
      `  Remove-Item ("HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + $name) -Recurse -Force -ErrorAction SilentlyContinue;`,
      '};',
      'if ($removed.Count -gt 0) { Write-Output ("Removed uninstall registration: " + ($removed -join ", ")) }',
    ].join('\n');

    await new Promise<void>((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        windowsHide: true,
        timeout: 30_000,
      }, (error, stdout, stderr) => {
        if (stdout) emit(stdout.replace(/\r?\n/g, '\r\n'));
        if (stderr) emit(stderr.replace(/\r?\n/g, '\r\n'));
        if (error) this.getLogger().warn(`Uninstall registration cleanup failed: ${error.message}`, this.name);
        resolve();
      });
    });
  }

  private async removeDirectory(dir: string, emit: (data: string) => void): Promise<void> {
    emit(`Removing ${dir}...\r\n`);

    // Electron's asar-aware fs treats paths that end in ".asar" as archive
    // files and keeps a handle open in the archive cache. A runtime folder can
    // legitimately contain such a file (Docker Desktop ships
    // frontend/resources/app.asar), and then our own process would keep the
    // last file locked and the delete would never finish. Disable asar support
    // for the duration of the removal so the plain Node.js fs is used.
    const attempt = async () => {
      const proc = process as unknown as { noAsar?: boolean };
      const previous = proc.noAsar;
      proc.noAsar = true;
      try {
        await fs.rm(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
      } finally {
        proc.noAsar = previous;
      }
    };

    for (let attemptIndex = 0; attemptIndex < 3 && existsSync(dir); attemptIndex++) {
      try {
        if (attemptIndex > 0) {
          emit(`Removal attempt ${attemptIndex + 1}...\r\n`);
          await this.delay(2000);
        }
        await attempt();
      } catch (error: any) {
        emit(`Removal warning: ${error?.message || error}\r\n`);
      }
    }

    if (existsSync(dir)) {
      emit('Falling back to PowerShell for the remaining files...\r\n');
      await new Promise<void>((resolve) => {
        const script = `$ErrorActionPreference='SilentlyContinue'; Remove-Item -LiteralPath ${this.powerShellQuote(dir)} -Recurse -Force`;
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
          windowsHide: true,
          timeout: 600_000,
        }, (error, stdout, stderr) => {
          if (stdout) emit(stdout.replace(/\r?\n/g, '\r\n'));
          if (stderr) emit(stderr.replace(/\r?\n/g, '\r\n'));
          if (error) emit(`PowerShell removal warning: ${error.message}\r\n`);
          resolve();
        });
      });
    }

    if (existsSync(dir)) {
      throw new Error(`Could not remove ${dir}. Close any program using it and try again.`);
    }
  }

  /** Drops PATH entries owned by a runtime folder that was just removed. */
  private removeRuntimePaths(dir: string): void {
    const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
    const current = process.env[pathKey] || '';
    const prefix = dir.replace(/[\\/]+$/, '').toLowerCase();
    const kept = current.split(delimiter).filter((entry) => {
      if (!entry) return false;
      return !entry.replace(/[\\/]+$/, '').toLowerCase().startsWith(prefix);
    });
    process.env[pathKey] = kept.join(delimiter);
  }

  private async uninstallRuntime(type: RuntimeKind, emit: (data: string) => void): Promise<void> {
    const label = runtimeLabel(type);
    const runtimeDir = this.getRuntimeDir(type);

    if (!existsSync(runtimeDir)) {
      throw new Error(`${label} is not installed in the AiSphere folder (${runtimeDir}).`);
    }

    if (type === 'docker') {
      emit('Stopping Docker Desktop...\r\n');
      const dockerBin = this.findExecutable(runtimeDir, 'docker.exe', 4) || 'docker';
      try {
        await this.runCapture(dockerBin, ['desktop', 'stop']);
        emit('Docker Desktop stopped.\r\n');
      } catch (error: any) {
        emit(`Docker Desktop stop returned: ${error?.message || error}\r\n`);
      }
      await this.stopProcessesUnder(runtimeDir, emit);
      await this.clearStaleDockerRegistration(runtimeDir, emit);
      emit('Docker Desktop user data in %LOCALAPPDATA%\\Docker was left in place.\r\n');
    } else if (type === 'conda') {
      const uninstaller = this.findExecutable(runtimeDir, 'Uninstall-Miniconda3.exe', 2);
      if (uninstaller) {
        emit('Running the Miniconda uninstaller...\r\n');
        await new Promise<void>((resolve) => {
          execFile(uninstaller, ['/S'], { windowsHide: true, timeout: 300_000 }, (error) => {
            if (error) emit(`Miniconda uninstaller warning: ${error.message}\r\n`);
            resolve();
          });
        });
      }
    }

    await this.removeUninstallRegistrations(runtimeDir, emit);
    await this.removeDirectory(runtimeDir, emit);
    this.removeRuntimePaths(runtimeDir);
    this.runtimeBins.delete(type);
    emit(`Removed ${runtimeDir}\r\n`);
  }

  private async installRuntime(options: {
    type: string;
    platform: NodeJS.Platform;
    arch: string;
    downloadsDir: string;
    runtimeDir: string;
    session: RuntimeInstallSession;
    emit: (data: string) => void;
  }): Promise<void> {
    const { type, platform, arch, downloadsDir, runtimeDir, session, emit } = options;
    if (platform === 'win32') {
      return this.installWindowsRuntime(type, arch, downloadsDir, runtimeDir, session, emit);
    }
    if (platform === 'darwin') {
      return this.installMacRuntime(type, arch, downloadsDir, runtimeDir, session, emit);
    }
    if (platform === 'linux') {
      return this.installLinuxRuntime(type, arch, downloadsDir, runtimeDir, session, emit);
    }
    throw new Error(`Runtime installation is not supported on ${platform}.`);
  }

  private async installWindowsRuntime(
    type: string,
    arch: string,
    downloadsDir: string,
    runtimeDir: string,
    session: RuntimeInstallSession,
    emit: (data: string) => void,
  ): Promise<void> {
    switch (type) {
      case 'docker': {
        const installer = await this.downloadArtifact({
          url: arch === 'arm64'
            ? 'https://desktop.docker.com/win/main/arm64/Docker%20Desktop%20Installer.exe'
            : 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe',
          fileName: 'DockerDesktopInstaller.exe',
        }, downloadsDir, emit, session);

        const installerArgs = [
          'install',
          '--user',
          '--quiet',
          '--accept-license',
          '--backend=wsl-2',
          `--installation-dir=${runtimeDir}`,
        ];

        emit(`\r\nRunning Docker Desktop installer (per-user mode)...\r\n`);
        emit(`Docker Desktop will be installed into ${runtimeDir}\r\n\r\n`);
        try {
          await this.runInteractive(session, installer, installerArgs, { cwd: runtimeDir, emit });
        } catch (error: any) {
          const message = error?.message || String(error);
          const installed = existsSync(join(runtimeDir, 'Docker Desktop.exe'))
            || existsSync(join(runtimeDir, 'resources', 'bin', 'docker.exe'));

          if (installed) {
            emit('Docker Desktop is already installed in the target directory.\r\n');
            return;
          }

          // Exit code 3 with "Existing installation is up to date" happens when
          // a previous install was registered but its files were removed (for
          // example by extracting a new build over the same folder). Remove the
          // stale registration and retry once.
          if (/code 3\b/i.test(message)) {
            emit('Docker Desktop found a stale installation record. Clearing it and retrying...\r\n');
            await this.clearStaleDockerRegistration(runtimeDir, emit);
            await this.runInteractive(session, installer, installerArgs, { cwd: runtimeDir, emit });
            return;
          }

          throw error;
        }
        return;
      }
      case 'podman': {
        const artifactArch = arch === 'arm64' ? 'arm64' : 'amd64';
        const archive = await this.downloadArtifact({
          url: `https://github.com/containers/podman/releases/latest/download/podman-remote-release-windows_${artifactArch}.zip`,
          fileName: `podman-remote-release-windows_${artifactArch}.zip`,
        }, downloadsDir, emit, session);

        emit(`\r\nExtracting Podman into ${runtimeDir}...\r\n`);
        await this.runInteractive(session, 'powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-Command',
          `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath ${this.powerShellQuote(archive)} -DestinationPath ${this.powerShellQuote(runtimeDir)} -Force`,
        ], { cwd: runtimeDir, emit });
        return;
      }
      case 'conda': {
        const artifactArch = arch === 'arm64' ? 'arm64' : 'x86_64';
        const installer = await this.downloadArtifact({
          url: `https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-${artifactArch}.exe`,
          fileName: `Miniconda3-latest-Windows-${artifactArch}.exe`,
        }, downloadsDir, emit, session);

        emit(`\r\nRunning the Miniconda installer...\r\n`);
        emit(`Conda will be installed into ${runtimeDir}\r\n\r\n`);
        // /D must be the last argument and is not quoted: that is how the NSIS
        // based Miniconda installer parses a custom destination folder.
        await this.runInteractive(session, installer, [
          '/S',
          '/InstallationType=JustMe',
          '/RegisterPython=0',
          '/AddToPath=0',
          `/D=${runtimeDir}`,
        ], { cwd: runtimeDir, emit });
        return;
      }
      case 'apptainer':
        throw new Error('Apptainer is only supported on Linux. Use Docker or Podman on Windows.');
      default:
        throw new Error(`Unsupported runtime: ${type}`);
    }
  }

  /**
   * Removes a leftover Docker Desktop uninstall registration that points at
   * `runtimeDir` when the actual installation files no longer exist. Docker's
   * installer refuses to continue ("Existing installation is up to date",
   * exit code 3) in that situation.
   */
  private async clearStaleDockerRegistration(
    runtimeDir: string,
    emit: (data: string) => void,
  ): Promise<void> {
    const keys = [
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Docker Desktop',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Docker Desktop',
    ];
    const normalize = (value: string) => value.replace(/[\\/]+$/, '').toLowerCase();

    for (const key of keys) {
      const location = await new Promise<string>((resolve) => {
        execFile('reg.exe', ['query', key, '/v', 'InstallLocation'], { windowsHide: true }, (error, stdout) => {
          if (error || !stdout) return resolve('');
          const match = stdout.match(/InstallLocation\s+REG_\w+\s+(.+)/i);
          resolve(match?.[1]?.trim() || '');
        });
      });

      if (!location) continue;
      // Only remove registrations that point at our target (now missing) or
      // at a location that no longer exists. Real installs elsewhere are kept.
      if (normalize(location) !== normalize(runtimeDir) && existsSync(location)) continue;

      emit(`Removing Docker Desktop registration at ${location}\r\n`);
      await new Promise<void>((resolve) => {
        execFile('reg.exe', ['delete', key, '/f'], { windowsHide: true }, () => resolve());
      });
    }
  }

  private async installMacRuntime(
    type: string,
    arch: string,
    downloadsDir: string,
    runtimeDir: string,
    session: RuntimeInstallSession,
    emit: (data: string) => void,
  ): Promise<void> {
    switch (type) {
      case 'docker':
        emit('Installing Docker Desktop with Homebrew...\r\n');
        await this.runInteractive(session, 'brew', ['install', '--cask', 'docker'], { cwd: runtimeDir, emit });
        return;
      case 'podman':
        emit('Installing Podman with Homebrew...\r\n');
        await this.runInteractive(session, 'brew', ['install', 'podman'], { cwd: runtimeDir, emit });
        return;
      case 'conda': {
        const artifactArch = arch === 'arm64' ? 'arm64' : 'x86_64';
        const installer = await this.downloadArtifact({
          url: `https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-${artifactArch}.sh`,
          fileName: `Miniconda3-latest-MacOSX-${artifactArch}.sh`,
        }, downloadsDir, emit, session);

        emit(`\r\nInstalling Miniconda into ${runtimeDir}...\r\n`);
        await this.runInteractive(session, '/bin/bash', [
          installer,
          '-b',
          '-u',
          '-p', runtimeDir,
        ], { cwd: runtimeDir, emit });
        return;
      }
      case 'apptainer':
        throw new Error('Apptainer is only supported on Linux. Use Docker or Podman on macOS.');
      default:
        throw new Error(`Unsupported runtime: ${type}`);
    }
  }

  private async installLinuxRuntime(
    type: string,
    arch: string,
    downloadsDir: string,
    runtimeDir: string,
    session: RuntimeInstallSession,
    emit: (data: string) => void,
  ): Promise<void> {
    switch (type) {
      case 'docker': {
        const script = await this.downloadArtifact({
          url: 'https://get.docker.com',
          fileName: 'get-docker.sh',
        }, downloadsDir, emit, session);

        emit('\r\nInstalling Docker Engine...\r\n');
        await this.runInteractive(session, 'sh', [script], { cwd: runtimeDir, emit });
        return;
      }
      case 'podman':
        emit('Installing Podman with the system package manager...\r\n');
        await this.runInteractive(session, 'sh', ['-c', [
          'if command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y podman;',
          'elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y podman;',
          'elif command -v yum >/dev/null 2>&1; then sudo yum install -y podman;',
          'else echo "No supported package manager found (apt-get, dnf, yum)." >&2; exit 1; fi',
        ].join(' ')], { cwd: runtimeDir, emit });
        return;
      case 'apptainer':
        emit('Installing Apptainer with the system package manager...\r\n');
        await this.runInteractive(session, 'sh', ['-c', [
          'if command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y apptainer;',
          'elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y apptainer;',
          'else echo "No supported package manager found (apt-get, dnf)." >&2; exit 1; fi',
        ].join(' ')], { cwd: runtimeDir, emit });
        return;
      case 'conda': {
        const artifactArch = arch === 'arm64' ? 'aarch64' : 'x86_64';
        const installer = await this.downloadArtifact({
          url: `https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-${artifactArch}.sh`,
          fileName: `Miniconda3-latest-Linux-${artifactArch}.sh`,
        }, downloadsDir, emit, session);

        emit(`\r\nInstalling Miniconda into ${runtimeDir}...\r\n`);
        await this.runInteractive(session, '/bin/bash', [
          installer,
          '-b',
          '-u',
          '-p', runtimeDir,
        ], { cwd: runtimeDir, emit });
        return;
      }
      default:
        throw new Error(`Unsupported runtime: ${type}`);
    }
  }

  private async downloadArtifact(
    artifact: InstallerArtifact,
    downloadsDir: string,
    emit: (data: string) => void,
    session: RuntimeInstallSession,
  ): Promise<string> {
    const filePath = join(downloadsDir, artifact.fileName);
    if (existsSync(filePath)) {
      try {
        const stat = await fs.stat(filePath);
        if (stat.size > 0) {
          emit(`Using cached installer: ${filePath}\r\n`);
          return filePath;
        }
      } catch {
        // Fall through and download the artifact again.
      }
    }

    session.onStatus?.('downloading', {
      message: `Downloading ${artifact.fileName}`,
      percent: 0,
    });
    emit(`Downloading ${artifact.url}\r\n  -> ${filePath}\r\n`);
    const downloader = new Downloader(this.getLogger());
    let lastPercent = -1;
    let lastBytes = 0;
    const result = await downloader.download(artifact.url, downloadsDir, {
      filename: artifact.fileName,
      signal: session.controller.signal,
      onProgress: (progress) => {
        const percent = progress.totalBytes > 0
          ? Math.floor((progress.downloadedBytes / progress.totalBytes) * 100)
          : -1;
        const shouldEmit = percent !== lastPercent
          || (percent < 0 && progress.downloadedBytes - lastBytes >= 5 * 1024 * 1024);
        if (!shouldEmit) return;
        lastPercent = percent;
        lastBytes = progress.downloadedBytes;
        session.onStatus?.('downloading', {
          message: `Downloading ${artifact.fileName}`,
          percent: percent >= 0 ? percent : undefined,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes || undefined,
        });
        const downloaded = (progress.downloadedBytes / (1024 * 1024)).toFixed(1);
        const total = progress.totalBytes > 0
          ? ` / ${(progress.totalBytes / (1024 * 1024)).toFixed(1)} MB`
          : '';
        emit(`\rDownloading... ${percent >= 0 ? `${percent}% ` : ''}${downloaded} MB${total}`);
      },
    });
    emit('\r\n');

    if (!result.success || !result.filePath) {
      // Never leave a partial installer behind: the next attempt would treat
      // it as a cached file and fail to run it.
      try {
        await fs.rm(filePath, { force: true });
      } catch {
        // Ignore cleanup failures.
      }
      throw new Error(result.error || `Failed to download ${artifact.url}`);
    }
    return result.filePath;
  }

  private runInteractive(
    session: RuntimeInstallSession,
    command: string,
    args: string[],
    options: InteractiveRunOptions,
  ): Promise<void> {
    if (session.controller.signal.aborted) {
      return Promise.reject(new Error('Installation aborted'));
    }

    this.getLogger().info(`Runtime installer command: ${command} ${args.join(' ')}`, this.name);
    session.onStatus?.('installing', { message: `Running ${command}` });

    return new Promise<void>((resolve, reject) => {
      let child: pty.IPty;
      try {
        child = pty.spawn(command, args, {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: options.cwd,
          env: { ...process.env } as Record<string, string>,
        });
      } catch (error: any) {
        reject(error);
        return;
      }

      session.pty = child;
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        session.controller.signal.removeEventListener('abort', onAbort);
        callback();
      };

      const onAbort = () => {
        try {
          child.kill();
        } catch {
          // The process may already have exited.
        }
        // Some Windows GUI installers do not report an exit event promptly.
        setTimeout(() => finish(() => reject(new Error('Installation aborted'))), 3000);
      };

      child.onData((data) => options.emit(data));
      child.onExit(({ exitCode, signal }) => {
        if (session.pty === child) session.pty = undefined;
        if (session.controller.signal.aborted) {
          finish(() => reject(new Error('Installation aborted')));
        } else if (exitCode === 0) {
          finish(resolve);
        } else {
          finish(() => reject(new Error(`Installer exited with code ${exitCode}${signal ? ` (${signal})` : ''}`)));
        }
      });

      session.controller.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private powerShellQuote(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  /**
   * Adds runtime binaries installed under the app root to PATH so both the
   * version checks and the application runners can find them.
   */
  private registerRuntimePaths(): void {
    const runtimesRoot = getDataPath('runtimes');
    const entries = new Set<string>();

    const known = [
      join(runtimesRoot, 'docker'),
      join(runtimesRoot, 'docker', 'resources', 'bin'),
      join(runtimesRoot, 'docker', 'Docker', 'resources', 'bin'),
      join(runtimesRoot, 'podman'),
      join(runtimesRoot, 'conda'),
      join(runtimesRoot, 'conda', 'Scripts'),
      join(runtimesRoot, 'conda', 'condabin'),
    ];
    for (const dir of known) {
      if (existsSync(dir)) entries.add(dir);
    }

    // Podman archives from GitHub may contain a nested release folder, and the
    // Docker Desktop layout can vary between versions. Locate their executables
    // and add the containing directory as well.
    if (!existsSync(join(runtimesRoot, 'podman', 'podman.exe'))) {
      const podman = this.findExecutable(join(runtimesRoot, 'podman'), 'podman.exe', 3);
      if (podman) entries.add(dirname(podman));
    }
    if (!existsSync(join(runtimesRoot, 'docker', 'resources', 'bin', 'docker.exe'))) {
      const docker = this.findExecutable(join(runtimesRoot, 'docker'), 'docker.exe', 4);
      if (docker) entries.add(dirname(docker));
    }

    if (entries.size === 0) return;

    const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
    const current = (process.env[pathKey] || '').split(delimiter).filter(Boolean);
    const currentLower = new Set(current.map((entry) => entry.toLowerCase()));
    const additions = [...entries].filter((entry) => !currentLower.has(entry.toLowerCase()));
    if (additions.length === 0) return;

    process.env[pathKey] = [...additions, ...current].join(delimiter);
    this.getLogger().info(`Added runtime paths to PATH: ${additions.join(', ')}`, this.name);
  }

  private findExecutable(root: string, fileName: string, maxDepth: number): string | undefined {
    if (!existsSync(root)) return undefined;
    const target = fileName.toLowerCase();
    const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];

    while (stack.length > 0) {
      const { dir, depth } = stack.pop()!;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase() === target) {
          return join(dir, entry.name);
        }
        if (entry.isDirectory() && depth < maxDepth && entry.name !== 'node_modules' && entry.name !== '.git') {
          stack.push({ dir: join(dir, entry.name), depth: depth + 1 });
        }
      }
    }

    return undefined;
  }


  createRuntime(rc: RuntimeClass): Runtime {
    switch (rc) {
      case RuntimeClass.Apptainer: return new RuntimeApptainer(RuntimeClass.Apptainer);
      case RuntimeClass.Docker: return new RuntimeDocker(RuntimeClass.Docker);
      case RuntimeClass.Podman: return new RuntimePodman(RuntimeClass.Podman);
      case RuntimeClass.Conda: return new RuntimeConda(RuntimeClass.Conda);
      default: throw new Error(`Unsupported runtime: ${rc}`);
    }
  }

  getRuntime(rc: RuntimeClass): Runtime {
    if (!this.runtimes[rc]) {
      const runtime = this.createRuntime(rc);
      this.runtimes[rc] = runtime;
    }
    return this.runtimes[rc]!;
  }

  async install(app: Application, event?: any): Promise<IpcResponse<any>> {
    const rc = (app.runtime as any)?.runtime as RuntimeClass;
    if (!rc) {
      throw new Error(`Application ${app.name} does not specify a valid runtime type.`);
    }
    return this.getRuntime(rc).install(app, event);
  }

  async run(app: Application): Promise<Task> {
    const runtimeConfig = app.runtime as { runtime: RuntimeClass; options?: string[]; startscript?: string; args?: string[] };
    const rc = runtimeConfig?.runtime;
    if (!rc) {
      throw new Error(`Application ${app.name} does not specify a valid runtime type.`);
    }

    const runtime = this.getRuntime(rc);

    // If a task is already recorded for this app (e.g. it was stopped without
    // cleanup), restart the existing container instance instead of creating a
    // new one. A failed task must be discarded: its container might not exist
    // or might have been created with a bad configuration.
    if (app.task?.status === 'failed') {
      this.getLogger().info(`Discarding failed task ${app.task.id} for ${app.name}`, this.name);
      delete this.tasks[app.task.id];
      app.task = undefined;
    }

    if (app.task?.id) {
      const taskId = app.task.id;
      let task = this.tasks[taskId];
      if (!task) {
        // Reconstruct task from metadata if memory was cleared (e.g. backend restart)
        task = { ...app.task, app } as Task;
        this.tasks[taskId] = task;
      }

      this.getLogger().info(`Restarting application ${app.name} (Task ID: ${taskId})`, this.name);
      try {
        if (app.task) app.task.status = 'starting';
        const result = await runtime.restart(task);
        if (app.task) app.task.status = result.status;
        return result;
      } catch (e: any) {
        task.status = 'failed';
        if (app.task) app.task.status = 'failed';
        this.getLogger().error(`Failed to restart task ${taskId}: ${e.message}`, this.name);
        throw e;
      }
    }

    const taskId = randomUUID();
    const task: Task = {
      id: taskId,
      rc,
      status: 'starting',
      options: runtimeConfig.options,
      startscript: runtimeConfig.startscript,
      args: runtimeConfig.args,
      app
    };

    this.tasks[taskId] = task;
    // Store only the serializable metadata of the primary task on the app object
    app.task = {
      id: task.id,
      rc: task.rc,
      options: task.options,
      startscript: task.startscript,
      args: task.args,
      status: task.status
    };
    (app as any).error = undefined;
    this.getLogger().info(`Launching application ${app.name} (Task ID: ${taskId})`, this.name);

    try {
      const result = await runtime.run(task); // This result is the full Task object
      if (app.task) {
        app.task.status = result.status;
        app.task.hostPorts = result.hostPorts;
      }
      return result;
    } catch (e: any) {
      task.status = 'failed';
      if (app.task) app.task.status = 'failed'; // Update the status on the app's task metadata
      this.getLogger().error(`Failed to launch task ${taskId}: ${e.message}`, this.name);
      throw e;
    }
  }

  // Pause all tasks in the application
  async pause(app: Application): Promise<void> {
    const tasks = Object.values(this.tasks).filter(t => t.app.id === app.id);
    for (const task of tasks) {
      const runtime = this.getRuntime(task.rc);
      await runtime.pause(task); // This will update task.status in memory
      if (task.app.task) task.app.task.status = task.status; // Sync status to app's task metadata
    }
  }

  // Stop all tasks in the application
  async stop(app: Application): Promise<void> {
    const taskId = app.task?.id;
    if (!taskId) return;

    const task = this.tasks[taskId];
    if (task) {
      this.getLogger().info(`Stopping task ${taskId} of application ${app.name}`, this.name);
      await this.getRuntime(task.rc).stop(task);
      delete this.tasks[taskId];
    }

    // Clear the task reference from the application object
    app.task = undefined;
  }

  getShellConfig(app: Application): { command: string; args: string[] } {
    return this.getRuntimeForApp(app).getShellConfig(this.getLiveTask(app));
  }

  getLogsConfig(app: Application): { command: string; args: string[] } {
    return this.getRuntimeForApp(app).getLogsConfig(this.getLiveTask(app));
  }

  shellAttach(app: Application): { command: string; args: string[] } {
    return this.getRuntimeForApp(app).shellAttach(this.getLiveTask(app));
  }

  async openInteractiveShell(app: Application): Promise<void> {
    return this.getRuntimeForApp(app).openInteractiveShell(this.getLiveTask(app));
  }

  // Get status of a task
  async status(task: Task): Promise<typeof task.status> {
    const runtime = this.getRuntime(task.rc);
    const s = await runtime.status(task);
    this.getLogger().info(`Status of app ${task.app.id} task ${task.id}: ${s}`, this.name);
    task.status = s;
    return task.status;
  }

  async inspect(app: Application): Promise<Record<string, any>> {
    const rc = (app.runtime as any)?.runtime as RuntimeClass;
    if (!rc) throw new Error(`Application ${app.name} does not specify a valid runtime type.`);
    return this.getRuntime(rc).inspect(app);
  }

  /**
   * Helper to retrieve the current active task from memory based on the application's metadata.
   */
  private getLiveTask(app: Application): Task {
    const taskId = app.task?.id;
    if (!taskId) throw new Error(`No active task ID found for ${app.name}`);

    const task = this.tasks[taskId];
    if (!task) {
      // Fallback: Reconstruct task from app metadata if not in memory (e.g. after backend restart)
      return { ...app.task, app } as Task;
    }
    return task;
  }

  /**
   * Helper to get the correct runtime implementation for an application.
   */
  private getRuntimeForApp(app: Application): Runtime {
    const rc = app.task?.rc || (app.runtime as any)?.runtime;
    if (!rc) throw new Error(`No runtime class found for ${app.name}`);
    return this.getRuntime(rc as RuntimeClass);
  }
}
