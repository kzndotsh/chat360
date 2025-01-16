import { createClient } from '@supabase/supabase-js';
import { SHARED_CHANNEL_NAME } from '@/lib/utils/presence';
import { logger } from '@/lib/utils/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const LOG_CONTEXT = { component: 'supabase' };

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Create a global presence channel that lives for the entire application lifecycle
export const globalPresenceChannel = supabase.channel(SHARED_CHANNEL_NAME, {
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

let lastErrorTime = 0;
let errorCount = 0;
let recoveryAttempts = 0;
let lastRecoveryTime = 0;
const MAX_RECOVERY_ATTEMPTS = 3;
const INITIAL_RECOVERY_DELAY = 1000; // 1 second initial delay
const MAX_RECOVERY_DELAY = 5000; // 5 seconds max delay

function getBackoffDelay() {
  const backoffDelay = INITIAL_RECOVERY_DELAY * Math.pow(2, recoveryAttempts - 1);
  return Math.min(backoffDelay, MAX_RECOVERY_DELAY);
}

function attemptReconnect() {
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
  
  setTimeout(() => {
    if (globalPresenceChannel.state === 'errored') {
      logger.info('Attempting channel recovery', {
        ...LOG_CONTEXT,
        action: 'recoveryAttempt',
        metadata: {
          attempt: recoveryAttempts,
          timestamp: Date.now(),
          channelState: globalPresenceChannel.state,
          timeSinceScheduled: Date.now() - lastRecoveryTime,
        },
      });
      
      globalPresenceChannel.unsubscribe().then(() => {
        return globalPresenceChannel.subscribe((status, error) => {
          const presenceState = globalPresenceChannel.presenceState();
          const presenceCount = Object.keys(presenceState).length;
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
                channelState: globalPresenceChannel.state,
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

            // Attempt recovery with increased delay
            attemptReconnect();
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
          }
          
          logger.info('Global presence channel status change', {
            ...LOG_CONTEXT,
            action: 'channelStatus',
            metadata: {
              status,
              channelName: SHARED_CHANNEL_NAME,
              channelState: globalPresenceChannel.state,
              presenceState: presenceCount,
              presenceData: presenceState,
              timestamp: now,
              metrics: {
                errorCount,
                hasErrorHistory: errorCount > 0,
                timeSinceLastError: errorCount > 0 ? now - lastErrorTime : 0,
                recoveryAttempts,
              },
              error: isError ? {
                state: globalPresenceChannel.state,
                retryCount: globalPresenceChannel.joinedOnce ? 1 : 0,
                lastJoinedAt: now,
                errorDetails: error instanceof Error ? {
                  message: error.message,
                  name: error.name,
                  stack: error.stack,
                } : String(error),
              } : undefined,
            },
          });
        });
      }).catch(error => {
        const now = Date.now();
        logger.error('Recovery attempt failed', {
          ...LOG_CONTEXT,
          action: 'recoveryFailed',
          metadata: {
            error: error instanceof Error ? error : new Error(String(error)),
            attempt: recoveryAttempts,
            timestamp: now,
            timings: {
              sinceLastError: now - lastErrorTime,
              sinceLastRecovery: now - lastRecoveryTime,
              currentDelay: getBackoffDelay(),
            },
          },
        });
        // Try again with exponential backoff
        attemptReconnect();
      });
    }
  }, delay);
}

// Subscribe to the global channel immediately
globalPresenceChannel.subscribe((status, error) => {
  const presenceState = globalPresenceChannel.presenceState();
  const presenceCount = Object.keys(presenceState).length;
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
        channelState: globalPresenceChannel.state,
        timestamp: now,
        errorMetrics: {
          errorCount,
          timeSinceLastError,
          isRecurring: errorCount > 1,
          recoveryAttempts,
        },
      },
    });

    // Attempt recovery
    attemptReconnect();
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
            recoverySuccessful: true,
            totalRecoveryAttempts: recoveryAttempts,
          },
        },
      });
    }

    // Reset counters on successful connection
    errorCount = 0;
    recoveryAttempts = 0;
  } else if (status === 'CLOSED') {
    logger.info('Global presence channel closed', {
      ...LOG_CONTEXT,
      action: 'channelClose',
      metadata: {
        timestamp: now,
        finalState: globalPresenceChannel.state,
        metrics: {
          totalErrors: errorCount,
          lastErrorTime,
          recoveryAttempts,
        },
      },
    });
  }
  
  logger.info('Global presence channel status change', {
    ...LOG_CONTEXT,
    action: 'channelStatus',
    metadata: {
      status,
      channelName: SHARED_CHANNEL_NAME,
      channelState: globalPresenceChannel.state,
      presenceState: presenceCount,
      presenceData: presenceState,
      timestamp: now,
      metrics: {
        errorCount,
        hasErrorHistory: errorCount > 0,
        timeSinceLastError: errorCount > 0 ? now - lastErrorTime : 0,
        recoveryAttempts,
      },
      error: isError ? {
        state: globalPresenceChannel.state,
        retryCount: globalPresenceChannel.joinedOnce ? 1 : 0,
        lastJoinedAt: now,
        errorDetails: error instanceof Error ? {
          message: error.message,
          name: error.name,
          stack: error.stack,
        } : String(error),
      } : undefined,
    },
  });
});
