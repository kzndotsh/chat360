import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/api/supabase';
import { logger } from '@/lib/utils/logger';
import type { PartyMember, PresenceMemberState } from '@/lib/types/party';

const LOG_CONTEXT = { component: 'presence' };

export const SHARED_CHANNEL_NAME = 'shared_presence';

export function processPresenceState(presenceData: PresenceMemberState[]) {
  logger.debug('Processing presence state', {
    ...LOG_CONTEXT,
    action: 'processState',
    metadata: {
      inputCount: presenceData.length,
    },
  });

  const memberMap = new Map<string, PartyMember>();
  const currentTime = new Date().toISOString();

  // First pass: collect all members
  for (const presence of presenceData) {
    memberMap.set(presence.id, {
      id: presence.id,
      name: presence.name,
      avatar: presence.avatar,
      game: presence.game,
      is_active: true,
      muted: false,
      created_at: currentTime,
      last_seen: presence.online_at || currentTime,
      voiceStatus: presence.voiceStatus || 'silent',
      deafenedUsers: presence.deafenedUsers || [],
    });
  }

  logger.debug('Collected initial members', {
    ...LOG_CONTEXT,
    action: 'processState',
    metadata: {
      memberCount: memberMap.size,
    },
  });

  // Second pass: clean up stale members
  let removedCount = 0;
  Array.from(memberMap.keys()).forEach((id) => {
    const member = memberMap.get(id);
    if (!member?.last_seen) return;

    const lastSeen = new Date(member.last_seen);
    const now = new Date();
    const timeDiff = now.getTime() - lastSeen.getTime();

    // Remove members that haven't been seen in 5 minutes
    if (timeDiff > 5 * 60 * 1000) {
      memberMap.delete(id);
      removedCount++;
    }
  });

  const finalMembers = Array.from(memberMap.values());
  logger.debug('Finished processing presence state', {
    ...LOG_CONTEXT,
    action: 'processState',
    metadata: {
      initialCount: presenceData.length,
      removedCount,
      finalCount: finalMembers.length,
    },
  });

  return finalMembers;
}

export async function createPresenceChannel(
  currentUser: PartyMember,
  onStateChange: (members: PartyMember[]) => void
): Promise<RealtimeChannel> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;
  let retryCount = 0;

  const attemptChannelCreation = async (): Promise<RealtimeChannel> => {
    try {
      // Clean up existing channels first
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

      const channel = supabase.channel(SHARED_CHANNEL_NAME);
      let syncTimeout: NodeJS.Timeout | null = null;

      const debouncedStateChange = (state: Record<string, PresenceMemberState[]>) => {
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
          const members = convertPresenceStateToMembers(state);
          const now = new Date();
          const activeMembers = members.filter((member) => {
            const lastSeen = member.last_seen ? new Date(member.last_seen) : new Date();
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

      // Wait for subscription and track presence
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Channel subscription timeout'));
        }, 5000);

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            logger.debug('Channel subscribed, tracking presence', {
              ...LOG_CONTEXT,
              action: 'subscribe',
              metadata: {
                channelName: SHARED_CHANNEL_NAME,
                userId: currentUser.id,
              },
            });

            try {
              await channel.track({
                id: currentUser.id,
                name: currentUser.name,
                avatar: currentUser.avatar,
                game: currentUser.game,
                online_at: new Date().toISOString(),
                muted: false,
              });
              resolve(undefined);
            } catch (error) {
              reject(error);
            }
          } else if (status === 'CHANNEL_ERROR') {
            clearTimeout(timeout);
            reject(new Error('Channel subscription failed'));
          }
        });
      });

      return channel;
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        logger.warn(`Retrying channel creation (attempt ${retryCount}/${MAX_RETRIES})`, {
          ...LOG_CONTEXT,
          action: 'subscribe',
          metadata: { error },
        });
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return attemptChannelCreation();
      }
      throw error;
    }
  };

  return attemptChannelCreation();
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
  logger.debug('Converting presence state to members', {
    ...LOG_CONTEXT,
    action: 'convertState',
    metadata: {
      stateKeys: Object.keys(state).length,
    },
  });

  const allPresences = Object.values(state).flat();
  const currentTime = new Date().toISOString();

  const members = allPresences.map((presence) => ({
    id: presence.id,
    name: presence.name,
    avatar: presence.avatar,
    game: presence.game,
    is_active: true,
    muted: presence.muted || false,
    created_at: currentTime,
    last_seen: presence.online_at || currentTime,
    voiceStatus: presence.voiceStatus || 'silent',
    deafenedUsers: presence.deafenedUsers || [],
  }));

  logger.debug('Converted presence state', {
    ...LOG_CONTEXT,
    action: 'convertState',
    metadata: {
      presenceCount: allPresences.length,
      memberCount: members.length,
    },
  });

  return members;
}
