import { useState, useCallback, useRef, useEffect } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';
import type { PartyMember, PresenceMemberState } from '@/lib/types/party';
import { getGlobalPresenceChannel } from '@/lib/api/supabase';

const LOG_CONTEXT = { component: 'usePresence' };

export function usePresence() {
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mountedRef = useRef(true);
  const membersRef = useRef<PartyMember[]>([]);
  const subscriptionStatusRef = useRef<'SUBSCRIBED' | 'CLOSED' | null>(null);
  const isCleaningUpRef = useRef(false);
  const initializationPromiseRef = useRef<Promise<void> | null>(null);

  // Keep membersRef in sync with state
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const cleanup = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel || isCleaningUpRef.current) return;

    try {
      isCleaningUpRef.current = true;

      // Set subscription status to CLOSED first to prevent error logging
      subscriptionStatusRef.current = 'CLOSED';

      // Only try to untrack if channel is still joined
      if (channel.state === 'joined') {
        try {
          await channel.untrack();
        } catch (error: unknown) {
          logger.debug('Ignoring untrack error during cleanup', {
            ...LOG_CONTEXT,
            action: 'cleanup',
            metadata: { error },
          });
        }
      }

      // Clear members immediately to prevent stale UI
      if (mountedRef.current) {
        setMembers([]);
        membersRef.current = [];
      }

      // Set channel ref to null
      channelRef.current = null;

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
      isCleaningUpRef.current = false;
    }
  }, []);

  const initializePresence = useCallback(
    async (member: PartyMember) => {
      // If already initializing, wait for the current initialization to complete
      if (initializationPromiseRef.current) {
        try {
          await initializationPromiseRef.current;
          return;
        } catch {
          // If previous initialization failed, continue with new attempt
        }
      }

      // If cleaning up, wait for cleanup to complete
      if (isCleaningUpRef.current) {
        await new Promise(resolve => {
          const checkCleanup = () => {
            if (!isCleaningUpRef.current) {
              resolve(undefined);
            } else {
              setTimeout(checkCleanup, 50);
            }
          };
          checkCleanup();
        });
      }

      // Create new initialization promise
      initializationPromiseRef.current = (async () => {
        try {
          logger.info('Initializing presence', {
            ...LOG_CONTEXT,
            action: 'initialize',
            metadata: { member },
          });

          setIsInitializing(true);
          subscriptionStatusRef.current = null;

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
          await new Promise(resolve => setTimeout(resolve, 100));

          // Get current state
          const state = globalChannel.presenceState<PresenceMemberState>();
          const stateValues = Object.values(state).flat();

          if (stateValues.length > 0 && mountedRef.current) {
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
          if (mountedRef.current) {
            setIsInitializing(false);
          }
          initializationPromiseRef.current = null;
        }
      })();

      await initializationPromiseRef.current;
    },
    [cleanup]
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
