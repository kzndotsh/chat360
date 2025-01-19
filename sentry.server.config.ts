// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://3c0d6d740022be0d1e902a6290bfa3c5@o4508635280310272.ingest.us.sentry.io/4508635282472960',

  // Add integrations
  integrations: [Sentry.httpIntegration()],

  // Define how likely traces are sampled
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.2,

  // Additional configuration
  autoSessionTracking: true,
  attachStacktrace: true,
  normalizeDepth: 10,
  maxBreadcrumbs: 100,

  // Enable performance monitoring
  enableTracing: true,
  profilesSampleRate: 1.0,

  // Advanced context gathering
  beforeSend(event, hint) {
    const error = hint?.originalException;
    const processInfo = {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      env: process.env.NODE_ENV,
      memoryHeap: process.memoryUsage().heapUsed,
      memoryRss: process.memoryUsage().rss,
      uptime: process.uptime(),
    };

    event.extra = {
      ...event.extra,
      runtime: 'server',
      process: processInfo,
      errorContext:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
              cause: error.cause,
            }
          : undefined,
    };
    return event;
  },

  // Advanced breadcrumb handling
  beforeBreadcrumb(breadcrumb) {
    const timestamp = new Date().toISOString();
    return {
      ...breadcrumb,
      data: {
        ...breadcrumb.data,
        timestamp,
        memoryHeap: process.memoryUsage().heapUsed,
      },
    };
  },
});
