import { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';
import type { PartyMember, PresenceMemberState } from '@/lib/types/party';
import { SHARED_CHANNEL_NAME } from '@/lib/utils/constants';
import { AVATARS } from '@/lib/config/constants';

const LOG_CONTEXT = { component: 'presence' };

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable');
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function convertPresenceStateToMembers(
  state: RealtimePresenceState<PresenceMemberState>
): PartyMember[] {
  const memberMap = new Map<string, PartyMember>();
  const currentTime = new Date().toISOString();

  // Process all members from presence state
  Object.values(state)
    .flat()
    .forEach((presence) => {
      if (!presence.id) return; // Only skip if ID is missing

      // Get existing member if available
      const existingMember = memberMap.get(presence.id);

      memberMap.set(presence.id, {
        id: presence.id,
        name: presence.name || existingMember?.name || '',
        avatar: presence.avatar || existingMember?.avatar || AVATARS[0]!,
        game: presence.game || existingMember?.game || '',
        is_active: true,
        created_at: existingMember?.created_at || currentTime,
        last_seen: presence.online_at || currentTime,
        voice_status: presence.voice_status || existingMember?.voice_status || 'silent',
        muted: presence.muted ?? existingMember?.muted ?? false,
        deafened_users: presence.deafened_users || existingMember?.deafened_users || [],
        agora_uid: presence.agora_uid ? Number(presence.agora_uid) : existingMember?.agora_uid,
        _lastUpdate: presence._lastUpdate || Date.now(),
      });
    });

  return Array.from(memberMap.values());
}

export async function createPresenceChannel(
  currentUser: PartyMember,
  onStateChange: (members: PartyMember[]) => void
): Promise<RealtimeChannel> {
  try {
    const channel = supabase.channel(SHARED_CHANNEL_NAME);
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceMemberState>();
        const members = convertPresenceStateToMembers(state);
        logger.info('Presence state synchronized', {
          ...LOG_CONTEXT,
          action: 'sync',
          metadata: {
            state,
            members,
          },
        });
        onStateChange(members);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }: { key: string; newPresences: PresenceMemberState[] }) => {
        logger.info('New member presence detected in channel', {
          ...LOG_CONTEXT,
          action: 'join',
          metadata: { key, newPresences },
        });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }: { key: string; leftPresences: PresenceMemberState[] }) => {
        logger.info('Member presence removed from channel', {
          ...LOG_CONTEXT,
          action: 'leave',
          metadata: { key, leftPresences },
        });
        
        // Get updated state after leave
        const state = channel.presenceState<PresenceMemberState>();
        const members = convertPresenceStateToMembers(state);
        onStateChange(members);
      });

    channel.subscribe(async (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => {
      if (status === 'SUBSCRIBED') {
        const presenceTrackStatus = await channel.track({
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar,
          game: currentUser.game,
          online_at: new Date().toISOString(),
          voice_status: currentUser.voice_status,
        });

        if (presenceTrackStatus !== 'ok') {
          throw new Error(`Failed to track presence: ${presenceTrackStatus}`);
        }
      }
    });

    return channel;
  } catch (error) {
    logger.error('Failed to create presence channel', {
      ...LOG_CONTEXT,
      action: 'createChannel',
      metadata: { error },
    });
    throw error;
  }
}

export async function cleanupPresence(channel: RealtimeChannel | null): Promise<void> {
  if (!channel) return;

  try {
    await channel.untrack();
    await channel.unsubscribe();
  } catch (error) {
    logger.error('Failed to cleanup presence channel', {
      ...LOG_CONTEXT,
      action: 'cleanup',
      metadata: { error },
    });
  }
}
