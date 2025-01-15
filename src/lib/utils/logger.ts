import * as Sentry from '@sentry/react';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

interface LogEntry {
  component?: string;
  action?: string;
  message: string;
  level: LogLevel;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface LogOptions {
  component?: string;
  action?: string;
  metadata?: Record<string, unknown>;
  error?: Error | unknown;
}

const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key: string, value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  };
};

class Logger {
  private static instance: Logger;
  private rateLimitMap: Map<string, number> = new Map();
  private readonly rateLimitWindow = 1000; // 1 second
  private readonly maxLogsPerWindow = 100;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private shouldRateLimit(key: string): boolean {
    const now = Date.now();
    const lastLog = this.rateLimitMap.get(key) || 0;
    
    if (now - lastLog > this.rateLimitWindow) {
      this.rateLimitMap.set(key, now);
      return false;
    }

    const count = (this.rateLimitMap.get(`${key}_count`) || 0) + 1;
    this.rateLimitMap.set(`${key}_count`, count);

    if (count > this.maxLogsPerWindow) {
      if (count === this.maxLogsPerWindow + 1) {
        console.warn(`Rate limit exceeded for ${key}`);
      }
      return true;
    }

    return false;
  }

  private log(entry: LogEntry): void {
    const key = `${entry.component}_${entry.action}_${entry.level}`;
    
    if (this.shouldRateLimit(key)) {
      return;
    }

    try {
      if (process.env.NODE_ENV === 'development') {
        const consoleMethod = console[entry.level] || console.log;
        consoleMethod(
          `[${entry.timestamp}] ${entry.component || 'unknown'} - ${entry.action || 'unknown'}: ${entry.message}`,
          entry.metadata || {}
        );
      } else {
        // Production logging
        console.log(JSON.stringify(entry, getCircularReplacer()));
      }

      // Add breadcrumb for non-error logs
      if (entry.level !== LogLevel.ERROR) {
        Sentry.addBreadcrumb({
          category: entry.component,
          message: entry.message,
          level: entry.level as Sentry.Breadcrumb['level'],
          data: entry.metadata
        });
      }
    } catch (error) {
      console.error('Logging failed:', error);
    }
  }

  private createLogEntry(
    message: string,
    level: LogLevel,
    options: LogOptions = {}
  ): LogEntry {
    return {
      component: options.component || 'unknown',
      action: options.action || 'unknown',
      message: message || 'No message provided',
      level,
      timestamp: new Date().toISOString(),
      metadata: options.metadata
    };
  }

  public debug(message: string, options: LogOptions = {}): void {
    this.log(this.createLogEntry(message, LogLevel.DEBUG, options));
  }

  public info(message: string, options: LogOptions = {}): void {
    this.log(this.createLogEntry(message, LogLevel.INFO, options));
  }

  public warn(message: string, options: LogOptions = {}): void {
    this.log(this.createLogEntry(message, LogLevel.WARN, options));
  }

  public error(message: string, options: LogOptions = {}): void {
    this.log(this.createLogEntry(message, LogLevel.ERROR, options));
    if (options.metadata?.error) {
      Sentry.captureException(options.metadata.error);
    }
  }

  public logAPIRequest(
    method: string,
    url: string,
    body?: unknown,
    metadata?: Record<string, unknown>
  ): void {
    this.info(`${method} ${url}`, {
      component: 'API',
      action: 'Request',
      metadata: {
        ...metadata,
        body
      }
    });
  }

  public logAPIResponse(
    method: string,
    url: string,
    status: number,
    data?: unknown,
    duration?: number,
    metadata?: Record<string, unknown>
  ): void {
    const logMethod = status >= 400 ? this.error.bind(this) : this.info.bind(this);
    
    logMethod(`${method} ${url} - ${status}`, {
      component: 'API',
      action: 'Response',
      metadata: {
        ...metadata,
        status,
        data,
        duration
      }
    });
  }
}

export const logger = Logger.getInstance();
