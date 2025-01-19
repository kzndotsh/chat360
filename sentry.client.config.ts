// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://3c0d6d740022be0d1e902a6290bfa3c5@o4508635280310272.ingest.us.sentry.io/4508635282472960',

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration({
      // Capture all console logs
      maskAllText: false,
      blockAllMedia: false,
    }),
    Sentry.browserTracingIntegration({
      traceFetch: true,
      traceXHR: true,
    }),
    Sentry.httpClientIntegration(),
  ],

  // Define how likely traces are sampled
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.2,

  // Enable session replay with high sample rate in development
  replaysSessionSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Additional configuration
  autoSessionTracking: true,
  sendClientReports: true,
  attachStacktrace: true,
  normalizeDepth: 10,

  // Enable performance monitoring
  enableTracing: true,

  // Ignore common WebRTC and Agora noise
  ignoreErrors: [
    'WebRTC',
    'ICE connection',
    'getUserMedia',
    'RTCPeerConnection',
    'AgoraRTC checkSystemRequirements',
  ],

  // Add relevant tags
  initialScope: {
    tags: {
      environment: process.env.NODE_ENV,
      nextjs: true,
      agora: true,
      supabase: true,
    },
  },

  // Capture all console logs
  beforeSend(event: Sentry.ErrorEvent, hint: Sentry.EventHint): Sentry.ErrorEvent | null {
    // Add additional context
    event.extra = {
      ...event.extra,
      runtime: 'browser',
      lastAction: window.sessionStorage.getItem('lastAction'),
      connectionState: window.navigator.onLine ? 'online' : 'offline',
    };
    return event;
  },
});
