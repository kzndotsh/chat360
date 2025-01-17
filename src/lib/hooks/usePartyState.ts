'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/api/supabase';
import { logger } from '@/lib/utils/logger';
import type { PartyMember } from '@/lib/types/party';
import { usePresence } from './usePresence';

type PartyState = 'idle' | 'joining' | 'joined' | 'leaving';

interface PartyStateReturn {
  currentUser: PartyMember | null;
  members: PartyMember[];
  partyState: PartyState;
  joinParty: (name: string, avatar: string, game: string) => Promise<PartyMember>;
  leaveParty: () => Promise<void>;
  editProfile: (name: string, avatar: string, game: string) => Promise<void>;
  setJoinedState: () => void;
}

const LOG_CONTEXT = { component: 'usePartyState' };

export function usePartyState(): PartyStateReturn {
  // Core state
  const [currentUser, setCurrentUser] = useState<PartyMember | null>(null);
  const [partyState, setPartyState] = useState<PartyState>('idle');
  
  // Refs
  const mountedRef = useRef(true);
  const loggerRef = useRef(logger);

  // Custom hooks
  const {
    members: presenceMembers,
    initialize: initializePresence,
    cleanup,
  } = usePresence();

  // Initialize state from localStorage
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('currentUser');
      const savedPartyState = localStorage.getItem('partyState');

      if (savedUser && savedPartyState === 'joined') {
        const parsedUser = JSON.parse(savedUser) as PartyMember;
        setCurrentUser(parsedUser);
        
        // Re-initialize presence for the restored user
        initializePresence(parsedUser)
          .then(() => {
            logger.debug('Successfully restored session and initialized presence', {
              component: 'usePartyState',
              metadata: { userId: parsedUser.id }
            });
            setPartyState('joined');
          })
          .catch((error) => {
            logger.error('Failed to initialize presence for restored user', {
              component: 'usePartyState',
              action: 'restoreSession',
              metadata: { error },
            });
            // On presence init error, clear the session
            setCurrentUser(null);
            setPartyState('idle');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('partyState');
          });
      }
    } catch (error) {
      logger.error('Failed to restore session from localStorage', {
        component: 'usePartyState',
        action: 'restoreSession',
        metadata: { error },
      });
      // On error, clear potentially corrupted data
      localStorage.removeItem('currentUser');
      localStorage.removeItem('partyState');
    }
  }, [initializePresence]);

  // Track party state changes
  useEffect(() => {
    logger.debug('Party state changed in usePartyState', {
      component: 'usePartyState',
      metadata: {
        from: partyState,
        userId: currentUser?.id,
        timestamp: new Date().toISOString()
      }
    });

    // Ensure state is persisted to localStorage immediately
    if (partyState === 'joined') {
      localStorage.setItem('partyState', 'joined');
    } else if (partyState === 'idle') {
      localStorage.removeItem('partyState');
    }
  }, [partyState, currentUser?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const joinParty = useCallback(
    async (name: string, avatar: string, game: string) => {
      try {
        // Clear any existing session first
        if (currentUser) {
          await cleanup();
          setCurrentUser(null);
          localStorage.removeItem('currentUser');
        }

        // Set joining state
        setPartyState('joining');

        // Generate new user ID
        const newUserId = crypto.randomUUID();
        const newMember: PartyMember = {
          id: newUserId,
          name,
          avatar,
          game,
          is_active: true,
          voice_status: 'silent',
          created_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
        };

        // Update database
        const { error: dbError } = await supabase.from('party_members').upsert({
          id: newMember.id,
          name: newMember.name,
          avatar: newMember.avatar,
          game: newMember.game,
          is_active: true,
          last_seen: newMember.last_seen,
        });

        if (dbError) throw dbError;

        // Update state and store user data
        if (mountedRef.current) {
          setCurrentUser(newMember);
          localStorage.setItem('currentUser', JSON.stringify(newMember));
        }

        // Initialize presence
        await initializePresence(newMember);

        // Set party state to joined only after presence is initialized
        if (mountedRef.current) {
          logger.debug('Setting party state to joined', {
            component: 'usePartyState',
            action: 'setJoinedState',
            metadata: { 
              userId: newMember.id,
              timestamp: new Date().toISOString(),
              mounted: mountedRef.current,
              currentState: partyState
            }
          });
          localStorage.setItem('partyState', 'joined');
          setPartyState('joined');
          
          logger.info('Successfully completed party join sequence', {
            component: 'usePartyState',
            action: 'joinComplete',
            metadata: { 
              userId: newMember.id,
              timestamp: new Date().toISOString()
            }
          });
        }

        return newMember;
      } catch (error) {
        logger.error('Failed to join party', {
          component: 'usePartyState',
          action: 'joinParty',
          metadata: { error },
        });
        // Reset state on error
        if (mountedRef.current) {
          setPartyState('idle');
          setCurrentUser(null);
          localStorage.removeItem('currentUser');
          localStorage.removeItem('partyState');
        }
        throw error;
      }
    },
    [currentUser, cleanup, initializePresence, partyState]
  );

  const leaveParty = useCallback(async () => {
    if (!currentUser || partyState === 'leaving') return;

    try {
      setPartyState('leaving');

      // Update database
      await supabase
        .from('party_members')
        .update({ is_active: false, last_seen: new Date().toISOString() })
        .eq('id', currentUser.id);

      // Clear user data and cleanup presence
      localStorage.removeItem('currentUser');
      localStorage.removeItem('partyState');
      setCurrentUser(null);
      await cleanup();

      if (mountedRef.current) {
        setPartyState('idle');
      }
    } catch (error) {
      loggerRef.current.error('Failed to leave party', {
        component: 'usePartyState',
        action: 'leaveParty',
        metadata: { error },
      });
      // On error, still try to clean up user data
      if (mountedRef.current) {
        setPartyState('idle');
        setCurrentUser(null);
      }
      throw error;
    }
  }, [currentUser, partyState, cleanup]);

  const editProfile = useCallback(
    async (name: string, avatar: string, game: string) => {
      if (!currentUser) throw new Error('No user to edit');

      try {
        // Update database
        const { error: dbError } = await supabase
          .from('party_members')
          .update({
            name,
            avatar,
            game,
            last_seen: new Date().toISOString(),
          })
          .eq('id', currentUser.id);

        if (dbError) throw dbError;

        // Update local state
        const updatedUser = {
          ...currentUser,
          name,
          avatar,
          game,
          last_seen: new Date().toISOString(),
        };

        setCurrentUser(updatedUser);
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));

        // Update presence
        await initializePresence(updatedUser);
      } catch (error) {
        loggerRef.current.error('Failed to update profile', {
          component: 'usePartyState',
          action: 'editProfile',
          metadata: { error },
        });
        throw error;
      }
    },
    [currentUser, initializePresence]
  );

  const setJoinedState = useCallback(() => {
    if (!currentUser?.id) {
      logger.error('Cannot set joined state - no user ID', {
        ...LOG_CONTEXT,
        action: 'setJoinedState',
        metadata: { currentUser }
      });
      return;
    }

    logger.info('Setting party state to joined', {
      ...LOG_CONTEXT,
      action: 'setJoinedState',
      metadata: {
        userId: currentUser.id,
        timestamp: new Date().toISOString(),
        currentState: partyState
      }
    });

    setPartyState('joined');
  }, [currentUser, partyState]);

  return useMemo(() => ({
    currentUser,
    members: presenceMembers,
    partyState,
    joinParty,
    leaveParty,
    editProfile,
    setJoinedState,
  }), [currentUser, presenceMembers, partyState, joinParty, leaveParty, editProfile, setJoinedState]);
}
