import os from 'os';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { ServiceContainer } from '../services/ServiceContainer';
import { SandboxService } from '../services/SandboxService';
import { ServiceName } from '../types/IService';
import { LogService } from '../services/LogService';

/**
 * Utility class for tar/untar operations across different platforms.
 * Leverages the system's 'tar' command via SandboxService for cross-platform reliability.
 */
export class Tar {
  private getSandbox() {
    return ServiceContainer.getInstance().get(ServiceName.SandboxService) as SandboxService;
  }

  private getLogger() {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  /**
   * Compresses (archives) a file or directory into a tar archive.
   * @param source The path to the file or directory to compress.
   * @param destination The output tar file path.
   * @param options Additional options like working directory.
   */
  async compress(source: string, destination: string, options: { cwd?: string, onLog?: (data: string) => void } = {}): Promise<void> {
    const platform = os.platform();
    this.getLogger().info(`Compressing ${source} to ${destination} on ${platform}`, 'TarUtil');

    const destDir = dirname(destination);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    // -c: create, -z: gzip, -f: file.
    const args = ['-czf', destination, source];

    try {
      await this.getSandbox().runCommand('tar', args, {
        cwd: options.cwd,
        onLog: (data) => {
          this.getLogger().debug(data, 'TarUtil');
          options.onLog?.(data);
        }
      });
    } catch (error: any) {
      this.getLogger().error(`Compression failed: ${error.message}`, 'TarUtil');
      throw error;
    }
  }

  /**
   * Decompresses (extracts) a tar archive.
   * @param source The path to the tar file.
   * @param destination The directory to extract into.
   * @param options Additional options like working directory.
   */
  async decompress(source: string, destination: string, options: { cwd?: string, onLog?: (data: string) => void } = {}): Promise<void> {
    const platform = os.platform();
    const sourceLower = source.toLowerCase();
    const isZip = sourceLower.endsWith('.zip');
    const is7z = sourceLower.endsWith('.7z') || /\.\d{3}$/.test(sourceLower);

    this.getLogger().info(`Decompressing package ${source} to ${destination} on ${platform}`, 'TarUtil');

    if (!existsSync(destination)) {
      mkdirSync(destination, { recursive: true });
    }

    let command = 'tar';
    let args = ['-xf', source, '-C', destination];

    if (is7z) {
      command = '7z';
      // 7z uses -o[dir] without a space
      args = ['x', source, `-o${destination}`, '-y'];
    } else if (isZip && platform !== 'win32') {
      command = 'unzip';
      args = ['-o', source, '-d', destination];
    } else if (!isZip) {
      // strip-components=1 is tar-specific, used to remove the top-level directory
      // commonly found in archive packages.
      args.push('--strip-components=1');
    }

    try {
      await this.getSandbox().runCommand(command, args, {
        cwd: options.cwd,
        onLog: (data) => {
          this.getLogger().debug(data, 'TarUtil');
          options.onLog?.(data);
        }
      });
    } catch (error: any) {
      this.getLogger().error(`Decompression failed: ${error.message}`, 'TarUtil');
      throw error;
    }
  }
}