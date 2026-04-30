type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'http';

class Logger {
  private level: LogLevel;
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    http: 2,
    warn: 3,
    error: 4,
  };

  constructor() {
    this.level = (process.env.LOG_LEVEL as LogLevel) || 'info';
  }

  private log(level: LogLevel, message: string, meta?: any) {
    if (this.levels[level] < this.levels[this.level]) return;

    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`);
  }

  debug(message: string, meta?: any) { this.log('debug', message, meta); }
  info(message: string, meta?: any) { this.log('info', message, meta); }
  http(message: string, meta?: any) { this.log('http', message, meta); }
  warn(message: string, meta?: any) { this.log('warn', message, meta); }
  error(message: string, meta?: any) { this.log('error', message, meta); }
}

export const logger = new Logger();