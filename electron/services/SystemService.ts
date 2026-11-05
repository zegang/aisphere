import { ipcMain } from 'electron';
import { join } from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SYSTEM_INFO } from '../../src/shared/channel-types';
import { LogService } from './LogService';
import { Service, ServiceName } from '../types/IService';
import { ServiceContainer } from './ServiceContainer';
import { getDataRootDir } from '../utils/app-paths';

const execAsync = promisify(exec);

export class SystemService implements Service {
  name = ServiceName.SystemService;

  constructor() { }

  private getLogger() {
    return ServiceContainer.getInstance().get(ServiceName.LogService) as LogService;
  }

  init() {
    this.getLogger().info('Starting', this.name);
    this.setupHandlers();
  }

  private setupHandlers() {
    ipcMain.handle(SYSTEM_INFO, async () => {
      const platform = os.platform();
      
      // GPU Detection
      const gpus: { model: string }[] = [];
      try {
        if (platform === 'win32') {
          const { stdout } = await execAsync('wmic path win32_VideoController get name');
          stdout.split('\n').slice(1).filter(l => l.trim()).forEach(name => gpus.push({ model: name.trim() }));
        } else if (platform === 'darwin') {
          const { stdout } = await execAsync("system_profiler SPDisplaysDataType | grep 'Chipset Model' | cut -d: -f2");
          stdout.split('\n').filter(l => l.trim()).forEach(name => gpus.push({ model: name.trim() }));
        } else {
          const { stdout } = await execAsync("lspci | grep -i 'vga\\|display\\|3d'");
          stdout.split('\n').filter(l => l.trim()).forEach(line => {
            const parts = line.split(': ');
            gpus.push({ model: parts[parts.length - 1].trim() });
          });
        }
      } catch (e) {
        this.getLogger().warn('GPU detection failed: ' + e);
      }

      // Disk Detection
      const disks: { name: string; mount: string; size: number; free: number }[] = [];
      try {
        if (platform === 'win32') {
          const { stdout } = await execAsync('wmic logicaldisk get caption,size,freespace');
          stdout.split('\n').slice(1).filter(l => l.trim()).forEach(line => {
            const [name, free, size] = line.trim().split(/\s+/);
            if (size) disks.push({ name, mount: name, size: parseInt(size), free: parseInt(free) });
          });
        } else {
          const { stdout } = await execAsync('df -k');
          stdout.split('\n').slice(1).filter(l => l.trim()).forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 6) {
              disks.push({
                name: parts[0],
                mount: parts[5],
                size: parseInt(parts[1]) * 1024,
                free: parseInt(parts[3]) * 1024
              });
            }
          });
        }
      } catch (e) {
        this.getLogger().warn('Disk detection failed: ' + e);
      }

      return {
        success: true,
        data: {
          data_path: getDataRootDir(),
          platform: os.platform(),
          os_type: os.type(),
          release: os.release(),
          arch: os.arch(),
          cpus: os.cpus().map(c => ({ model: c.model, speed: c.speed })),
          gpus,
          disks,
          memory: {
            total: os.totalmem(),
            free: os.freemem(),
          },
        },
      };
    });
  }
}