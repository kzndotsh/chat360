"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { RealtimeChannel } from '@supabase/realtime-js';
import { logger } from '@/lib/utils/logger';
import type { PartyMember, PresenceMemberState } from '@/lib/types/party';
import { getGlobalPresenceChannel } from '@/lib/api/supabase';
import { Mutex } from 'async-mutex';

const LOG_CONTEXT = { component: 'usePresence' };

export function usePresence() {
  const [members, setMembers] = useState<PartyMember[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mountedRef = useRef(true);
  const membersRef = useRef<PartyMember[]>([]);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const cleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _MAX_RETRIES = 5; // Prefix with _ to satisfy linter
  
  // Add mutex for subscription management
  const subscriptionMutex = useRef<Mutex>(new Mutex());
  const subscriptionStateRef = useRef<{
    isSubscribing: boolean;
    lastSubscriptionTime: number;
    lastError: Error | null;
  }>({
    isSubscribing: false,
    lastSubscriptionTime: 0,
    lastError: null
  });

  const updateMembers = useCallback((newMembers: PartyMember[]) => {
    if (!mountedRef.current) return;

    logger.info('Updating members', {
      ...LOG_CONTEXT,
      action: 'updateMembers',
      metadata: { 
        currentCount: membersRef.current.length,
        newCount: newMembers.length,
        memberIds: newMembers.map(m => m.id)
      },
    });

    setMembers(newMembers);
  }, []);

  const convertPresenceToMembers = useCallback((state: Record<string, PresenceMemberState[]>) => {
    const memberMap = new Map<string, PartyMember>();
    const currentTime = new Date().toISOString();

    Object.values(state)
      .flat()
      .forEach((presence: PresenceMemberState) => {
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
          _lastUpdate: presence._lastUpdate,
          muted: presence.muted || false,
        });
      });

    return Array.from(memberMap.values());
  }, []);

  // Add state validation helper
  const validateState = useCallback(() => {
    if (!mountedRef.current) return false;
    
    const state = channelRef.current?.presenceState<PresenceMemberState>();
    if (!state) return false;

    const allPresences = Object.values(state).flat();
    const currentMembers = membersRef.current;
    
    // Check for state inconsistencies
    const stateMembers = convertPresenceToMembers(state);
    const hasMismatch = stateMembers.length !== currentMembers.length || 
      stateMembers.some(m => !currentMembers.find(cm => cm.id === m.id));

    if (hasMismatch) {
      logger.warn('State mismatch detected', {
        ...LOG_CONTEXT,
        action: 'validateState',
        metadata: {
          stateMembers,
          currentMembers,
          presenceCount: allPresences.length
        }
      });
      return false;
    }

    return true;
  }, [convertPresenceToMembers]);

  const setupHandlers = useCallback((channel: RealtimeChannel) => {
    // Don't try to unsubscribe here - it can cause race conditions
    // Just set up the handlers
    return channel
      .on('presence', { event: 'sync' }, () => {
        if (!mountedRef.current) return;
        
        const state = channel.presenceState<PresenceMemberState>();
        logger.info('Presence sync', {
          ...LOG_CONTEXT,
          action: 'sync',
          metadata: { state },
        });
        
        // Ensure we have a valid state object
        if (state && Object.keys(state).length > 0) {
          const newMembers = convertPresenceToMembers(state);
          logger.info('Updating members from sync', {
            ...LOG_CONTEXT,
            action: 'sync',
            metadata: { 
              memberCount: newMembers.length,
              members: newMembers 
            },
          });
          
          // Update immediately to prevent race conditions
          updateMembers(newMembers);
        } else {
          logger.info('Empty presence state, clearing members', {
            ...LOG_CONTEXT,
            action: 'sync',
          });
          updateMembers([]);
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (!mountedRef.current) return;

        logger.info('Member joined', {
          ...LOG_CONTEXT,
          action: 'join',
          metadata: { key, newPresences },
        });

        // Get the full state to ensure we have all members
        const state = channel.presenceState<PresenceMemberState>();
        const allMembers = convertPresenceToMembers(state);
        
        logger.info('Updated members after join', {
          ...LOG_CONTEXT,
          action: 'join',
          metadata: { 
            prevCount: membersRef.current.length,
            newCount: allMembers.length,
            members: allMembers 
          },
        });
        
        // Update with all members to ensure consistency
        updateMembers(allMembers);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (!mountedRef.current) return;

        logger.info('Member left', {
          ...LOG_CONTEXT,
          action: 'leave',
          metadata: { key, leftPresences },
        });

        // Get the full state after leave to ensure consistency
        const state = channel.presenceState<PresenceMemberState>();
        const remainingMembers = convertPresenceToMembers(state);
        
        logger.info('Updated members after leave', {
          ...LOG_CONTEXT,
          action: 'leave',
          metadata: { 
            prevCount: membersRef.current.length,
            newCount: remainingMembers.length,
            members: remainingMembers 
          },
        });
        
        // Update with remaining members
        updateMembers(remainingMembers);
      });
  }, [convertPresenceToMembers, updateMembers]);

  const initializeChannel = useCallback(async () => {
    const release = await subscriptionMutex.current.acquire();
    try {
      // Check if already subscribed or subscribing
      if (subscriptionStateRef.current.isSubscribing) {
        logger.info('Already subscribing to channel', {
          ...LOG_CONTEXT,
          action: 'initialize',
          metadata: {
            lastSubscriptionTime: subscriptionStateRef.current.lastSubscriptionTime,
            lastError: subscriptionStateRef.current.lastError
          }
        });
        return;
      }

      // Get the global channel - this will return the existing one if it's already joined
      const channel = await getGlobalPresenceChannel();
      if (!channel) {
        throw new Error('Failed to get global presence channel');
      }

      // If we already have this channel and it's in a good state, just use it
      if (channelRef.current === channel && 
          channel.state === 'joined' && 
          validateState()) {
        logger.info('Reusing existing channel', {
          ...LOG_CONTEXT,
          action: 'initialize'
        });
        return;
      }

      // Clean up existing channel if it's different from the global one
      if (channelRef.current && channelRef.current !== channel) {
        try {
          void channelRef.current.untrack();
          await channelRef.current.unsubscribe();
        } catch (error) {
          logger.warn('Error cleaning up existing channel', {
            ...LOG_CONTEXT, 
            action: 'cleanup',
            metadata: { error }
          });
        }
      }

      // Set up handlers and store reference
      setupHandlers(channel);
      channelRef.current = channel;

      // Reset retry count on success
      retryCountRef.current = 0;

    } catch (error) {
      subscriptionStateRef.current.lastError = error instanceof Error ? error : new Error(String(error));
      throw error;
    } finally {
      subscriptionStateRef.current.isSubscribing = false;
      release();
    }
  }, [validateState, setupHandlers]);

  // Initialize presence subscription
  useEffect(() => {
    // Skip initialization if this is a hot reload
    const isHotReload = !!(window as any).__NEXT_DATA__?.buildId;
    if (!isHotReload) {
      void initializeChannel();
    }

    return () => {
      mountedRef.current = false;
      
      // Clear all timeouts
      [retryTimeoutRef, cleanupTimeoutRef].forEach(ref => {
        if (ref.current) {
          clearTimeout(ref.current);
          ref.current = null;
        }
      });

      // Clean up channel
      if (channelRef.current) {
        void (async () => {
          try {
            // Always untrack presence first
            try {
              await channelRef.current?.untrack();
              logger.info('Untracked presence in unmount', {
                ...LOG_CONTEXT,
                action: 'unmountCleanup'
              });
            } catch (untrackError) {
              logger.warn('Error untracking presence in unmount', {
                ...LOG_CONTEXT,
                action: 'unmountCleanup',
                metadata: { error: untrackError }
              });
            }

            // Check if we're using the global channel
            const channel = await getGlobalPresenceChannel();
            if (channelRef.current !== channel) {
              // Only unsubscribe if not using global channel
              try {
                await channelRef.current?.unsubscribe();
                channelRef.current = null;
                logger.info('Unsubscribed from channel in unmount', {
                  ...LOG_CONTEXT,
                  action: 'unmountCleanup'
                });
              } catch (unsubError) {
                logger.warn('Error unsubscribing from channel in unmount', {
                  ...LOG_CONTEXT,
                  action: 'unmountCleanup',
                  metadata: { error: unsubError }
                });
              }
            }
          } catch (error) {
            logger.error('Error cleaning up channel in unmount', {
              ...LOG_CONTEXT,
              action: 'unmountCleanup',
              metadata: { error }
            });
          }
        })();
      }
    };
  }, [initializeChannel]);

  // Keep membersRef in sync with members state
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const safeCleanup = useCallback(async () => {
    const release = await subscriptionMutex.current.acquire();
    try {
      if (!mountedRef.current) return;

      // Clear any pending cleanup timeout
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }

      logger.info('Starting presence cleanup', {
        ...LOG_CONTEXT,
        action: 'cleanup',
        metadata: {
          currentMembers: membersRef.current,
          channelState: channelRef.current?.state,
          subscriptionState: subscriptionStateRef.current
        }
      });

      if (channelRef.current) {
        // Ensure we're not in the middle of subscribing
        if (subscriptionStateRef.current.isSubscribing) {
          const delay = 1000;
          logger.info('Delaying cleanup due to active subscription', {
            ...LOG_CONTEXT,
            action: 'cleanup',
            metadata: { delay }
          });
          cleanupTimeoutRef.current = setTimeout(() => void safeCleanup(), delay);
          return;
        }

        // Get the global channel
        const channel = await getGlobalPresenceChannel();
        
        try {
          // Always untrack presence first
          await channelRef.current.untrack();
          logger.info('Untracked presence', {
            ...LOG_CONTEXT,
            action: 'cleanup'
          });

          // Only unsubscribe if not using global channel
          if (channelRef.current !== channel) {
            try {
              await channelRef.current.unsubscribe();
              channelRef.current = null;
              logger.info('Unsubscribed from channel', {
                ...LOG_CONTEXT,
                action: 'cleanup'
              });
            } catch (unsubError) {
              logger.warn('Error unsubscribing from channel', {
                ...LOG_CONTEXT,
                action: 'cleanup',
                metadata: { error: unsubError }
              });
            }
          }
        } catch (error) {
          logger.warn('Error during cleanup', {
            ...LOG_CONTEXT,
            action: 'cleanup',
            metadata: { error }
          });
        }
      }

      // Clear members after cleanup
      updateMembers([]);
    } catch (error) {
      logger.error('Error during cleanup', {
        ...LOG_CONTEXT,
        action: 'cleanup',
        metadata: { error }
      });
    } finally {
      release();
    }
  }, [updateMembers]);

  const initialize = useCallback(async (member: PartyMember) => {
    if (!channelRef.current) {
      await initializeChannel();
    }

    if (!channelRef.current) {
      throw new Error('Failed to initialize channel');
    }

    // Track presence with all required fields
    const presenceData = {
      id: member.id,
      name: member.name,
      avatar: member.avatar,
      game: member.game,
      muted: member.muted,
      deafened_users: member.deafened_users || [],
      online_at: new Date().toISOString(),
      voice_status: member.voice_status || 'silent',
      agora_uid: member.agora_uid,
    };

    logger.info('Tracking presence with data', {
      ...LOG_CONTEXT,
      action: 'track',
      metadata: { presenceData }
    });

    // Track presence
    await channelRef.current.track(presenceData);
    
    // Get final state after sync
    const state = channelRef.current.presenceState<PresenceMemberState>();
    const newMembers = convertPresenceToMembers(state);
    
    logger.info('Setting members after track', {
      ...LOG_CONTEXT,
      action: 'track',
      metadata: { 
        memberCount: newMembers.length,
        members: newMembers 
      }
    });

    updateMembers(newMembers);

    logger.info('Successfully tracked presence', {
      ...LOG_CONTEXT,
      action: 'initialize',
      metadata: {
        userId: member.id,
        channelState: channelRef.current.state
      }
    });
  }, [initializeChannel, convertPresenceToMembers, updateMembers]);

  return {
    members,
    initialize,
    cleanup: safeCleanup,
  };
}
