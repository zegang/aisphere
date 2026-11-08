import os from 'os';
import { spawn } from 'child_process';
import { Service, ServiceName } from '../types/IService'
import { ServiceContainer } from './ServiceContainer';
import { LogService } from './LogService';

export class SandboxService implements Service {
  name = ServiceName.SandboxService;

  private getLogger() {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  /**
   * Runs a script file (.sh, .bat, .ps1) automatically using the correct interpreter for the platform.
   * @param scriptPath Path to the script file.
   * @param args Optional arguments for the script.
   * @param options Execution options.
   */
  async runShellCommand(scriptPath: string, args: string[] = [], options: { cwd?: string, onLog?: (data: string) => void, onInteraction?: (prompt: string) => Promise<string>, signal?: AbortSignal }): Promise<number> {
    const platform = os.platform();
    let command = '';
    let finalArgs = [...args];

    if (platform === 'win32') {
      if (scriptPath.endsWith('.ps1')) {
        command = 'powershell.exe';
        finalArgs = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args];
      } else {
        command = 'cmd.exe';
        finalArgs = ['/c', scriptPath, ...args];
      }
    } else {
      command = 'bash';
      finalArgs = [scriptPath, ...args];
    }

    return this.runCommand(command, finalArgs, options);
  }

  runCommand(command: string, args: string[], options: { cwd?: string, onLog?: (data: string) => void, onInteraction?: (prompt: string) => Promise<string>, signal?: AbortSignal, includeErrorOutput?: boolean, shell?: boolean }): Promise<number> {
    const argsString = args.join(' ');
    const fullCommand = `${command} ${argsString}`;
    const optionParts = [];
    if (options.cwd) optionParts.push(`cwd: ${options.cwd}`);
    if (options.signal) optionParts.push('signal: present');
    const optionsStr = optionParts.length > 0 ? ` [Options: ${optionParts.join(', ')}]` : '';
    this.getLogger().info(`Running command:${optionsStr}\n> ${fullCommand}`, 'SandboxService');

    return new Promise((resolve, reject) => {
      let settled = false;
      let stderrOutput = '';
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      const child = spawn(command, args, {
        cwd: options.cwd,
        shell: options.shell ?? true,
      });

      const onAbort = () => {
        child.kill();
        if (options.signal) options.signal.removeEventListener('abort', onAbort);
        finish(() => reject(new Error('Command aborted')));
      };

      if (options.signal) {
        options.signal.addEventListener('abort', onAbort);
      }

      const handleData = async (data: Buffer, isStderr: boolean) => {
        const output = data.toString();
        options.onLog?.(output);
        if (isStderr && options.includeErrorOutput) {
          stderrOutput = (stderrOutput + output).slice(-2000);
        }

        // Detect common interactive prompts (password or [Y/n])
        const isPrompt = /password|\[Y\/n\]|confirm/i.test(output) && !output.includes('\n');
        if (isPrompt && options.onInteraction) {
          try {
            const response = await options.onInteraction(output.trim());
            child.stdin?.write(response + '\n');
          } catch (e) {
            this.getLogger().error('Interaction failed or cancelled', 'SandboxService');
          }
        }
      };

      child.stdout.on('data', (data: Buffer) => handleData(data, false));
      child.stderr.on('data', (data: Buffer) => handleData(data, true));

      // Without this handler a spawn failure (for example an invalid cwd)
      // emits 'error' and the promise would never settle.
      child.on('error', (error) => {
        if (options.signal) {
          options.signal.removeEventListener('abort', onAbort);
        }
        finish(() => reject(error));
      });

      child.on('close', (code) => {
        if (options.signal) {
          options.signal.removeEventListener('abort', onAbort);
        }
        finish(() => {
          if (code === 0) resolve(code);
          else {
            const detail = stderrOutput.replace(/\x1b\[[0-9;]*m/g, '').trim();
            reject(new Error(`Command failed with code ${code}${detail ? `: ${detail}` : ''}`));
          }
        });
      });
    });
  }


}
