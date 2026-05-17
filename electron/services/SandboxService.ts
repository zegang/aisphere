import { spawn } from 'child_process';
import { IService, ServiceName } from '../types/IService'
import { ServiceContainer } from './ServiceContainer';
import { LogService } from './LogService';

export class SandboxService implements IService {
  name = ServiceName.SandboxService;

  private getLogger() {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  runCommand(command: string, args: string[], options: { cwd?: string, onLog?: (data: string) => void, onInteraction?: (prompt: string) => Promise<string>, signal?: AbortSignal }): Promise<number> {
    const argsString = args.map(arg => { return arg.includes(' ') ? `'${arg}'` : arg; }).join(' ');
    const fullCommand = `${command} ${argsString}`;
    const optionParts = [];
    if (options.cwd) optionParts.push(`cwd: ${options.cwd}`);
    if (options.signal) optionParts.push('signal: present');
    const optionsStr = optionParts.length > 0 ? ` [Options: ${optionParts.join(', ')}]` : '';
    this.getLogger().info(`Running command:${optionsStr}\n> ${fullCommand}`, 'SandboxService');

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        shell: true
      });

      const onAbort = () => {
        child.kill();
        reject(new Error('Command aborted'));
      };

      if (options.signal) {
        options.signal.addEventListener('abort', onAbort);
      }

      const handleData = async (data: Buffer) => {
        const output = data.toString();
        options.onLog?.(output);

        // Detect common interactive prompts (password or [Y/n])
        const isPrompt = /password|\[Y\/n\]|confirm/i.test(output) && !output.includes('\n');
        if (isPrompt && options.onInteraction) {
          try {
            const response = await options.onInteraction(output.trim());
            child.stdin.write(response + '\n');
          } catch (e) {
            this.getLogger().error('Interaction failed or cancelled', 'SandboxService');
          }
        }
      };

      child.stdout.on('data', handleData);
      child.stderr.on('data', handleData);

      child.on('close', (code) => {
        if (options.signal) {
          options.signal.removeEventListener('abort', onAbort);
        }
        if (code === 0) resolve(code);
        else reject(new Error(`Command failed with code ${code}`));
      });
    });
  }

}
