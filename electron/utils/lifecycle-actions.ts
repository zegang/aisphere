import type { LifecycleAction, LifecycleActionHooks, LifecycleActionResult } from '../../src/types/api';
import type { SandboxService } from '../services/SandboxService';

interface LifecycleLogger {
  info(message: string, context?: string): void;
  warn(message: string, context?: string): void;
  error(message: string, context?: string): void;
}

export interface LifecycleActionContext {
  ownerName: string;
  getDockerLogs?: (tailLines: number) => Promise<string>;
}

export class LifecycleActionRunner {
  constructor(
    private readonly sandbox: SandboxService,
    private readonly logger: LifecycleLogger,
  ) {}

  async run(
    actions: LifecycleAction[] | undefined,
    context: LifecycleActionContext,
  ): Promise<LifecycleActionResult[]> {
    const results: LifecycleActionResult[] = [];
    for (const action of actions ?? []) {
      try {
        const result = await this.runAction(action, context);
        results.push(result);
        this.logger.info(`Lifecycle action ${action.id} ${result.status} for ${context.ownerName}: ${result.message}`, 'LifecycleAction');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Lifecycle action ${action.id} failed for ${context.ownerName}: ${message}`, 'LifecycleAction');
        results.push({ id: action.id, status: 'failed', message });
      }
    }
    return results;
  }

  private async runAction(action: LifecycleAction, context: LifecycleActionContext): Promise<LifecycleActionResult> {
    if (action.type === 'docker-log-credentials') {
      if (!context.getDockerLogs) {
        return { id: action.id, status: 'skipped', message: 'A Docker log source is not available for this lifecycle action.' };
      }
      if (!Array.isArray(action.patterns) || action.patterns.length === 0) {
        throw new Error('No Docker log search patterns are configured.');
      }

      const tailLines = Number.isInteger(action.tailLines) ? Math.min(Math.max(action.tailLines ?? 200, 1), 2000) : 200;
      const patterns = action.patterns.map((pattern) => new RegExp(pattern, 'i'));
      let matchedLines: string[] = [];
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const output = await context.getDockerLogs(tailLines);
        matchedLines = output
          .split(/\r?\n/)
          .filter((line) => patterns.some((pattern) => pattern.test(line)))
          .map((line) => line.trim())
          .filter(Boolean);
        if (matchedLines.length > 0) break;
        if (attempt < 7) await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      return matchedLines.length > 0
        ? { id: action.id, status: 'completed', message: matchedLines.join('\n') }
        : {
            id: action.id,
            status: 'skipped',
            message: 'No matching lines were found in the recent Docker logs.',
          };
    }

    if (action.type === 'windows-firewall') {
      if (process.platform !== 'win32') {
        return { id: action.id, status: 'skipped', message: 'Windows Firewall actions are only available on Windows.' };
      }
      if (!Number.isInteger(action.port) || action.port < 1 || action.port > 65535) {
        throw new Error('The configured firewall port is invalid.');
      }
      if (
        action.profile !== 'private'
        || action.remoteAddress !== 'localsubnet'
        || !action.ruleName.trim()
      ) {
        throw new Error('The firewall rule must be limited to the Private profile and local subnet.');
      }

      const ruleName = action.ruleName.replace(/'/g, "''");
      const checkRule = async (): Promise<boolean> => {
        let output = '';
        await this.sandbox.runCommand(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `if (Get-NetFirewallRule -DisplayName '${ruleName}' -ErrorAction SilentlyContinue) { Write-Output 'EXISTS' }`,
          ],
          { shell: false, onLog: (chunk) => { output += chunk; } },
        );
        return output.includes('EXISTS');
      };

      const exists = await checkRule();
      if (action.operation === 'ensure' && !exists) {
        const elevatedScript = [
          "$ErrorActionPreference = 'Stop'",
          `if (-not (Get-NetFirewallRule -DisplayName '${ruleName}' -ErrorAction SilentlyContinue)) {`,
          `  New-NetFirewallRule -DisplayName '${ruleName}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${action.port} -Profile Private -RemoteAddress LocalSubnet | Out-Null`,
          '}',
        ].join('; ');
        await this.runElevated(elevatedScript);
      } else if (action.operation === 'remove' && exists) {
        const elevatedScript = [
          "$ErrorActionPreference = 'Stop'",
          `Get-NetFirewallRule -DisplayName '${ruleName}' -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
        ].join('; ');
        await this.runElevated(elevatedScript);
      } else if (action.operation !== 'ensure' && action.operation !== 'remove') {
        throw new Error(`Unsupported firewall operation: ${String(action.operation)}`);
      }

      const stillExists = await checkRule();
      if (action.operation === 'ensure' && !stillExists) {
        throw new Error('The Windows Firewall rule could not be verified after creation.');
      }
      if (action.operation === 'remove' && stillExists) {
        throw new Error('The Windows Firewall rule could not be verified as removed.');
      }
      return {
        id: action.id,
        status: 'completed',
        message: action.operation === 'ensure'
          ? `Windows Firewall allows TCP ${action.port} on Private networks from the local subnet.`
          : `Removed the Windows Firewall rule for TCP ${action.port}.`,
      };
    }

    const unsupportedAction: never = action;
    throw new Error(`Unsupported lifecycle action: ${JSON.stringify(unsupportedAction)}`);
  }

  private async runElevated(script: string): Promise<void> {
    const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
    const elevateScript = [
      `$process = Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-EncodedCommand', '${encodedScript}') -Verb RunAs -Wait -PassThru`,
      'if ($process.ExitCode -ne 0) { exit $process.ExitCode }',
    ].join('; ');
    await this.sandbox.runCommand(
      'powershell.exe',
      ['-NoProfile', '-Command', elevateScript],
      { shell: false, includeErrorOutput: true },
    );
  }
}

export function lifecycleActionsFor(
  spec: LifecycleActionHooks,
  hook: 'postInstallActions' | 'postStopActions' | 'postUnInstallActions',
): LifecycleAction[] {
  return spec[hook] ?? [];
}
