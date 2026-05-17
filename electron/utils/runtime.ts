import { Application } from '../../src/types/api';
import { LogService } from '../services/LogService';
import { ServiceContainer } from '..//services/ServiceContainer';
import { spawn } from 'child_process';
import { ServiceName } from '../types/IService';
import { dirname, join } from 'path';
import { SandboxService } from '..//services/SandboxService';
import { App, app } from 'electron';
import { Downloader } from './downloader';
import { IpcResponse } from '../../src/shared/channel-types';

export enum RuntimeClass {
  Apptainer = 'apptainer',
  Docker =  'docker',
  Podman = 'podman',
  Conda = 'conda',
  Native = 'native'
}

export interface Task {
  id: string,
  rc: RuntimeClass,
  status: 'starting' | 'running' | 'pausing' | 'paused' | 'stopping' | 'stopped' | 'failed',
  options?: string[],
  startscript?: string,
  args?: string[],
  app: Application,
}

/**
 * Base Runtime Service defining the interface for application lifecycle management.
 */
export abstract class Runtime {
  private runtimeClass: RuntimeClass;

  constructor(rc: RuntimeClass) { this.runtimeClass = rc; }

  getRuntimeClass() { return this.runtimeClass; }

  getSanboxService() {
    return ServiceContainer.getInstance().get<SandboxService>(ServiceName.SandboxService);
  }

  getRuntimeRootDir() {
    return join(app.getAppPath(), 'runtimes', this.getRuntimeClass(), 'x86_64');
  }

  getLogger() {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  /** Performs application-specific installation logic within the runtime */
  abstract install(app: Application, event?: any): Promise<IpcResponse<any>>;

  /** Starts the application */
  abstract run(task: Task): Promise<Task>;

  /** Restarts an existing application task */
  abstract restart(task: Task): Promise<Task>;

  /** Pauses the application if supported by the runtime */
  abstract pause(task: Task): Promise<void>;

  /** Stops the application */
  abstract stop(task: Task): Promise<void>;

  /** Returns the shell command and arguments to attach to the task */
  abstract shellAttach(task: Task): { command: string; args: string[] };

  /** Returns the shell command and arguments for a PTY session */
  abstract getShellConfig(task: Task): { command: string; args: string[] };

  /** Returns the shell command and arguments for log streaming */
  abstract getLogsConfig(task: Task): { command: string; args: string[] };

  /** Opens an interactive shell into the running application */
  abstract openInteractiveShell(task: Task): Promise<void>;

  /** Checks the current status of the application */
  abstract status(task: Task): Promise<'running' | 'stopped' | 'paused' | 'unknown'>;

  /** Inspects the application file and returns metadata */
  abstract inspect(app: Application): Promise<Record<string, any>>;
}

/**
 * Implementation for Apptainer (Singularity) containers.
 * Uses Apptainer instances for background execution.
 */
export class RuntimeApptainer extends Runtime {

  private getRuntimeBinPath() {
    // return join(this.getRuntimeRootDir(), 'bin', this.getRuntimeClass());
    return this.getRuntimeClass();
  }

  async install(app: Application, event?: any): Promise<IpcResponse<any>> {
      this.getLogger().info(`Installation requested for: ${app.name}`);
      if (!app.install_url) {
        return { success: false, error: 'Missing installation URL' };
      }

      if (!app.apphomedir) {
        return { success: false, error: 'Missing apphomedir' };
      }

      const downloader = new Downloader(this.getLogger());
      const downloadResult = await downloader.download(app.install_url, app.apphomedir);

      if (downloadResult.success) {
        app.install = {
          installed: true,
          installed_at: new Date().toDateString(),
          installed_package: downloadResult.filePath || undefined
        };
        this.getLogger().info(`Installation completed for: ${app.name}`, 'ExploreService');
        return { success: true, data: app };
      }

      this.getLogger().error(`Installation failed for: ${app.name}. Error: ${downloadResult.error}`, 'ExploreService');
      return { success: false, error: downloadResult.error };
  }

  async run(task: Task): Promise<Task> {
    this.getLogger().info(`Starting Apptainer instance for Application ${task.app.name}`, 'RuntimeApptainer');
    if (!task.app.install?.installed_package) {
      task.status = 'failed';
      return task;
    }
    const sifPath = task.app.install.installed_package;
    await this.getSanboxService().runCommand(this.getRuntimeBinPath(),
      [ 'instance', 'start', ...(task.options || []), sifPath, task.id,
        ...(task.startscript ? [ task.startscript, ...(task.args || []) ] : [])
      ],
      {
        cwd: app.getAppPath(),
        onLog: (msg) => this.getLogger().debug(msg, 'RuntimeApptainer')
      }
    );
    task.status = 'running';
    return task;
  }

  async restart(task: Task): Promise<Task> {
    this.getLogger().info(`Restarting Apptainer instance ${task.id}`, 'RuntimeApptainer');
    try {
      await this.stop(task);
    } catch (e) {
      // Ignore errors if the instance was already stopped or doesn't exist
    }
    return this.run(task);
  }

  async pause(task: Task): Promise<void> {
    this.getLogger().warn(`Pause not directly supported by Apptainer instances for ${task.id}`, 'RuntimeApptainer');
  }

  async stop(task: Task): Promise<void> {
    this.getLogger().info(`Stopping Apptainer instance ${task.id}`, 'RuntimeApptainer');
    await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['instance', 'stop', task.id], {
      cwd: app.getAppPath(),
      onLog: (msg) => this.getLogger().debug(msg, 'RuntimeApptainer')
    });
  }

  shellAttach(task: Task): { command: string; args: string[] } {
    return {
      command: this.getRuntimeBinPath(),
      args: ['shell', `instance://${task.id}`]
    };
  }

  getShellConfig(task: Task): { command: string; args: string[] } {
    return this.shellAttach(task);
  }

  getLogsConfig(task: Task): { command: string; args: string[] } {
    return {
      command: this.getRuntimeBinPath(),
      args: ['instance', 'list'] // Apptainer doesn't have a direct logs command; instance list shows status.
    };
  }

  async openInteractiveShell(task: Task): Promise<void> {
    this.getLogger().info(`Opening interactive shell for Apptainer instance ${task.id}`, 'RuntimeApptainer');
    const config = this.shellAttach(task);
    const shellCommandString = `${config.command} ${config.args.join(' ')}`;

    let shellCommand: string;
    let shellArgs: string[] = [];

    if (process.platform === 'win32') {
      // On Windows, use cmd.exe to open a new console window
      shellCommand = 'cmd.exe';
      // /c executes the command and then terminates, /k executes and keeps the window open
      shellArgs = ['/c', `start cmd.exe /k "${shellCommandString}"`];
    } else if (process.platform === 'darwin') {
      // On macOS, use 'open -a Terminal.app' to launch a new terminal.
      // We pass arguments to bash to execute our command and then keep the shell open.
      shellCommand = 'open';
      shellArgs = ['-a', 'Terminal.app', '--args', 'bash', '-c', `${shellCommandString}; exec bash`];
    } else { // Linux
      // Try common terminal emulators. x-terminal-emulator is a good alias for the default.
      shellCommand = 'x-terminal-emulator';
      shellArgs = ['-e', shellCommandString];
    }

    try {
      spawn(shellCommand, shellArgs, {
        detached: true, // Detach the child process from the parent
        stdio: 'ignore', // Ignore stdio to prevent it from blocking the main process
        env: process.env, // Inherit environment, including PATH from EnvService
      }).unref(); // Allow the parent process to exit independently of the child
      this.getLogger().info(`Launched interactive shell command: ${shellCommand} ${shellArgs.join(' ')}`, 'RuntimeApptainer');
    } catch (error: any) {
      this.getLogger().error(`Failed to open interactive shell for ${task.id}: ${error.message}`, 'RuntimeApptainer');
      throw new Error(`Failed to open interactive shell: ${error.message}`);
    }
  }

  async status(task: Task): Promise<'running' | 'stopped' | 'paused' | 'unknown'> {
    try {
      let isRunning = false;
      await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['instance', 'list', '--json'], {
        cwd: app.getAppPath(),
        onLog: (data) => {
          if (data.includes(task.id)) isRunning = true;
        }
      });
      // Apptainer instances only exist while running. If not in list, the instance is gone.
      return isRunning ? 'running' : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async inspect(appData: Application): Promise<Record<string, any>> {
    this.getLogger().info(`Inspecting Apptainer image for ${appData.name}`, 'RuntimeApptainer');
    if (!appData.install?.installed_package) {
      return {};
    }
    const sifPath = appData.install.installed_package;
    let output = '';
    try {
      await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['inspect', '--json', sifPath], {
        cwd: app.getAppPath(),
        onLog: (msg) => { output += msg; }
      });
      const jsonStart = output.indexOf('{');
      if (jsonStart === -1) return {};
      const jsonStr = output.substring(jsonStart).trim();
      return JSON.parse(jsonStr);
    } catch (e: any) {
      this.getLogger().error(`Failed to inspect ${appData.name}: ${e.message}`, 'RuntimeApptainer');
      return {};
    }
  }
}

/**
 * Implementation for Podman containers.
 */
export class RuntimePodman extends Runtime {
  private getRuntimeBinPath() {
    return this.getRuntimeClass();
  }

  async importImage(app: Application) {
    if (!app.install || !app.install.installed_package) {
      throw new Error(`Missing installed package for application ${app.name}`)
    }

    const tarball = app.install.installed_package;
    if (tarball.endsWith('.tar')) {
      this.getLogger().info(`Image is a tarball, attempting to load: ${tarball}`, 'RuntimePodman');
      let loadOutput = '';
      await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['load', '-i', tarball], {
        cwd: app.apphomedir,
        onLog: (msg) => {
          loadOutput += msg;
          this.getLogger().debug(msg, 'RuntimePodman');
        }
      });

      const imageMatch = loadOutput.match(/Loaded image: (.*)/i) || loadOutput.match(/Loaded image ID: (.*)/i);
      if (imageMatch && imageMatch[1]) {
        const loadedImage = imageMatch[1].trim();
        this.getLogger().info(`Detected loaded image: ${loadedImage}`, 'RuntimePodman');

        // Persist the loaded image identifier back to the application data structure
        // to avoid redundant 'podman load' operations in subsequent runs.
        app.install.installed_image = loadedImage;
      }
    }
  }

  async install(app: Application, event?: any): Promise<IpcResponse<any>> {
    this.getLogger().info(`Installing Application ${app.name} into Podman`, 'RuntimePodman');
    if (!app.install_url) {
      return { success: false, error: 'Missing installation URL' };
    }

    if (!app.apphomedir) {
      return { success: false, error: 'Missing apphomedir' };
    }

    const downloader = new Downloader(this.getLogger());
    const downloadResult = await downloader.download(app.install_url, app.apphomedir);

    if (downloadResult.success) {
      app.install = {
        installed: true,
        installed_at: new Date().toDateString(),
        installed_package: downloadResult.filePath || undefined
      };
      this.importImage(app);
      return { success: true };
    }

    this.getLogger().error(`Installation failed for: ${app.name}. Error: ${downloadResult.error}`, 'ExploreService');
    return { success: false, error: downloadResult.error };
  }

  async run(task: Task): Promise<Task> {
    try {
      this.getLogger().info(`Starting Podman container for Application ${task.app.name}`, 'RuntimePodman');
      // Prefer the loaded image name/ID if it exists, otherwise fall back to the installation path
      if (!task.app.install || (!task.app.install.installed_image && !task.app.install.installed_package)) {
        task.status = 'failed';
        return task;
      }
      let image = task.app.install.installed_image || task.app.install.installed_package;
      if (!image) throw new Error('No image identifier found for Podman run');

      await this.getSanboxService().runCommand(this.getRuntimeBinPath(),
        ['run', '-d', '--name', task.id, ...(task.options || []), image, ...(task.args || [])],
        {
          cwd: app.getAppPath(),
          onLog: (msg) => this.getLogger().debug(msg, 'RuntimePodman')
        }
      );
      task.status = 'running';
      return task;
    } catch (e: any) {
      task.status = 'failed';
      throw e;
    }
  }

  async restart(task: Task): Promise<Task> {
    this.getLogger().info(`Restarting Podman container ${task.id}`, 'RuntimePodman');
    // podman restart handles containers in any state (stopped, exited, created, or running)
    await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['restart', task.id], {
      cwd: app.getAppPath(),
      onLog: (msg) => this.getLogger().debug(msg, 'RuntimePodman')
    });
    task.status = 'running';
    return task;
  }

  async pause(task: Task): Promise<void> {
    this.getLogger().info(`Pausing Podman container ${task.id}`, 'RuntimePodman');
    await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['pause', task.id], {
      cwd: app.getAppPath(),
      onLog: (msg) => this.getLogger().debug(msg, 'RuntimePodman')
    });
    task.status = 'paused';
  }

  async stop(task: Task): Promise<void> {
    this.getLogger().info(`Stopping Podman container ${task.id}`, 'RuntimePodman');
    try {
      await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['stop', task.id], {
        cwd: app.getAppPath(),
        onLog: (msg) => this.getLogger().debug(msg, 'RuntimePodman')
      });
    } catch (e: any) {
      this.getLogger().debug(`Podman stop failed for ${task.id} (likely already stopped): ${e.message}`, 'RuntimePodman');
    }

    this.getLogger().info(`Removing Podman container ${task.id}`, 'RuntimePodman');
    await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['rm', '-f', task.id], {
      cwd: app.getAppPath(),
      onLog: (msg) => this.getLogger().debug(msg, 'RuntimePodman')
    });
  }

  shellAttach(task: Task): { command: string; args: string[] } {
    return {
      command: this.getRuntimeBinPath(),
      args: ['exec', '-it', task.id, '/bin/sh']
    };
  }

  getShellConfig(task: Task): { command: string; args: string[] } {
    return this.shellAttach(task);
  }

  getLogsConfig(task: Task): { command: string; args: string[] } {
    return {
      command: this.getRuntimeBinPath(),
      args: ['logs', '-f', task.id]
    };
  }

  async openInteractiveShell(task: Task): Promise<void> {
    this.getLogger().info(`Opening interactive shell for Podman container ${task.id}`, 'RuntimePodman');
    const config = this.shellAttach(task);
    const shellCommandString = `${config.command} ${config.args.join(' ')}`;

    let shellCommand: string;
    let shellArgs: string[] = [];

    if (process.platform === 'win32') {
      shellCommand = 'cmd.exe';
      shellArgs = ['/c', `start cmd.exe /k "${shellCommandString}"`];
    } else if (process.platform === 'darwin') {
      shellCommand = 'open';
      shellArgs = ['-a', 'Terminal.app', '--args', 'bash', '-c', `${shellCommandString}; exec bash`];
    } else {
      shellCommand = 'x-terminal-emulator';
      shellArgs = ['-e', shellCommandString];
    }

    try {
      spawn(shellCommand, shellArgs, {
        detached: true,
        stdio: 'ignore',
        env: process.env,
      }).unref();
    } catch (error: any) {
      this.getLogger().error(`Failed to open interactive shell for ${task.id}: ${error.message}`, 'RuntimePodman');
      throw new Error(`Failed to open interactive shell: ${error.message}`);
    }
  }

  async status(task: Task): Promise<'running' | 'stopped' | 'paused' | 'unknown'> {
    let output = '';
    try {
      this.getLogger().info(`Checking status of Podman container ${task.id}`, 'RuntimePodman');
      await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['inspect', '--format', '{{.State.Status}}', task.id], {
        cwd: app.getAppPath(),
        onLog: (data) => { output += data; }
      });
      const s = output.trim().toLowerCase();
      if (s === 'running') return 'running';
      if (s === 'paused') return 'paused';
      if (s === 'exited' || s === 'created') return 'stopped';
      return 'unknown';
    } catch (e: any) {
      // Podman returns a non-zero exit code and an error message if the container is missing.
      // We check the captured output for the specific "no such object" error to confirm it's stale.
      if (output.toLowerCase().includes('no such object')) {
        return 'unknown';
      }
      // Inspect failure usually means the container does not exist.
      this.getLogger().info(`Podman inspect failed for ${task.id}: ${e.message}`, 'RuntimePodman');
      return 'unknown';
    }
  }

  async inspect(appData: Application): Promise<Record<string, any>> {
    this.getLogger().info(`Inspecting Podman image for ${appData.name}`, 'RuntimePodman');

    const packagePath = appData.install?.installed_package;
    const localImage = appData.install?.installed_image;
    
    let combinedMetadata: Record<string, any> = {};

    const performInspect = async (target: string) => {
      let output = '';
      await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['image', 'inspect', target], {
        cwd: app.getAppPath(),
        onLog: (msg) => { output += msg; }
      });
      const jsonStart = output.indexOf('[');
      if (jsonStart === -1) {
        const objStart = output.indexOf('{');
        if (objStart === -1) return null;
        return JSON.parse(output.substring(objStart).trim());
      }
      const data = JSON.parse(output.substring(jsonStart).trim());
      return Array.isArray(data) ? data[0] : data;
    };

    // 1. Firstly, read metadata from the podman tarball file
    if (packagePath && packagePath.endsWith('.tar')) {
      try {
        // Use docker-archive transport to inspect tarball without loading it into the store
        const tarMetadata = await performInspect(`docker-archive:${packagePath}`);
        if (tarMetadata) combinedMetadata = { ...tarMetadata };
      } catch (e: any) {
        this.getLogger().debug(`Tarball inspect skipped or failed: ${e.message}`, 'RuntimePodman');
      }
    }

    // 2. Secondly, read from local podman image store
    if (localImage) {
      try {
        const localMetadata = await performInspect(localImage);
        if (localMetadata) {
          // Combine metadata, local image properties take precedence
          combinedMetadata = { ...combinedMetadata, ...localMetadata };
        }
      } catch (e: any) {
        this.getLogger().debug(`Local image inspect failed: ${e.message}`, 'RuntimePodman');
      }
    }

    // 3. Fallback if no metadata found through specific channels
    if (Object.keys(combinedMetadata).length === 0) {
      try {
        const fallback = localImage || packagePath;
        if (fallback) {
          const fallbackData = await performInspect(fallback);
          if (fallbackData) combinedMetadata = fallbackData;
        }
      } catch (e: any) {
        this.getLogger().error(`Total failure inspecting ${appData.name}: ${e.message}`, 'RuntimePodman');
      }
    }

    return combinedMetadata;
  }
}

/**
 * Implementation for Conda environments.
 */
export class RuntimeConda extends Runtime {
  private getRuntimeBinPath() {
    return 'conda';
  }

  ensureCondEnvExisted(app: Application) {
    const envName = app.id;
    this.getLogger().info(`Creating Conda environment ${envName}`, 'RuntimeConda');
    this.getSanboxService().runCommand(this.getRuntimeBinPath(),
      ['create', '-y', '-n', envName, 'python=3.10'],
      {
        cwd: app.apphomedir,
        onLog: (msg) => {
          this.getLogger().debug(msg, 'RuntimeConda');
        }
      }
    );
  }

  async install(app: Application, event?: any): Promise<IpcResponse<any>> {
    this.getLogger().info(`Creating Conda environment for ${app.name}`, 'RuntimeConda');
    const envName = app.id;
    this.getLogger().info(`Creating Conda environment ${envName}`, 'RuntimeConda');
    await this.getSanboxService().runCommand(this.getRuntimeBinPath(),
      ['create', '-y', '-n', envName, 'python=3.10'],
      {
        cwd: app.apphomedir,
        onLog: (msg) => {
          this.getLogger().debug(msg, 'RuntimeConda');
          if(event) event.sender.send('runtime:install:log:conda', msg);
        }
      }
    );

    // if (app.runtime.install) {
    //   this.getLogger().info(`Installing packages for Conda environment ${envName}: ${app.runtime.install.join(' ')}`, 'RuntimeConda');
    //   await this.getSanboxService().runCommand(this.getRuntimeBinPath(),
    //     ['install', ...app.runtime.install],
    //     {
    //       onLog: (msg) => {
    //         this.getLogger().debug(msg, 'RuntimeConda');
    //         if(event) event.sender.send('runtime:install:log:conda', msg);
    //       }
    //     }
    //   );
    // }
  
    return { success: true };
  }

  async run(task: Task): Promise<Task> {
    task.status = 'running';
    const envName = task.app.id;
    this.ensureCondEnvExisted(task.app);
    this.getLogger().info(`Starting Conda environment ${envName}`, 'RuntimeConda');

    this.getLogger().info(`Installing required packages for Conda environment ${envName}`, 'RuntimeConda');
    await this.getSanboxService().runCommand(this.getRuntimeBinPath(),
      ['run', '-n', envName, 'pip install -r requirements.txt'],
      {
        cwd: task.app.apphomedir,
        onLog: (msg) => {
          this.getLogger().debug(msg, 'RuntimeConda');
        }
      }
    );

    this.getLogger().info(`Installing required packages for Conda environment ${envName}`, 'RuntimeConda');
    await this.getSanboxService().runCommand(this.getRuntimeBinPath(),
      ['run', '-n', envName, 'python main.py | tee log.txt'],
      {
        cwd: task.app.apphomedir,
        onLog: (msg) => {
          this.getLogger().debug(msg, 'RuntimeConda');
        }
      }
    );
    return task;
  }

  async restart(task: Task): Promise<Task> {
    this.getLogger().info(`Restarting Conda environment ${task.id}`, 'RuntimeConda');
    task.status = 'running';
    return task;
  }

  async pause(task: Task): Promise<void> {
    this.getLogger().warn(`Pause not supported by Conda for ${task.id}`, 'RuntimeConda');
  }

  async stop(task: Task): Promise<void> {
    this.getLogger().info(`Removing Conda environment ${task.id}`, 'RuntimeConda');
    await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['env', 'remove', '-n', task.id, '-y'], {
      onLog: (msg) => this.getLogger().debug(msg, 'RuntimeConda')
    });
  }

  shellAttach(task: Task): { command: string; args: string[] } {
    return {
      command: this.getRuntimeBinPath(),
      args: ['run', '-n', task.id, '/bin/bash']
    };
  }

  getShellConfig(task: Task): { command: string; args: string[] } {
    return this.shellAttach(task);
  }

  getLogsConfig(task: Task): { command: string; args: string[] } {
    return {
      command: 'echo',
      args: ['Logs are not directly streamed for Conda environments.']
    };
  }

  async openInteractiveShell(task: Task): Promise<void> {
    this.getLogger().info(`Opening interactive shell for Conda env ${task.id}`, 'RuntimeConda');
    // Implementation would follow the same pattern as Podman/Apptainer
  }

  async status(task: Task): Promise<'running' | 'stopped' | 'paused' | 'unknown'> {
    try {
      let exists = false;
      await this.getSanboxService().runCommand(this.getRuntimeBinPath(), ['env', 'list'], {
        onLog: (data) => { if (data.includes(task.id)) exists = true; }
      });
      // If the environment doesn't exist, the task is stale.
      return exists ? 'running' : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async inspect(appData: Application): Promise<Record<string, any>> {
    return { runtime: 'conda' };
  }
}
