import { createClient } from '@supabase/supabase-js';
import { SHARED_CHANNEL_NAME } from '@/lib/utils/presence';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Create a global presence channel that lives for the entire application lifecycle
export const globalPresenceChannel = supabase.channel(SHARED_CHANNEL_NAME, {
  config: {
    presence: {
      key: SHARED_CHANNEL_NAME
    },
    broadcast: {
      self: true,
      ack: true
    }
  }
});

// Subscribe to the global channel immediately
globalPresenceChannel.subscribe((status) => {
  console.log('Global presence channel status:', status);
});
