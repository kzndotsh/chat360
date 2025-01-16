import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/api/supabase';
import { logger } from '@/lib/utils/logger';
import type { PartyMember } from '@/lib/types/party';
import { usePresence } from './usePresence';
import { useModalLock } from './useModalLock';

const LOG_CONTEXT = { component: 'usePartyState', module: 'hooks' };
const MIN_INIT_INTERVAL = 1000; // 1 second
const CLEANUP_DELAY = 150; // 150ms delay after cleanup

type PartyState = 'idle' | 'joining' | 'joined' | 'leaving' | 'cleanup';

export function usePartyState() {
  // Core state
  const [currentUser, setCurrentUser] = useState<PartyMember | null>(null);
  const [partyState, setPartyState] = useState<PartyState>('idle');

  // Refs
  const loggerRef = useRef(logger);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectingRef = useRef(false);
  const lastInitTimeRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const cleanupPromiseRef = useRef<Promise<void> | null>(null);
  const isCleaningUpRef = useRef(false);

  // Custom hooks
  const { members, isInitializing, initialize: initializePresence, cleanup } = usePresence();
  const { modalLocked } = useModalLock();

  // Enhanced cleanup function that tracks completion
  const enhancedCleanup = useCallback(async () => {
    if (cleanupPromiseRef.current) {
      await cleanupPromiseRef.current;
      return;
    }

    setPartyState('cleanup');
    reconnectingRef.current = true; // Prevent reconnection attempts during cleanup
    isCleaningUpRef.current = true;
    
    cleanupPromiseRef.current = (async () => {
      try {
        // Clear user data first
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
        
        // Then clean up presence
        await cleanup();
        
        // Add delay to ensure cleanup propagates
        await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY));
        
        // Reset all state
        if (mountedRef.current) {
          setPartyState('idle');
          reconnectingRef.current = false;
          lastInitTimeRef.current = null;
        }
      } finally {
        cleanupPromiseRef.current = null;
        isCleaningUpRef.current = false;
      }
    })();

    await cleanupPromiseRef.current;
  }, [cleanup]);

  // Cleanup function for reconnection
  const cleanupReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectingRef.current = false;
  }, []);

  const joinParty = useCallback(async (name: string, avatar: string, game: string) => {
    try {
      // Clear any existing session first
      if (currentUser) {
        await enhancedCleanup();
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
      }

      // Set joining state
      setPartyState('joining');
      reconnectingRef.current = true;

      // Generate new user ID
      const newUserId = crypto.randomUUID();
      loggerRef.current.info('Initializing presence for new member', {
        ...LOG_CONTEXT,
        action: 'joinParty',
        metadata: { newUserId }
      });

      const newMember: PartyMember = {
        id: newUserId,
        name,
        avatar,
        game,
        is_active: true,
        muted: false,
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      };

      // Update database first
      const { error: dbError } = await supabase
        .from('party_members')
        .upsert({
          id: newMember.id,
          name: newMember.name,
          avatar: newMember.avatar,
          game: newMember.game,
          is_active: true,
          last_seen: newMember.last_seen
        });

      if (dbError) {
        loggerRef.current.error('Failed to join party - database error', {
          ...LOG_CONTEXT,
          action: 'joinParty',
          metadata: { error: dbError }
        });
        throw dbError;
      }

      // Initialize presence
      await initializePresence(newMember);

      // Update state and store user data
      if (mountedRef.current) {
        setCurrentUser(newMember);
        setPartyState('joined');
        localStorage.setItem('currentUser', JSON.stringify(newMember));
        lastInitTimeRef.current = Date.now();
      }

      loggerRef.current.info('Successfully joined party', {
        ...LOG_CONTEXT,
        action: 'joinParty',
        metadata: { member: newMember }
      });
    } catch (error: unknown) {
      loggerRef.current.error('Failed to join party', {
        ...LOG_CONTEXT,
        action: 'joinParty',
        metadata: { error }
      });
      // Reset state on error
      if (mountedRef.current) {
        setPartyState('idle');
        setCurrentUser(null);
        localStorage.removeItem('currentUser');
      }
      throw error;
    } finally {
      if (mountedRef.current) {
        reconnectingRef.current = false;
      }
    }
  }, [currentUser, enhancedCleanup, initializePresence]);

  const leaveParty = useCallback(async () => {
    if (!currentUser || partyState === 'leaving' || partyState === 'cleanup') {
      loggerRef.current.debug('Ignoring leave request - invalid state or transition in progress', {
        ...LOG_CONTEXT,
        action: 'leaveParty',
        metadata: { currentState: partyState, hasCurrentUser: !!currentUser }
      });
      return;
    }

    const userId = currentUser.id; // Store ID for later use

    try {
      reconnectingRef.current = true;
      cleanupReconnect();
      
      // Set leaving state first
      setPartyState('leaving');

      // Update database first to mark user as inactive
      const { error: dbError } = await supabase
        .from('party_members')
        .update({ is_active: false })
        .eq('id', userId);

      if (dbError) {
        loggerRef.current.error('Failed to update member status', {
          ...LOG_CONTEXT,
          action: 'leaveParty',
          metadata: { error: dbError }
        });
      }

      // Clean up presence
      loggerRef.current.debug('Cleaning up presence before leave', {
        ...LOG_CONTEXT,
        action: 'leaveParty',
        metadata: { userId }
      });
      
      // Clear user data before cleanup to prevent any race conditions
      localStorage.removeItem('currentUser');
      setCurrentUser(null);
      
      await enhancedCleanup();
      
      // Add extra delay to ensure cleanup propagates
      if (mountedRef.current) {
        await new Promise(resolve => setTimeout(resolve, CLEANUP_DELAY * 2));
        setPartyState('idle');
      }
      
      loggerRef.current.info('Successfully left party', {
        ...LOG_CONTEXT,
        action: 'leaveParty'
      });
    } catch (error) {
      loggerRef.current.error('Failed to leave party', {
        ...LOG_CONTEXT,
        action: 'leaveParty',
        metadata: { error }
      });
      // On error, still try to clean up user data
      if (mountedRef.current) {
        localStorage.removeItem('currentUser');
        setCurrentUser(null);
        setPartyState('idle');
      }
      throw error;
    } finally {
      if (mountedRef.current) {
        reconnectingRef.current = false;
      }
    }
  }, [currentUser, partyState, enhancedCleanup, cleanupReconnect]);

  // Effect to handle reconnection
  useEffect(() => {
    if (!currentUser || isInitializing || partyState === 'leaving' || isCleaningUpRef.current || reconnectingRef.current) {
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
            metadata: { userId: currentUser.id, error }
          });
          await enhancedCleanup();
          return;
        }

        // User is still active, try to reconnect
        try {
          loggerRef.current.info('Attempting to reconnect user', {
            ...LOG_CONTEXT,
            action: 'validateAndReconnect',
            metadata: { userId: currentUser.id }
          });
          await initializePresence(currentUser);
          lastInitTimeRef.current = Date.now(); // Update last init time after successful reconnect
        } catch (error) {
          loggerRef.current.error('Failed to reconnect user', {
            ...LOG_CONTEXT,
            action: 'validateAndReconnect',
            metadata: { error }
          });
        }
      } finally {
        if (mountedRef.current) {
          reconnectingRef.current = false;
        }
      }
    };

    validateAndReconnect();
  }, [currentUser, partyState, isInitializing, enhancedCleanup, initializePresence]);

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
        const staleMembers = members.filter((m) => !activeIds.has(m.id));
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
  }, [currentUser, members, enhancedCleanup, initializePresence]);

  // Effect to restore session from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (
      savedUser &&
      !currentUser &&
      !isInitializing &&
      ['idle', 'cleanup'].includes(partyState) &&
      !reconnectingRef.current
    ) {
      try {
        const parsedUser = JSON.parse(savedUser) as PartyMember;

        // Check if this member is still active in the database
        const validateSession = async () => {
          const { data, error } = await supabase
            .from('party_members')
            .select('is_active')
            .eq('id', parsedUser.id)
            .single();

          if (!mountedRef.current) return;

          if (error || !data?.is_active) {
            loggerRef.current.info('Removing stale session - user not active in database', {
              ...LOG_CONTEXT,
              action: 'validateSession',
              metadata: { userId: parsedUser.id },
            });
            localStorage.removeItem('currentUser');
            return;
          }

          try {
            loggerRef.current.debug('Restoring user session', {
              ...LOG_CONTEXT,
              action: 'restoreSession',
              metadata: { userId: parsedUser.id },
            });

            // Set the user first so presence can initialize
            setCurrentUser(parsedUser);
            lastInitTimeRef.current = Date.now();
          } catch (error) {
            loggerRef.current.error('Failed to restore session', {
              ...LOG_CONTEXT,
              action: 'validateSession',
              metadata: { error },
            });
            localStorage.removeItem('currentUser');
          }
        };

        validateSession();
      } catch (error) {
        loggerRef.current.error('Failed to restore user session', {
          ...LOG_CONTEXT,
          action: 'restoreSession',
          metadata: { error },
        });
        localStorage.removeItem('currentUser');
      }
    }
  }, [currentUser, isInitializing, partyState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanupReconnect();
    };
  }, [cleanupReconnect]);

  const editProfile = useCallback(async (name: string, avatar: string, game: string) => {
    if (!currentUser) {
      throw new Error('No user to edit');
    }

    try {
      // Set reconnecting flag to prevent validation during update
      reconnectingRef.current = true;
      
      // Update database first
      const { error: dbError } = await supabase
        .from('party_members')
        .update({
          name,
          avatar,
          game,
          last_seen: new Date().toISOString()
        })
        .eq('id', currentUser.id);

      if (dbError) {
        loggerRef.current.error('Failed to update profile - database error', {
          ...LOG_CONTEXT,
          action: 'editProfile',
          metadata: { error: dbError }
        });
        throw dbError;
      }

      // Update local state
      const updatedUser = {
        ...currentUser,
        name,
        avatar,
        game,
        last_seen: new Date().toISOString()
      };
      
      setCurrentUser(updatedUser);
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));

      // Update presence with new user data
      await initializePresence(updatedUser);
      lastInitTimeRef.current = Date.now(); // Prevent immediate reconnect

      loggerRef.current.info('Successfully updated profile', {
        ...LOG_CONTEXT,
        action: 'editProfile',
        metadata: { member: updatedUser }
      });
    } catch (error) {
      loggerRef.current.error('Failed to update profile', {
        ...LOG_CONTEXT,
        action: 'editProfile',
        metadata: { error }
      });
      throw error;
    } finally {
      if (mountedRef.current) {
        reconnectingRef.current = false;
      }
    }
  }, [currentUser, initializePresence]);

  return {
    currentUser,
    members,
    isInitializing,
    partyState,
    modalLocked,
    joinParty,
    leaveParty,
    editProfile,
  };
}
