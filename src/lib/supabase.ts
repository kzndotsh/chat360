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
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      log_level: 'debug',
      eventsPerSecond: 10,
    },
  },
});

// Connect immediately
supabase.realtime.connect();

// Simple connection check
export const ensureRealtimeConnection = async () => {
  // If already connected, return immediately
  if (supabase.realtime.isConnected()) {
    return;
  }

  // If not connected, try to connect
  if (!supabase.realtime.isConnected()) {
    logger.debug('Connecting to realtime service', {
      component: 'SupabaseClient',
    });
    supabase.realtime.connect();
  }

  // Wait for connection with a simple timeout
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 10000);

    const checkConnection = () => {
      if (supabase.realtime.isConnected()) {
        clearTimeout(timeout);
        logger.debug('Connected to realtime service', {
          component: 'SupabaseClient',
          metadata: { connectionState: 'connected' },
        });
        resolve();
      } else {
        setTimeout(checkConnection, 100);
      }
    };

    checkConnection();
  });
};
