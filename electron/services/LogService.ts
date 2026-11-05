import { ipcMain } from 'electron';
import { join } from 'path';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { LOG_SEND } from '../../src/shared/channel-types';
import { Service, ServiceName } from '../types/IService';
import { getDataPath } from '../utils/app-paths';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  timestamp: string;
}

export class LogService implements Service {
  name = ServiceName.LogService;
  private logFilePath: string;

  constructor() {
    const logDir = getDataPath('log');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    this.logFilePath = join(logDir, 'aisphere.log');
  }

  shutdown(): void {
  }

  init(): void {
    this.setupHandlers();
  }

  private setupHandlers() {
    ipcMain.on(LOG_SEND, (_event, entry: LogEntry) => {
      this.writeLog(entry);
    });
  }

  public getLogFilePath() : string { return this.logFilePath; }

  public debug(message: string, context?: string) { this.log('DEBUG', message, context); }
  public info(message: string, context?: string) { this.log('INFO', message, context); }
  public warn(message: string, context?: string) { this.log('WARN', message, context); }
  public error(message: string, context?: string) { this.log('ERROR', message, context); }

  private log(level: LogLevel, message: string, context?: string) {
    this.writeLog({ level, message, context, timestamp: new Date().toISOString() });
  }

  private writeLog(entry: LogEntry) {
    const logString = `[${entry.timestamp}] [${entry.level}] ${entry.context ? `[${entry.context}] ` : ''}${entry.message}\n`;

    process.stdout.write(logString);

    try {
      appendFileSync(this.logFilePath, logString, 'utf-8');
    } catch (err) {
      console.error('CRITICAL: Failed to write to log file:', err);
    }
  }
}
