import { useState, useCallback, useRef, useEffect } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';
import type { PartyMember, PresenceMemberState } from '@/lib/types/party';
import { getGlobalPresenceChannel } from '@/lib/api/supabase';

const LOG_CONTEXT = { component: 'usePresence' };

export function usePresence() {
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mountedRef = useRef(true);
  const membersRef = useRef<PartyMember[]>([]);
  const subscriptionStatusRef = useRef<'SUBSCRIBED' | 'CLOSED' | null>(null);
  const isCleaningUpRef = useRef(false);

  // Keep membersRef in sync with state
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  // Subscribe to presence updates in view-only mode on mount
  useEffect(() => {
    let mounted = true;
    let channel: Awaited<ReturnType<typeof getGlobalPresenceChannel>> | null = null;

    const initChannel = async () => {
      try {
        channel = await getGlobalPresenceChannel();
        if (!mounted || !channel) return;

        // Set up sync handler for the global channel
        const syncHandler = () => {
          if (!channel) return;
          const state = channel.presenceState<PresenceMemberState>();
          const allStates = Object.values(state).flat();

          logger.debug('Processing presence sync (view mode)', {
            ...LOG_CONTEXT,
            action: 'sync',
            metadata: { state, allStates },
          });

          // Always update members list based on current state
          const newMembers = allStates.map((presence: PresenceMemberState) => ({
            id: presence.id,
            name: presence.name,
            avatar: presence.avatar,
            game: presence.game,
            muted: presence.muted,
            agora_uid: presence.agora_uid,
            is_active: true,
            created_at: new Date().toISOString(),
            last_seen: presence.online_at,
            voice_status: presence.voice_status || 'silent',
            deafened_users: presence.deafened_users || [],
          }));

          setMembers(newMembers);
        };

        // Add sync handler to global channel
        channel.on('presence', { event: 'sync' }, syncHandler);

        // Get initial state
        syncHandler();
      } catch (error) {
        logger.error('Failed to initialize presence channel', {
          ...LOG_CONTEXT,
          action: 'init',
          metadata: { error },
        });
      }
    };

    initChannel();

    return () => {
      mounted = false;
      // We don't want to remove the global channel subscription
      // Just let the cleanup function handle presence tracking
    };
  }, []);

  const cleanup = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel || isCleaningUp) return;

    try {
      setIsCleaningUp(true);
      isCleaningUpRef.current = true;

      // Clear members immediately to prevent stale UI
      setMembers([]);
      membersRef.current = [];

      // Set subscription status to CLOSED first to prevent error logging
      subscriptionStatusRef.current = 'CLOSED';

      // Only try to untrack if channel is still joined
      if (channel.state === 'joined') {
        try {
          // Untrack first to stop presence updates
          await channel.untrack();
        } catch (error: unknown) {
          logger.debug('Ignoring untrack error during cleanup', {
            ...LOG_CONTEXT,
            action: 'cleanup',
            metadata: { error },
          });
        }
      }

      // Set channel ref to null
      channelRef.current = null;

      try {
        // Get current presence state to update UI
        const globalChannel = await getGlobalPresenceChannel();
        if (globalChannel) {
          const state = globalChannel.presenceState<PresenceMemberState>();
          const allStates = Object.values(state).flat();

          if (allStates.length > 0) {
            const newMembers = allStates.map((presence: PresenceMemberState) => ({
              id: presence.id,
              name: presence.name,
              avatar: presence.avatar,
              game: presence.game,
              muted: presence.muted,
              agora_uid: presence.agora_uid,
              is_active: true,
              created_at: new Date().toISOString(),
              last_seen: presence.online_at,
              voice_status: presence.voice_status || 'silent',
              deafened_users: presence.deafened_users || [],
            }));
            setMembers(newMembers);
          }
        }
      } catch (error) {
        logger.error('Failed to get global presence channel during cleanup', {
          ...LOG_CONTEXT,
          action: 'cleanup',
          metadata: { error },
        });
      }

      logger.info('Successfully cleaned up presence', {
        ...LOG_CONTEXT,
        action: 'cleanup',
      });
    } catch (error: unknown) {
      logger.error('Failed to clean up presence', {
        ...LOG_CONTEXT,
        action: 'cleanup',
        metadata: { error },
      });
      throw error;
    } finally {
      setIsCleaningUp(false);
      isCleaningUpRef.current = false;
    }
  }, [isCleaningUp]);

  const initializePresence = useCallback(
    async (member: PartyMember) => {
      if (isInitializing || isCleaningUp || channelRef.current) {
        // If we have an existing channel, clean it up first
        if (channelRef.current) {
          await cleanup();
        } else {
          logger.debug('Ignoring initialize request - already initializing or cleaning up', {
            ...LOG_CONTEXT,
            action: 'initialize',
            metadata: { isInitializing, isCleaningUp },
          });
          return;
        }
      }

      try {
        logger.info('Initializing presence', {
          ...LOG_CONTEXT,
          action: 'initialize',
          metadata: { member },
        });

        setIsInitializing(true);
        subscriptionStatusRef.current = null;
        isCleaningUpRef.current = false;

        // Track presence in the global channel
        const globalChannel = await getGlobalPresenceChannel();
        if (!globalChannel) {
          throw new Error('Failed to get global presence channel');
        }

        const trackResult = await globalChannel.track({
          id: member.id,
          name: member.name,
          avatar: member.avatar,
          game: member.game,
          muted: member.muted,
          agoraUid: member.agora_uid,
          online_at: new Date().toISOString(),
        });

        logger.debug('Presence track result', {
          ...LOG_CONTEXT,
          action: 'track',
          metadata: { trackResult, member },
        });

        // Store reference to global channel
        channelRef.current = globalChannel;

        // Wait for presence to be registered
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Get current state
        const state = globalChannel.presenceState<PresenceMemberState>();
        const stateValues = Object.values(state).flat();

        if (stateValues.length > 0) {
          const newMembers = stateValues.map((presence: PresenceMemberState) => ({
            id: presence.id,
            name: presence.name,
            avatar: presence.avatar,
            game: presence.game,
            muted: presence.muted,
            agora_uid: presence.agora_uid,
            is_active: true,
            created_at: new Date().toISOString(),
            last_seen: presence.online_at,
            voice_status: presence.voice_status || 'silent',
            deafened_users: presence.deafened_users || [],
          }));
          setMembers(newMembers);
        }

        logger.info('Successfully initialized presence', {
          ...LOG_CONTEXT,
          action: 'initialize',
        });
      } catch (error: unknown) {
        logger.error('Failed to initialize presence', {
          ...LOG_CONTEXT,
          action: 'initialize',
          metadata: { error },
        });
        throw error;
      } finally {
        setIsInitializing(false);
      }
    },
    [isInitializing, isCleaningUp, cleanup]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;

      if (channelRef.current) {
        cleanup().catch((error) => {
          logger.error('Error during cleanup on unmount', {
            ...LOG_CONTEXT,
            action: 'cleanup',
            metadata: { error },
          });
        });
      }
    };
  }, [cleanup]);

  return { members, isInitializing, initialize: initializePresence, cleanup };
}
