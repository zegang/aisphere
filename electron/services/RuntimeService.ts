import { ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import os from 'os';
import { Application, AppRuntime } from '../../src/types/api';
import { LogService } from './LogService';
import { RuntimeApptainer, RuntimePodman, RuntimeConda, RuntimeClass, Runtime, Task } from '../utils/runtime';
import { Service, ServiceName } from '../types/IService';
import { ServiceContainer } from './ServiceContainer';
import { SandboxService } from './SandboxService';
import { IpcResponse, RUNTIME_CHECK, RUNTIME_INSTALL, RUNTIME_INSTALL_ABORT } from '../../src/shared/channel-types';

export class RuntimeService implements Service {
  name = ServiceName.RuntimeService;
  protected runtimes: Partial<Record<RuntimeClass, Runtime>>;
  protected tasks: Record<string, Task>;
  private abortControllers: Map<string, AbortController> = new Map();

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
    this.setupHandlers();
  }

  private setupHandlers() {
    ipcMain.handle(RUNTIME_CHECK, async () => {
      const runtimes = ['docker', 'podman', 'apptainer', 'conda'];
      const results = await Promise.all(runtimes.map(async (type) => {
        try {
          let version = '';
          await this.getSandbox().runCommand(type, ['--version'], {
            onLog: (data) => { version += data; }
          });
          return { type, installed: true, version: version.trim() };
        } catch {
          return { type, installed: false };
        }
      }));
      return { success: true, data: { runtimes: results } };
    });

    ipcMain.handle(RUNTIME_INSTALL, async (event, type: string) => {
      const platform = os.platform();
      let command = '';
      let args: string[] = [];

      // Logic to guide installation or run automated installers
      if (platform === 'win32') {
        if (type === 'docker') {
          command = 'winget';
          args = ['install', 'Docker.DockerDesktop', '--silent'];
        } else if (type === 'podman') {
          command = 'winget';
          args = ['install', 'RedHat.Podman', '--silent'];
        } else if (type === 'conda') {
          command = 'winget';
          args = ['install', 'Anaconda.Miniconda3', '--silent'];
        }
      } else if (platform === 'darwin') {
        if (type === 'docker') {
          command = 'brew';
          args = ['install', '--cask', 'docker'];
        } else if (type === 'podman') {
          command = 'brew';
          args = ['install', 'podman'];
        } else if (type === 'conda') {
          command = 'brew';
          args = ['install', '--cask', 'miniconda'];
        }
      } else if (platform === 'linux') {
        // Linux usually requires sudo and specific managers
        if (type === 'docker') {
          command = 'sudo';
          args = ['-S', 'sh', '-c', 'curl -fsSL https://get.docker.com | sh'];
        } else if (type === 'apptainer') {
          // Simple script check
          command = 'sudo';
          args = ['-S', 'apt-get', 'update', '&&', 'sudo', '-S', 'apt-get', 'install', '-v', '-y', 'apptainer'];
        } else if (type === 'conda') {
          command = 'sh';
          args = ['-c', 'curl -fsSL https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -o /tmp/miniconda.sh && bash /tmp/miniconda.sh -b -u'];
        }
      }

      if (!command) {
        return { success: false, error: `Automated installation not supported for ${type} on ${platform}. Please install manually.` };
      }

      const controller = new AbortController();
      this.abortControllers.set(type, controller);

      try {
        await this.getSandbox().runCommand(command, args, {
          signal: controller.signal,
          onLog: (data) => {
            event.sender.send(`runtime:install:log:${type}`, data);
          },
          onInteraction: async (prompt) => {
            event.sender.send(`runtime:install:interaction:${type}`, prompt);
            return new Promise((resolve) => {
              ipcMain.once(`runtime:install:response:${type}`, (_e, response: string) => {
                resolve(response);
              });
            });
          }
        });
        return { success: true };
      } catch (e: any) {
        if (e.message === 'Command aborted') {
          this.getLogger().info(`Installation of ${type} was aborted.`, this.name);
          return { success: true };
        }
        return { success: false, error: e.message };
      } finally {
        this.abortControllers.delete(type);
      }
    });

    ipcMain.handle(RUNTIME_INSTALL_ABORT, async (_event, type: string) => {
      const controller = this.abortControllers.get(type);
      if (controller) {
        controller.abort();
        return { success: true };
      }
      return { success: false, error: `No active installation found for ${type}` };
    });
  }

  createRuntime(rc: RuntimeClass): Runtime {
    switch (rc) {
      case RuntimeClass.Apptainer: return new RuntimeApptainer(RuntimeClass.Apptainer);
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
    throw new Error('Method not implemented.');
  }

  async run(app: Application): Promise<Task> {
    const runtimeConfig = app.runtime as { runtime: RuntimeClass; options?: string[]; startscript?: string; args?: string[] };
    const rc = runtimeConfig?.runtime;
    if (!rc) {
      throw new Error(`Application ${app.name} does not specify a valid runtime type.`);
    }

    const runtime = this.getRuntime(rc);

    // If a task is already recorded for this app (e.g. it failed or was manually stopped without cleanup),
    // attempt to restart the existing container instance instead of creating a new one.
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
