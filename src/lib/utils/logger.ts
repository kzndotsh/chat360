import * as Sentry from '@sentry/react';

interface LogContext {
  component?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

const RATE_LIMIT_WINDOW = 1000; // 1 second
const lastLogTimes = new Map<string, number>();

function getCircularReplacer() {
  const seen = new WeakSet();
  return (_key: string, value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular ~]';
      }
      seen.add(value);
    }
    return value;
  };
}

function shouldRateLimit(key: string): boolean {
  const now = Date.now();
  const lastTime = lastLogTimes.get(key);

  if (!lastTime || now - lastTime >= RATE_LIMIT_WINDOW) {
    lastLogTimes.set(key, now);
    return false;
  }
  return true;
}

function formatLogMessage(level: string, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const component = context?.component || 'unknown';
  const action = context?.action || 'unknown';
  return `[${timestamp}] ${component} - ${action}: ${message || 'No message provided'}`;
}

function processMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata) return {};
  return JSON.parse(JSON.stringify(metadata, getCircularReplacer()));
}

class Logger {
  private log(
    level: 'info' | 'error' | 'debug' | 'warn',
    message: string,
    context?: LogContext
  ): void {
    const logKey = `${context?.component}-${context?.action}-${message}`;
    if (shouldRateLimit(logKey)) return;

    try {
      const formattedMessage = formatLogMessage(level, message, context);
      const metadata = processMetadata(context?.metadata);

      if (level === 'error') {
        console.error(formattedMessage, metadata);
        if (metadata?.error instanceof Error) {
          Sentry.captureException(metadata.error);
        }
      } else {
        const consoleMethod =
          level === 'debug' ? console.debug : level === 'warn' ? console.warn : console.info;
        consoleMethod(formattedMessage, metadata);
        Sentry.addBreadcrumb({
          message,
          level: level === 'debug' ? 'debug' : level === 'warn' ? 'warning' : 'info',
          data: metadata,
        });
      }
    } catch {
      // Silently handle logging errors
    }
  }

  public debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  public error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  public logAPIRequest(method: string, url: string, body?: unknown): void {
    this.info(`API - Request: ${method} ${url}`, {
      component: 'API',
      action: 'Request',
      metadata: { body },
    });
  }

  public logAPIResponse(
    method: string,
    url: string,
    status: number,
    data?: unknown,
    duration?: number
  ): void {
    const level = status >= 400 ? 'error' : 'info';
    this.log(level, `API - Response: ${method} ${url} - ${status}`, {
      component: 'API',
      action: 'Response',
      metadata: { status, data, duration },
    });
  }
}

export const logger = new Logger();
