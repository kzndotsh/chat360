interface LogContext {
  action?: string;
  component?: string;
  metadata?: Record<string, unknown>;
}

const RATE_LIMIT_WINDOW = 1000; // 1 second
const lastLogTimes = new Map<string, number>();

function shouldRateLimit(key: string): boolean {
  const now = Date.now();
  const lastTime = lastLogTimes.get(key);
  if (lastTime && now - lastTime < RATE_LIMIT_WINDOW) {
    return true;
  }
  lastLogTimes.set(key, now);
  return false;
}

function formatLogMessage(level: string, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const component = context?.component ? `[${context.component}]` : '';
  const action = context?.action ? `[${context.action}]` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${component}${action} ${message}`;
}

function processMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return Object.entries(metadata).reduce(
    (acc, [key, value]) => {
      acc[key] = value instanceof Error ? value.message : value;
      return acc;
    },
    {} as Record<string, unknown>
  );
}

export const logger = {
  debug: (message: string, context?: LogContext): void => {
    if (process.env.NODE_ENV === 'development') {
      const logKey = `${context?.component}-${context?.action}-${message}`;
      if (shouldRateLimit(logKey)) return;
      console.debug(
        formatLogMessage('debug', message, context),
        processMetadata(context?.metadata)
      );
    }
  },

  info: (message: string, context?: LogContext): void => {
    const logKey = `${context?.component}-${context?.action}-${message}`;
    if (shouldRateLimit(logKey)) return;
    console.info(formatLogMessage('info', message, context), processMetadata(context?.metadata));
  },

  warn: (message: string, context?: LogContext): void => {
    const logKey = `${context?.component}-${context?.action}-${message}`;
    if (shouldRateLimit(logKey)) return;
    console.warn(formatLogMessage('warn', message, context), processMetadata(context?.metadata));
  },

  error: (message: string, context?: LogContext): void => {
    const logKey = `${context?.component}-${context?.action}-${message}`;
    if (shouldRateLimit(logKey)) return;
    console.error(formatLogMessage('error', message, context), processMetadata(context?.metadata));
  },

  logAPIRequest: (method: string, url: string, body?: unknown): void => {
    logger.info(`API - Request: ${method} ${url}`, {
      component: 'API',
      action: 'Request',
      metadata: { body },
    });
  },

  logAPIResponse: (
    method: string,
    url: string,
    status: number,
    data?: unknown,
    duration?: number
  ): void => {
    const level = status >= 400 ? 'error' : 'info';
    const message = `API - Response: ${method} ${url} - ${status}`;

    if (level === 'error') {
      logger.error(message, {
        component: 'API',
        action: 'Response',
        metadata: { status, data, duration },
      });
    } else {
      logger.info(message, {
        component: 'API',
        action: 'Response',
        metadata: { status, data, duration },
      });
    }
  },
};
