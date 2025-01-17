import { createClient } from '@supabase/supabase-js';
import { SHARED_CHANNEL_NAME } from '@/lib/utils/presence';
import { logger } from '@/lib/utils/logger';

const LOG_CONTEXT = { component: 'supabase' };

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
    timeout: 30000, // 30 second timeout
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// State variables for error handling and recovery
let lastErrorTime = 0;
let errorCount = 0;
let recoveryAttempts = 0;
let lastRecoveryTime = 0;
const MAX_RECOVERY_ATTEMPTS = 3;
const INITIAL_RECOVERY_DELAY = 1000; // 1 second initial delay
const MAX_RECOVERY_DELAY = 5000; // 5 seconds max delay

// Helper function to calculate backoff delay
function getBackoffDelay() {
  const backoffDelay = INITIAL_RECOVERY_DELAY * Math.pow(2, recoveryAttempts - 1);
  return Math.min(backoffDelay, MAX_RECOVERY_DELAY);
}

// Create a global presence channel that lives for the entire application lifecycle
let globalPresenceChannel: ReturnType<typeof supabase.channel> | null = null;
let isInitializing = false;
let initPromise: Promise<ReturnType<typeof supabase.channel>> | null = null;

// Helper function to attempt channel reconnection
async function attemptReconnect() {
  if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
    logger.error('Global presence channel max recovery attempts reached', {
      ...LOG_CONTEXT,
      action: 'maxRecoveryAttempts',
      metadata: {
        attempts: recoveryAttempts,
        errorCount,
        lastErrorTime,
        lastRecoveryTime,
        timestamp: Date.now(),
        timeSinceLastRecovery: Date.now() - lastRecoveryTime,
      },
    });
    // Reset lastRecoveryTime when max attempts reached
    lastRecoveryTime = 0;
    return;
  }

  recoveryAttempts++;
  const delay = getBackoffDelay();
  lastRecoveryTime = Date.now();

  logger.info('Scheduling channel recovery attempt', {
    ...LOG_CONTEXT,
    action: 'recoveryScheduled',
    metadata: {
      attempt: recoveryAttempts,
      delay,
      timestamp: lastRecoveryTime,
      timeSinceError: lastRecoveryTime - lastErrorTime,
    },
  });

  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    // Clean up existing channel
    if (globalPresenceChannel) {
      try {
        await globalPresenceChannel.unsubscribe();
        await supabase.removeChannel(globalPresenceChannel);
      } catch (error) {
        logger.warn('Error cleaning up channel during recovery', {
          ...LOG_CONTEXT,
          action: 'recoveryCleanup',
          metadata: { error },
        });
      }
    }

    // Reset state
    globalPresenceChannel = null;
    isInitializing = false;
    initPromise = null;

    // Attempt to get a new channel
    await getGlobalPresenceChannel();
  } catch (error) {
    logger.error('Channel recovery attempt failed', {
      ...LOG_CONTEXT,
      action: 'recoveryFailed',
      metadata: {
        error,
        attempt: recoveryAttempts,
        timestamp: Date.now(),
        timings: {
          timeSinceLastError: Date.now() - lastErrorTime,
          timeSinceLastRecovery: Date.now() - lastRecoveryTime,
        },
      },
    });

    // Schedule next attempt if we haven't reached the limit
    if (recoveryAttempts < MAX_RECOVERY_ATTEMPTS) {
      attemptReconnect();
    }
  }
}

export async function getGlobalPresenceChannel() {
  // If channel exists and is in a good state, return it
  if (globalPresenceChannel && globalPresenceChannel.state !== 'errored') {
    return globalPresenceChannel;
  }

  // If already initializing, wait for it
  if (isInitializing && initPromise) {
    return initPromise;
  }

  // If channel exists but is in error state, clean it up
  if (globalPresenceChannel) {
    try {
      await globalPresenceChannel.unsubscribe();
      await supabase.removeChannel(globalPresenceChannel);
    } catch (error) {
      logger.warn('Error cleaning up errored channel', {
        ...LOG_CONTEXT,
        action: 'cleanup',
        metadata: { error },
      });
    }
    globalPresenceChannel = null;
  }

  // Start initialization
  isInitializing = true;
  initPromise = new Promise((resolve, reject) => {
    try {
      const channel = supabase.channel(SHARED_CHANNEL_NAME, {
        config: {
          presence: {
            key: SHARED_CHANNEL_NAME,
          },
          broadcast: {
            self: true,
            ack: true,
          },
        },
      });

      if (!channel) {
        throw new Error('Failed to create presence channel');
      }

      globalPresenceChannel = channel;

      // Subscribe to the global channel
      channel.subscribe((status: string, error: unknown) => {
        // Re-check channel reference in case it was cleaned up
        if (!globalPresenceChannel || globalPresenceChannel !== channel) {
          logger.error('Channel mismatch during subscription callback', {
            ...LOG_CONTEXT,
            action: 'subscribe',
            metadata: {
              status,
              error,
              hasGlobalChannel: !!globalPresenceChannel,
              channelState: globalPresenceChannel?.state,
            },
          });
          return;
        }

        const presenceState = channel.presenceState();
        const presenceCount = presenceState ? Object.keys(presenceState).length : 0;
        const isError = status === 'CHANNEL_ERROR';
        const now = Date.now();

        if (isError) {
          errorCount++;
          const timeSinceLastError = now - lastErrorTime;
          lastErrorTime = now;

          logger.error('Global presence channel error', {
            ...LOG_CONTEXT,
            action: 'channelError',
            metadata: {
              status,
              error: error instanceof Error ? error : new Error(String(error)),
              channelName: SHARED_CHANNEL_NAME,
              channelState: channel.state,
              timestamp: now,
              errorMetrics: {
                errorCount,
                timeSinceLastError,
                isRecurring: errorCount > 1,
                recoveryAttempts,
                timeSinceLastRecovery: now - lastRecoveryTime,
              },
            },
          });

          // Only attempt reconnect if channel is in errored state
          if (channel.state === 'errored') {
            attemptReconnect();
          }

          // Reject the promise if we're still initializing
          if (isInitializing) {
            isInitializing = false;
            initPromise = null;
            reject(new Error('Channel error during initialization'));
          }
        } else if (status === 'SUBSCRIBED') {
          if (errorCount > 0) {
            logger.info('Global presence channel recovered', {
              ...LOG_CONTEXT,
              action: 'channelRecovery',
              metadata: {
                previousState: 'errored',
                newState: 'joined',
                channelName: SHARED_CHANNEL_NAME,
                timestamp: now,
                recoveryMetrics: {
                  totalErrors: errorCount,
                  timeSinceLastError: now - lastErrorTime,
                  timeSinceLastRecovery: now - lastRecoveryTime,
                  recoverySuccessful: true,
                  totalRecoveryAttempts: recoveryAttempts,
                  finalRecoveryDelay: getBackoffDelay(),
                },
              },
            });
          }

          // Reset counters on successful connection
          errorCount = 0;
          recoveryAttempts = 0;
          lastRecoveryTime = 0;

          // Resolve the promise if we're still initializing
          if (isInitializing) {
            isInitializing = false;
            initPromise = null;
            resolve(channel);
          }
        } else if (status === 'CLOSED') {
          logger.info('Global presence channel closed', {
            ...LOG_CONTEXT,
            action: 'channelClose',
            metadata: {
              timestamp: now,
              finalState: channel.state,
              metrics: {
                totalErrors: errorCount,
                lastErrorTime,
                recoveryAttempts,
              },
            },
          });

          // Reject the promise if we're still initializing
          if (isInitializing) {
            isInitializing = false;
            initPromise = null;
            reject(new Error('Channel closed during initialization'));
          }
        }

        logger.info('Global presence channel status change', {
          ...LOG_CONTEXT,
          action: 'channelStatus',
          metadata: {
            status,
            channelName: SHARED_CHANNEL_NAME,
            channelState: channel.state,
            presenceState: presenceCount,
            presenceData: presenceState,
            timestamp: now,
            metrics: {
              errorCount,
              hasErrorHistory: errorCount > 0,
              timeSinceLastError: errorCount > 0 ? now - lastErrorTime : 0,
              recoveryAttempts,
            },
            error: isError
              ? {
                  state: channel.state,
                  retryCount: channel.joinedOnce ? 1 : 0,
                  lastJoinedAt: now,
                  errorDetails:
                    error instanceof Error
                      ? {
                          message: error.message,
                          name: error.name,
                          stack: error.stack,
                        }
                      : String(error),
                }
              : undefined,
          },
        });
      });
    } catch (error) {
      isInitializing = false;
      initPromise = null;
      globalPresenceChannel = null;
      reject(error);
    }
  });

  return initPromise;
}
