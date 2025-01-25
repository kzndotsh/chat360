import { createClient } from '@supabase/supabase-js';

import { logger } from './logger';

// Environment checks
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create Supabase client with proper configuration
export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      log_level: 'debug',
      eventsPerSecond: 200,
    },
  },
});

// Don't connect immediately, let services manage their own connections
// supabase.realtime.connect();

// Enhanced connection check with retry
export const ensureRealtimeConnection = async () => {
  // If already connected, return immediately
  if (supabase.realtime.isConnected()) {
    return;
  }

  // If not connected, try to connect with retry
  let retryCount = 0;
  const maxRetries = 3;
  const baseDelay = 1000;

  while (retryCount < maxRetries) {
    try {
      if (!supabase.realtime.isConnected()) {
        logger.debug('Connecting to realtime service', {
          component: 'SupabaseClient',
          metadata: { retryCount },
        });
        supabase.realtime.connect();
      }

      // Wait for connection with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

        const checkConnection = () => {
          if (supabase.realtime.isConnected()) {
            clearTimeout(timeout);
            logger.debug('Connected to realtime service', {
              component: 'SupabaseClient',
              metadata: { connectionState: 'connected', retryCount },
            });
            resolve();
          } else {
            setTimeout(checkConnection, 100);
          }
        };

        checkConnection();
      });

      return; // Connection successful
    } catch (error) {
      retryCount++;
      if (retryCount === maxRetries) {
        throw error;
      }
      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.min(baseDelay * Math.pow(2, retryCount), 10000)));
    }
  }
};
