import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase, getGlobalPresenceChannel } from '@/lib/api/supabase';
import { logger } from '@/lib/utils/logger';
import type { PartyMember } from '@/lib/types/party';
import { usePresence } from './usePresence';
import { useModalLock } from './useModalLock';
import { useVoicePermissions } from './useVoicePermissions';

const LOG_CONTEXT = { component: 'usePartyState' };
const MIN_INIT_INTERVAL = 1000; // 1 second
const CLEANUP_DELAY = 150; // 150ms delay after cleanup

type PartyState = 'idle' | 'joining' | 'joined' | 'leaving' | 'cleanup';

export function usePartyState() {
  // Core state
  const [currentUser, setCurrentUser] = useState<PartyMember | null>(null);
  const [partyState, setPartyState] = useState<PartyState>('idle');
  const [isRestoringSession, setIsRestoringSession] = useState(false);

  // Refs
  const mountedRef = useRef(true);
  const reconnectingRef = useRef(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastInitTimeRef = useRef<number | null>(null);
  const isCleaningUpRef = useRef(false);
  const loggerRef = useRef(logger);

  // Custom hooks
  const {
    members: presenceMembers,
    isInitializing: isPresenceInitializing,
    initialize: initializePresence,
    cleanup,
  } = usePresence();
  const { modalLocked } = useModalLock();
  const { requestAudioPermission } = useVoicePermissions();

  // Enhanced cleanup function
  const enhancedCleanup = useCallback(async () => {
    loggerRef.current.debug('Starting enhanced cleanup', {
      ...LOG_CONTEXT,
      action: 'enhancedCleanup',
      metadata: { currentUser, partyState, isCleaningUp: isCleaningUpRef.current },
    });

    isCleaningUpRef.current = true;
    try {
      // Clean up presence first
      await cleanup();

      // Then clean up state
      if (mountedRef.current) {
        setPartyState('cleanup');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('partyState');

        // Add delay to ensure cleanup propagates
        await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY));

        if (mountedRef.current) {
          setPartyState('idle');
          setCurrentUser(null);
        }
      }

      loggerRef.current.info('Enhanced cleanup complete', {
        ...LOG_CONTEXT,
        action: 'enhancedCleanup',
        metadata: { success: true },
      });
    } catch (error) {
      loggerRef.current.error('Enhanced cleanup failed', {
        ...LOG_CONTEXT,
        action: 'enhancedCleanup',
        metadata: { error },
      });
      // Still try to reset state on error
      if (mountedRef.current) {
        setPartyState('idle');
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
        localStorage.removeItem('partyState');
      }
    } finally {
      if (mountedRef.current) {
        isCleaningUpRef.current = false;
      }
    }
  }, [currentUser, partyState, cleanup]);

  // Cleanup function for reconnection
  const cleanupReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectingRef.current = false;
  }, []);

  const joinParty = useCallback(
    async (name: string, avatar: string, game: string) => {
      try {
        // Clear any existing session first
        if (currentUser) {
          await enhancedCleanup();
          setCurrentUser(null);
          localStorage.removeItem('currentUser');
        }

        // Set joining state
        setPartyState('joining');
        loggerRef.current.debug('Party state transition', {
          ...LOG_CONTEXT,
          action: 'joinParty',
          metadata: {
            from: partyState,
            to: 'joining',
            userId: currentUser?.id,
          },
        });
        reconnectingRef.current = true;

        // Generate new user ID
        const newUserId = crypto.randomUUID();
        loggerRef.current.info('Initializing presence for new member', {
          ...LOG_CONTEXT,
          action: 'joinParty',
          metadata: { newUserId },
        });

        const newMember: PartyMember = {
          id: newUserId,
          name,
          avatar,
          game,
          is_active: true,
          muted: false,
          created_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          voice_status: 'silent',
          deafened_users: [],
        };

        // Request microphone permission early
        loggerRef.current.debug('Requesting microphone permission during join', {
          ...LOG_CONTEXT,
          action: 'joinParty',
          metadata: { userId: newUserId },
        });

        const hasPermission = await requestAudioPermission();
        if (!hasPermission) {
          loggerRef.current.warn('Microphone permission denied during join', {
            ...LOG_CONTEXT,
            action: 'joinParty',
            metadata: { userId: newUserId },
          });
          // Continue with join even if permission denied
        }

        // Update database first
        const { error: dbError } = await supabase.from('party_members').upsert({
          id: newMember.id,
          name: newMember.name,
          avatar: newMember.avatar,
          game: newMember.game,
          is_active: true,
          last_seen: newMember.last_seen,
        });

        if (dbError) {
          loggerRef.current.error('Failed to join party - database error', {
            ...LOG_CONTEXT,
            action: 'joinParty',
            metadata: { error: dbError },
          });
          throw dbError;
        }

        // Update state and store user data first
        if (mountedRef.current) {
          setCurrentUser(newMember);
          localStorage.setItem('currentUser', JSON.stringify(newMember));
          localStorage.setItem('partyState', 'joined');
        }

        // Initialize presence first
        await initializePresence(newMember);

        // Wait for Agora client to be ready
        loggerRef.current.debug('Waiting for Agora client before completing join', {
          ...LOG_CONTEXT,
          action: 'joinParty',
          metadata: { userId: newMember.id },
        });

        // Small delay to ensure Agora client is ready
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Then set party state to joined
        if (mountedRef.current) {
          const prevState = partyState;
          const stateSnapshot = {
            currentUser: newMember,
            partyState: 'joined' as const,
            isInitializing: false,
            lastInitTime: Date.now(),
          };

          // Log state transition before making changes
          loggerRef.current.debug('Party state transition', {
            ...LOG_CONTEXT,
            action: 'joinParty',
            metadata: {
              from: prevState,
              to: stateSnapshot.partyState,
              userId: newMember.id,
            },
          });

          // Update state and storage atomically
          setPartyState(stateSnapshot.partyState);
          localStorage.setItem('partyState', stateSnapshot.partyState);
          lastInitTimeRef.current = stateSnapshot.lastInitTime;

          // Small delay to ensure state updates are processed
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Log successful join with complete state snapshot
          loggerRef.current.info('Successfully joined party', {
            ...LOG_CONTEXT,
            action: 'joinParty',
            metadata: {
              member: newMember,
              stateSnapshot,
              prevState,
            },
          });
        }
      } catch (error: unknown) {
        loggerRef.current.error('Failed to join party', {
          ...LOG_CONTEXT,
          action: 'joinParty',
          metadata: { error },
        });
        // Reset state on error
        if (mountedRef.current) {
          setPartyState('idle');
          loggerRef.current.debug('Party state transition', {
            ...LOG_CONTEXT,
            action: 'joinParty',
            metadata: {
              from: partyState,
              to: 'idle',
              error: true,
            },
          });
          setCurrentUser(null);
          localStorage.removeItem('currentUser');
        }
        throw error;
      } finally {
        if (mountedRef.current) {
          reconnectingRef.current = false;
        }
      }
    },
    [currentUser, enhancedCleanup, initializePresence, partyState, requestAudioPermission]
  );

  const leaveParty = useCallback(async () => {
    if (
      !currentUser ||
      partyState === 'leaving' ||
      partyState === 'cleanup' ||
      isCleaningUpRef.current
    ) {
      loggerRef.current.debug('Ignoring leave request - invalid state or transition in progress', {
        ...LOG_CONTEXT,
        action: 'leaveParty',
        metadata: {
          currentState: partyState,
          hasCurrentUser: !!currentUser,
          isCleaningUp: isCleaningUpRef.current,
        },
      });
      return;
    }

    const userId = currentUser.id;
    isCleaningUpRef.current = true;

    try {
      reconnectingRef.current = true;
      cleanupReconnect();

      // Set leaving state first
      setPartyState('leaving');
      loggerRef.current.debug('Party state transition', {
        ...LOG_CONTEXT,
        action: 'leaveParty',
        metadata: { from: partyState, to: 'leaving', userId },
      });

      // Update database first
      const { error: dbError } = await supabase
        .from('party_members')
        .update({ is_active: false, last_seen: new Date().toISOString() })
        .eq('id', userId);

      if (dbError) {
        loggerRef.current.error('Failed to update member status', {
          ...LOG_CONTEXT,
          action: 'leaveParty',
          metadata: { error: dbError, userId },
        });
      }

      // Then clear user data and cleanup presence
      localStorage.removeItem('currentUser');
      localStorage.removeItem('partyState');
      setCurrentUser(null);
      await cleanup();

      // Add extra delay to ensure cleanup propagates
      if (mountedRef.current) {
        await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY));
        setPartyState('idle');
        loggerRef.current.debug('Party state transition', {
          ...LOG_CONTEXT,
          action: 'leaveParty',
          metadata: { from: 'leaving', to: 'idle', userId },
        });
      }

      loggerRef.current.info('Successfully left party', {
        ...LOG_CONTEXT,
        action: 'leaveParty',
        metadata: { userId },
      });
    } catch (error) {
      loggerRef.current.error('Failed to leave party', {
        ...LOG_CONTEXT,
        action: 'leaveParty',
        metadata: { error, userId },
      });
      // On error, still try to clean up user data
      if (mountedRef.current) {
        setPartyState('idle');
        loggerRef.current.debug('Party state transition', {
          ...LOG_CONTEXT,
          action: 'leaveParty',
          metadata: { from: partyState, to: 'idle', error: true, userId },
        });
      }
    } finally {
      if (mountedRef.current) {
        reconnectingRef.current = false;
        isCleaningUpRef.current = false;
      }
    }
  }, [currentUser, partyState, cleanup, cleanupReconnect]);

  // Effect to handle reconnection
  useEffect(() => {
    if (
      !currentUser ||
      isPresenceInitializing ||
      partyState === 'leaving' ||
      isCleaningUpRef.current ||
      reconnectingRef.current
    ) {
      return;
    }

    // Skip reconnect if we just initialized
    const lastInitTime = Date.now() - (lastInitTimeRef.current || 0);
    if (lastInitTime < MIN_INIT_INTERVAL) {
      return;
    }

    // First check if user is still active in database
    const validateAndReconnect = async () => {
      // Skip if we're already reconnecting, unmounted, or in cleanup
      if (reconnectingRef.current || !mountedRef.current || isCleaningUpRef.current) return;
      reconnectingRef.current = true;

      try {
        const { data, error } = await supabase
          .from('party_members')
          .select('*')
          .eq('id', currentUser.id)
          .eq('is_active', true)
          .single();

        if (!mountedRef.current || isCleaningUpRef.current) return;

        if (error || !data) {
          loggerRef.current.info('User no longer active, cleaning up', {
            ...LOG_CONTEXT,
            action: 'validateAndReconnect',
            metadata: { userId: currentUser.id, error },
          });
          await enhancedCleanup();
          return;
        }

        // User is still active, try to reconnect
        try {
          loggerRef.current.info('Attempting to reconnect user', {
            ...LOG_CONTEXT,
            action: 'validateAndReconnect',
            metadata: { userId: currentUser.id },
          });
          await initializePresence(currentUser);
          lastInitTimeRef.current = Date.now(); // Update last init time after successful reconnect
        } catch (error) {
          loggerRef.current.error('Failed to reconnect user', {
            ...LOG_CONTEXT,
            action: 'validateAndReconnect',
            metadata: { error },
          });
        }
      } finally {
        if (mountedRef.current) {
          reconnectingRef.current = false;
        }
      }
    };

    validateAndReconnect();
  }, [currentUser, partyState, isPresenceInitializing, enhancedCleanup, initializePresence]);

  // Effect to cleanup stale members periodically
  useEffect(() => {
    if (!currentUser || isCleaningUpRef.current) return;

    const cleanupInterval = setInterval(async () => {
      if (!mountedRef.current || !currentUser || isCleaningUpRef.current) return;

      try {
        // Get all active members from database
        const { data: activeMembers, error } = await supabase
          .from('party_members')
          .select('id')
          .eq('is_active', true);

        if (!mountedRef.current || isCleaningUpRef.current) return;

        if (error) {
          loggerRef.current.error('Failed to fetch active members', {
            ...LOG_CONTEXT,
            action: 'cleanupStaleMembers',
            metadata: { error },
          });
          return;
        }

        const activeIds = new Set(activeMembers.map((m) => m.id));

        // Clean up any members in presence that aren't active in DB
        const staleMembers = presenceMembers.filter((m) => !activeIds.has(m.id));
        if (staleMembers.length > 0) {
          loggerRef.current.info('Cleaning up stale members', {
            ...LOG_CONTEXT,
            action: 'cleanupStaleMembers',
            metadata: { staleMembers: staleMembers.map((m) => m.id) },
          });
          await enhancedCleanup();
          if (mountedRef.current && !isCleaningUpRef.current) {
            await initializePresence(currentUser);
          }
        }
      } catch (error) {
        if (!mountedRef.current) return;
        loggerRef.current.error('Failed to cleanup stale members', {
          ...LOG_CONTEXT,
          action: 'cleanupStaleMembers',
          metadata: { error },
        });
      }
    }, 60000); // Run every minute

    return () => {
      clearInterval(cleanupInterval);
    };
  }, [currentUser, presenceMembers, enhancedCleanup, initializePresence]);

  // Effect to restore session from localStorage
  useEffect(() => {
    if (!mountedRef.current) return;

    const savedUser = localStorage.getItem('currentUser');
    const savedPartyState = localStorage.getItem('partyState');

    if (savedUser) {
      const parsedUser = JSON.parse(savedUser) as PartyMember;
      loggerRef.current.info('Restoring user session', {
        ...LOG_CONTEXT,
        action: 'restoreSession',
        metadata: {
          userId: parsedUser.id,
          savedPartyState,
          currentPartyState: partyState,
        },
      });

      // Clean up any existing presence first
      const restoreSession = async () => {
        try {
          // Set restoration flag
          setIsRestoringSession(true);
          // Set cleanup flag to prevent concurrent operations
          isCleaningUpRef.current = true;

          // Clean up any existing presence
          await cleanup();

          // Get presence channel and check its state
          const presenceChannel = await getGlobalPresenceChannel();
          if (presenceChannel?.state === 'errored') {
            loggerRef.current.warn('Presence channel in error state during session restore', {
              ...LOG_CONTEXT,
              action: 'restoreSession',
              metadata: {
                channelState: presenceChannel.state,
                userId: parsedUser.id,
              },
            });
            // Wait for channel to recover before proceeding
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }

          // Validate user in database
          const { data, error } = await supabase
            .from('party_members')
            .select('*')
            .eq('id', parsedUser.id)
            .eq('is_active', true)
            .single();

          if (!mountedRef.current) return;

          if (error || !data) {
            loggerRef.current.info('Saved user not found in database, cleaning up', {
              ...LOG_CONTEXT,
              action: 'restoreSession',
              metadata: { error },
            });
            localStorage.removeItem('currentUser');
            localStorage.removeItem('partyState');
            setPartyState('idle');
            setCurrentUser(null);
            return;
          }

          // Update the user data with latest from DB
          const updatedUser = {
            ...parsedUser,
            ...data,
            last_seen: new Date().toISOString(),
          };

          // Update database with latest timestamp
          await supabase
            .from('party_members')
            .update({ last_seen: updatedUser.last_seen })
            .eq('id', updatedUser.id);

          if (!mountedRef.current) return;

          // Set state first
          setCurrentUser(updatedUser);
          localStorage.setItem('currentUser', JSON.stringify(updatedUser));

          if (savedPartyState === 'joined') {
            setPartyState('joining');

            try {
              // Check presence channel state again before initializing
              const presenceChannel = await getGlobalPresenceChannel();
              if (presenceChannel?.state === 'errored') {
                loggerRef.current.warn('Presence channel in error state before initializing presence', {
                  ...LOG_CONTEXT,
                  action: 'restoreSession',
                  metadata: {
                    channelState: presenceChannel.state,
                    userId: updatedUser.id,
                  },
                });
                // Wait for channel to recover before proceeding
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }

              await initializePresence(updatedUser);
              if (mountedRef.current) {
                setPartyState('joined');
                localStorage.setItem('partyState', 'joined');
                lastInitTimeRef.current = Date.now();
                loggerRef.current.info('Successfully restored session', {
                  ...LOG_CONTEXT,
                  action: 'restoreSession',
                  metadata: {
                    userId: updatedUser.id,
                    stateTransitions: {
                      from: 'idle',
                      through: 'joining',
                      to: 'joined',
                    },
                  },
                });
              }
            } catch (error) {
              loggerRef.current.error('Failed to initialize presence during restore', {
                ...LOG_CONTEXT,
                action: 'restoreSession',
                metadata: { error },
              });
              if (mountedRef.current) {
                setPartyState('idle');
                setCurrentUser(null);
                localStorage.removeItem('currentUser');
                localStorage.removeItem('partyState');
              }
            }
          }
        } catch (error) {
          loggerRef.current.error('Failed to restore session', {
            ...LOG_CONTEXT,
            action: 'restoreSession',
            metadata: { error },
          });
          if (mountedRef.current) {
            setPartyState('idle');
            setCurrentUser(null);
            localStorage.removeItem('currentUser');
            localStorage.removeItem('partyState');
          }
        } finally {
          if (mountedRef.current) {
            isCleaningUpRef.current = false;
            setIsRestoringSession(false);
          }
        }
      };

      restoreSession();
    }
  }, [mountedRef.current]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanupReconnect();
    };
  }, [cleanupReconnect]);

  const editProfile = useCallback(
    async (name: string, avatar: string, game: string) => {
      if (!currentUser) {
        throw new Error('No user to edit');
      }

      try {
        // Set reconnecting flag to prevent validation during update
        reconnectingRef.current = true;

        // Store current party state
        const previousPartyState = partyState;

        // Update database first
        const { error: dbError } = await supabase
          .from('party_members')
          .update({
            name,
            avatar,
            game,
            last_seen: new Date().toISOString(),
          })
          .eq('id', currentUser.id);

        if (dbError) {
          loggerRef.current.error('Failed to update profile - database error', {
            ...LOG_CONTEXT,
            action: 'editProfile',
            metadata: { error: dbError },
          });
          throw dbError;
        }

        // Update local state
        const updatedUser = {
          ...currentUser,
          name,
          avatar,
          game,
          last_seen: new Date().toISOString(),
        };

        // Set state to joining while we reinitialize presence
        if (previousPartyState === 'joined') {
          setPartyState('joining');
        }

        setCurrentUser(updatedUser);
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));

        // Update presence with new user data
        await initializePresence(updatedUser);
        lastInitTimeRef.current = Date.now(); // Prevent immediate reconnect

        // Restore previous party state
        if (mountedRef.current && previousPartyState === 'joined') {
          setPartyState('joined');
          localStorage.setItem('partyState', 'joined');
        }

        loggerRef.current.info('Successfully updated profile', {
          ...LOG_CONTEXT,
          action: 'editProfile',
          metadata: {
            member: updatedUser,
            stateTransitions: {
              from: previousPartyState,
              through: 'joining',
              to: previousPartyState,
            },
          },
        });
      } catch (error) {
        loggerRef.current.error('Failed to update profile', {
          ...LOG_CONTEXT,
          action: 'editProfile',
          metadata: { error },
        });
        throw error;
      } finally {
        if (mountedRef.current) {
          reconnectingRef.current = false;
        }
      }
    },
    [currentUser, partyState, initializePresence]
  );

  return {
    currentUser,
    members: presenceMembers,
    isInitializing: isPresenceInitializing,
    partyState,
    modalLocked,
    isRestoringSession,
    joinParty,
    leaveParty,
    editProfile,
  };
}
