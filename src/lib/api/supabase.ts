import { RealtimeClient } from '@supabase/realtime-js';
import { SHARED_CHANNEL_NAME } from '@/lib/utils/constants';
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

// Create realtime client directly
export const realtime = new RealtimeClient(`${supabaseUrl}/realtime/v1`, {
  params: {
    apikey: supabaseKey,
    eventsPerSecond: 10,
  },
});

// Create a global presence channel that lives for the entire application lifecycle
let globalPresenceChannel: ReturnType<typeof realtime.channel> | null = null;
let initPromise: Promise<ReturnType<typeof realtime.channel>> | null = null;

export async function getGlobalPresenceChannel() {
  // Check if we already have a valid channel
  if (globalPresenceChannel?.state === 'joined') {
    return globalPresenceChannel;
  }

  // If we're already initializing, return the existing promise
  if (initPromise) {
    return initPromise;
  }

  initPromise = new Promise((resolve, reject) => {
    try {
      // Remove any existing channels with the same name
      const existingChannels = realtime.getChannels();
      existingChannels.forEach(channel => {
        if (channel.topic === SHARED_CHANNEL_NAME) {
          try {
            void channel.untrack();
            void channel.unsubscribe();
          } catch (e) {
            logger.warn('Error cleaning up existing channel', {
              ...LOG_CONTEXT,
              action: 'cleanup',
              metadata: { error: e }
            });
          }
          void realtime.removeChannel(channel);
        }
      });

      // Create new channel
      const channel = realtime.channel(SHARED_CHANNEL_NAME, {
        config: {
          presence: {
            key: SHARED_CHANNEL_NAME
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

      // Store channel reference before setting up handlers
      globalPresenceChannel = channel;

      // Set up presence handlers before subscribing
      void channel
        .on('presence', { event: 'sync' }, () => {
          if (!globalPresenceChannel || globalPresenceChannel !== channel) return;
          const state = channel.presenceState();
          logger.info('Global presence state refresh', {
            ...LOG_CONTEXT,
            action: 'sync',
            metadata: { state },
          });
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          if (!globalPresenceChannel || globalPresenceChannel !== channel) return;
          logger.info('New member presence detected in global channel', {
            ...LOG_CONTEXT,
            action: 'join',
            metadata: { key, newPresences },
          });
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          if (!globalPresenceChannel || globalPresenceChannel !== channel) return;
          logger.info('Member presence removed from global channel', {
            ...LOG_CONTEXT,
            action: 'leave',
            metadata: { key, leftPresences },
          });
        })
        .on('system', { event: 'disconnect' }, () => {
          if (!globalPresenceChannel || globalPresenceChannel !== channel) return;
          logger.info('Channel disconnected', {
            ...LOG_CONTEXT,
            action: 'disconnect',
            metadata: { channelState: channel.state },
          });
          // Reset global channel on disconnect to allow resubscription
          if (globalPresenceChannel === channel) {
            globalPresenceChannel = null;
            initPromise = null;
          }
        })
        .on('system', { event: 'error' }, () => {
          if (!globalPresenceChannel || globalPresenceChannel !== channel) return;
          logger.error('Channel error', {
            ...LOG_CONTEXT,
            action: 'error',
            metadata: { channelState: channel.state },
          });
          // Reset channel on error to allow resubscription
          if (globalPresenceChannel === channel) {
            globalPresenceChannel = null;
            initPromise = null;
          }
        });

      // Subscribe to the global channel with timeout and retry
      const subscribeWithRetry = async (retries = 3, delay = 1000): Promise<void> => {
        try {
          // Check if channel is already subscribed or subscribing
          if (channel.state === 'joined' || channel.state === 'joining') {
            logger.info('Channel already joined or joining', {
              ...LOG_CONTEXT,
              action: 'subscribe',
              metadata: { state: channel.state }
            });
            return;
          }

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Subscribe timeout'));
            }, 5000);

            // Create subscription
            const subscription = channel.subscribe(async (status) => {
              if (!globalPresenceChannel || globalPresenceChannel !== channel) {
                clearTimeout(timeout);
                reject(new Error('Channel mismatch'));
                return;
              }

              if (status === 'SUBSCRIBED') {
                clearTimeout(timeout);
                resolve();
              } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                clearTimeout(timeout);
                reject(new Error(`Channel ${status}`));
              }
            });

            // Handle subscription failure
            if (!subscription) {
              clearTimeout(timeout);
              reject(new Error('Failed to create subscription'));
            }
          });
        } catch (error) {
          if (retries > 0) {
            logger.warn('Retrying subscription', {
              ...LOG_CONTEXT,
              action: 'retry',
              metadata: { retriesLeft: retries - 1, error }
            });
            await new Promise(resolve => setTimeout(resolve, delay));
            return subscribeWithRetry(retries - 1, delay * 2);
          }
          throw error;
        }
      };

      void subscribeWithRetry()
        .then(() => {
          logger.info('Successfully subscribed to channel', {
            ...LOG_CONTEXT,
            action: 'subscribe',
            metadata: { channelState: channel.state },
          });
          resolve(channel);
          return channel;
        })
        .catch((error) => {
          logger.error('Failed to subscribe to channel', {
            ...LOG_CONTEXT,
            action: 'subscribe',
            metadata: { error },
          });
          // Clean up on error
          if (globalPresenceChannel === channel) {
            globalPresenceChannel = null;
            initPromise = null;
            void realtime.removeChannel(channel);
          }
          reject(error);
        });
    } catch (error) {
      initPromise = null;
      reject(error);
    }
  });

  return initPromise;
}
