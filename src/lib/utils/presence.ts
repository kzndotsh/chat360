import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/api/supabase';
import { logger } from '@/lib/utils/logger';
import type { PartyMember, PresenceMemberState } from '@/lib/types/party';

const LOG_CONTEXT = { component: 'presence', module: 'utils' };
export const SHARED_CHANNEL_NAME = 'shared_party_presence';

export async function createPresenceChannel(
  currentUser: PartyMember,
  onStateChange: (members: PartyMember[]) => void
): Promise<RealtimeChannel> {
  const channel = supabase.channel(SHARED_CHANNEL_NAME);

  let syncTimeout: NodeJS.Timeout | null = null;
  const debouncedStateChange = (state: Record<string, PresenceMemberState[]>) => {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      const members = convertPresenceStateToMembers(state);
      const now = new Date();
      const activeMembers = members.filter((member) => {
        const lastSeen = new Date(member.last_seen);
        const timeDiff = now.getTime() - lastSeen.getTime();
        return timeDiff < 30000;
      });
      onStateChange(activeMembers);
    }, 50);
  };

  channel
    .on('presence', { event: 'sync' }, () => {
      try {
        const state = channel.presenceState<PresenceMemberState>();
        logger.debug('Presence sync', {
          ...LOG_CONTEXT,
          action: 'presenceSync',
          metadata: {
            channelName: SHARED_CHANNEL_NAME,
            userId: currentUser.id,
            members: Object.keys(state).length,
          },
        });
        debouncedStateChange(state);
      } catch (error) {
        logger.error('Error handling presence sync', {
          ...LOG_CONTEXT,
          action: 'presenceSync',
          metadata: { error },
        });
      }
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      try {
        const state = channel.presenceState<PresenceMemberState>();
        logger.debug('Member joined', {
          ...LOG_CONTEXT,
          action: 'presenceJoin',
          metadata: {
            channelName: SHARED_CHANNEL_NAME,
            userId: currentUser.id,
            joinedUserId: key,
            newPresences,
          },
        });
        debouncedStateChange(state);
      } catch (error) {
        logger.error('Error handling presence join', {
          ...LOG_CONTEXT,
          action: 'presenceJoin',
          metadata: { error },
        });
      }
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      try {
        const state = channel.presenceState<PresenceMemberState>();
        logger.debug('Member left', {
          ...LOG_CONTEXT,
          action: 'presenceLeave',
          metadata: {
            channelName: SHARED_CHANNEL_NAME,
            userId: currentUser.id,
            leftUserId: key,
            leftPresences,
          },
        });
        debouncedStateChange(state);
      } catch (error) {
        logger.error('Error handling presence leave', {
          ...LOG_CONTEXT,
          action: 'presenceLeave',
          metadata: { error },
        });
      }
    });

  try {
    const existingChannels = supabase.getChannels();
    for (const existingChannel of existingChannels) {
      if (existingChannel.topic === SHARED_CHANNEL_NAME) {
        try {
          await existingChannel.untrack();
          await existingChannel.unsubscribe();
          await supabase.removeChannel(existingChannel);
        } catch (error) {
          logger.warn('Error cleaning up existing channel', {
            ...LOG_CONTEXT,
            action: 'subscribe',
            metadata: { error },
          });
        }
      }
    }

    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        logger.debug('Channel subscribed, tracking presence', {
          ...LOG_CONTEXT,
          action: 'subscribe',
          metadata: {
            channelName: SHARED_CHANNEL_NAME,
            userId: currentUser.id,
          },
        });

        await channel.track({
          id: currentUser.id,
          name: currentUser.name,
          avatar: currentUser.avatar,
          game: currentUser.game,
          online_at: new Date().toISOString(),
          muted: false,
        });
      } else if (status === 'CHANNEL_ERROR') {
        logger.error('Channel error occurred', {
          ...LOG_CONTEXT,
          action: 'subscribe',
          metadata: {
            channelName: SHARED_CHANNEL_NAME,
            userId: currentUser.id,
          },
        });
      }
    });
  } catch (error) {
    logger.error('Failed to subscribe to channel', {
      ...LOG_CONTEXT,
      action: 'subscribe',
      metadata: {
        channelName: SHARED_CHANNEL_NAME,
        userId: currentUser.id,
        error,
      },
    });
    throw error;
  }

  return channel;
}

export async function cleanupPresenceChannel(channel: RealtimeChannel | null): Promise<void> {
  if (!channel) return;

  try {
    logger.debug('Starting presence channel cleanup', {
      ...LOG_CONTEXT,
      action: 'cleanup',
    });

    await channel.untrack();

    await new Promise((resolve) => setTimeout(resolve, 100));

    await channel.unsubscribe();
    await supabase.removeChannel(channel);

    const existingChannels = supabase.getChannels();
    for (const existingChannel of existingChannels) {
      if (existingChannel.topic === SHARED_CHANNEL_NAME && existingChannel !== channel) {
        try {
          await existingChannel.untrack();
          await existingChannel.unsubscribe();
          await supabase.removeChannel(existingChannel);
        } catch (error) {
          logger.warn('Error cleaning up additional channel', {
            ...LOG_CONTEXT,
            action: 'cleanup',
            metadata: { error },
          });
        }
      }
    }

    logger.debug('Presence channel cleanup complete', {
      ...LOG_CONTEXT,
      action: 'cleanup',
    });
  } catch (error) {
    logger.error('Failed to cleanup presence channel', {
      ...LOG_CONTEXT,
      action: 'cleanup',
      metadata: { error },
    });
    try {
      await supabase.removeChannel(channel);
    } catch (removeError) {
      logger.error('Failed to remove channel after cleanup error', {
        ...LOG_CONTEXT,
        action: 'cleanup',
        metadata: { error: removeError },
      });
    }
  }
}

function convertPresenceStateToMembers(
  state: Record<string, PresenceMemberState[]>
): PartyMember[] {
  const memberMap = new Map<string, PartyMember>();

  Object.values(state)
    .flat()
    .forEach((presence) => {
      const existing = memberMap.get(presence.id);
      if (!existing || new Date(presence.online_at) > new Date(existing.last_seen)) {
        memberMap.set(presence.id, {
          id: presence.id,
          name: presence.name,
          avatar: presence.avatar,
          game: presence.game,
          is_active: true,
          muted: false,
          created_at: new Date().toISOString(),
          last_seen: presence.online_at,
        });
      }
    });

  return Array.from(memberMap.values());
}
