import { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';
import { supabase } from '@/lib/api/supabase';
import { logger } from '@/lib/utils/logger';
import type { PartyMember, PresenceMemberState } from '@/lib/types/party';
import { SHARED_CHANNEL_NAME } from '@/lib/utils/constants';

const LOG_CONTEXT = { component: 'presence' };

export function convertPresenceStateToMembers(
  state: RealtimePresenceState<PresenceMemberState>
): PartyMember[] {
  const memberMap = new Map<string, PartyMember>();
  const currentTime = new Date().toISOString();

  // Process all members from presence state
  Object.values(state)
    .flat()
    .forEach((presence) => {
      if (!presence.id || !presence.name || !presence.avatar || !presence.game) return;

      memberMap.set(presence.id, {
        id: presence.id,
        name: presence.name,
        avatar: presence.avatar,
        game: presence.game,
        is_active: true,
        created_at: currentTime,
        last_seen: presence.online_at || currentTime,
        voice_status: presence.voice_status || 'silent',
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
        logger.info('Presence sync event', {
          ...LOG_CONTEXT,
          action: 'sync',
          metadata: {
            state,
            members,
          },
        });
        onStateChange(members);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        logger.info('Member joined', {
          ...LOG_CONTEXT,
          action: 'join',
          metadata: { key, newPresences },
        });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        logger.info('Member left', {
          ...LOG_CONTEXT,
          action: 'leave',
          metadata: { key, leftPresences },
        });
        
        // Get updated state after leave
        const state = channel.presenceState<PresenceMemberState>();
        const members = convertPresenceStateToMembers(state);
        onStateChange(members);
      });

    channel.subscribe(async (status) => {
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
