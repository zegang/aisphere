import { LOG_SEND } from '@/shared/channel-types';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const log = (level: LogLevel, message: string, context?: string) => {
  const timestamp = new Date().toISOString();
  
  // Local console for dev debugging
  if (import.meta.env.DEV) {
    const prefix = `[${timestamp}] [${level}] ${context ? `[${context}] ` : ''}`;
    if (level === 'ERROR') console.error(prefix + message);
    else if (level === 'WARN') console.warn(prefix + message);
    else console.log(prefix + message);
  }

  // Send to main process for file persistence
  if (window.electron?.send) {
    window.electron.send(LOG_SEND, { level, message, context, timestamp });
  }
};

export const logger = {
  debug: (message: string, context?: string) => log('DEBUG', message, context),
  info: (message: string, context?: string) => log('INFO', message, context),
  warn: (message: string, context?: string) => log('WARN', message, context),
  error: (message: string, context?: string) => log('ERROR', message, context),
};

export default logger;
