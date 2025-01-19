'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PartyMember } from '@/lib/types/party';
import { logger } from '@/lib/utils/logger';
import { usePresence } from '@/lib/hooks/usePresence';
import { Mutex } from 'async-mutex';

type PartyState = 'idle' | 'joining' | 'joined' | 'leaving';

// Create a single mutex instance for all hook instances
const stateMutex = new Mutex();

interface PartyStateReturn {
  currentUser: PartyMember | null;
  partyState: PartyState;
  joinParty: (name: string, avatar: string, game: string) => Promise<PartyMember>;
  leaveParty: () => Promise<void>;
  editProfile: (name: string, avatar: string, game: string) => Promise<void>;
}

const LOG_CONTEXT = { component: 'usePartyState' };

export function usePartyState(): PartyStateReturn {
  const [currentUser, setCurrentUser] = useState<PartyMember | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  });

  const [partyState, setPartyState] = useState<PartyState>(() => {
    if (typeof window === 'undefined') return 'idle';
    const saved = localStorage.getItem('partyState');
    return (saved as PartyState) || 'idle';
  });

  // Refs
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const joinInProgress = useRef(false);
  const subscriptionRef = useRef<boolean>(false);

  // Custom hooks
  const { members: presenceMembers, initialize: initializePresence, cleanup } = usePresence();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (subscriptionRef.current) {
        void cleanup().catch(err => {
          logger.error('Failed to cleanup on unmount', {
            ...LOG_CONTEXT,
            action: 'cleanup',
            metadata: { error: err },
          });
        });
      }
    };
  }, [cleanup]);

  // Initialize state from localStorage with retry logic
  useEffect(() => {
    const initializeFromStorage = async () => {
      if (initializingRef.current || !mountedRef.current) return;
      
      try {
        initializingRef.current = true;
        const savedUser = localStorage.getItem('currentUser');
        const savedState = localStorage.getItem('partyState');
        
        if (savedUser && savedState === 'joined' && !subscriptionRef.current) {
          const user = JSON.parse(savedUser);
          
          // Set initial state before attempting subscription
          setCurrentUser(user);
          setPartyState('joining');
          
          // Wait for WebSocket connection to be ready
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Clean up any existing subscriptions first
          await cleanup();
          
          try {
            // Initialize presence and wait for subscription to be ready
            await initializePresence(user);
            subscriptionRef.current = true;
            
            if (mountedRef.current) {
              setPartyState('joined');
            }
          } catch (err) {
            logger.error('Failed to initialize presence during restore', {
              ...LOG_CONTEXT,
              action: 'initializeFromStorage',
              metadata: { error: err },
            });
            
            // Clean up failed subscription
            if (subscriptionRef.current) {
              await cleanup();
              subscriptionRef.current = false;
            }
            
            // Reset state on failure
            if (mountedRef.current) {
              setCurrentUser(null);
              setPartyState('idle');
              localStorage.removeItem('currentUser');
              localStorage.removeItem('partyState');
            }
            
            throw err;
          }
        }
      } catch (err) {
        logger.error('Failed to initialize from storage', {
          ...LOG_CONTEXT,
          action: 'initializeFromStorage',
          metadata: { error: err },
        });
        // Clear invalid state
        localStorage.removeItem('currentUser');
        localStorage.removeItem('partyState');
        if (mountedRef.current) {
          setCurrentUser(null);
          setPartyState('idle');
        }
      } finally {
        initializingRef.current = false;
      }
    };

    void initializeFromStorage();
  }, [initializePresence, cleanup]);

  // Track party state changes with better error handling and state validation
  useEffect(() => {
    const timestamp = new Date().toISOString();
    
    logger.debug('Party state changed in usePartyState', {
      ...LOG_CONTEXT,
      metadata: {
        from: partyState,
        userId: currentUser?.id,
        timestamp,
      },
    });

    // Validate state transitions
    if (partyState === 'joined' && !currentUser) {
      logger.error('Invalid state: joined without current user', {
        ...LOG_CONTEXT,
        metadata: { partyState, timestamp },
      });
      setPartyState('idle');
      return;
    }

    // Handle state persistence with error checking
    try {
      if (partyState === 'joined' && currentUser) {
        // Wait for any pending state updates before persisting
        setTimeout(() => {
          if (mountedRef.current) {
            localStorage.setItem('partyState', 'joined');
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
          }
        }, 500);
      } else if (partyState === 'idle') {
        localStorage.removeItem('partyState');
        localStorage.removeItem('currentUser');
      }
    } catch (error) {
      logger.error('Failed to persist party state', {
        ...LOG_CONTEXT,
        metadata: { error, partyState, timestamp },
      });
    }
  }, [partyState, currentUser]);

  const joinParty = useCallback(async (name: string, avatar: string, game: string) => {
    if (joinInProgress.current) {
      throw new Error('Join already in progress');
    }

    if (subscriptionRef.current) {
      throw new Error('Already subscribed to party');
    }

    joinInProgress.current = true;
    let lastError: Error | null = null;

    return await stateMutex.runExclusive(async () => {
      try {
        const newMember: PartyMember = {
          id: uuidv4(),
          name,
          avatar,
          game,
          is_active: true,
          created_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          voice_status: 'silent',
        };

        // Set state to joining before any async operations
        setPartyState('joining');
        setCurrentUser(newMember);
        
        // Wait for WebSocket connection to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Clean up any existing subscriptions first
        await cleanup();

        try {
          // Initialize presence and wait for subscription to be ready
          await initializePresence(newMember);
          subscriptionRef.current = true;
          
          logger.info('Successfully joined party', {
            ...LOG_CONTEXT,
            action: 'joinParty',
            metadata: { memberId: newMember.id },
          });
          
          // Update state and localStorage atomically
          if (mountedRef.current) {
            setPartyState('joined');
            localStorage.setItem('currentUser', JSON.stringify(newMember));
            localStorage.setItem('partyState', 'joined');
          }
          
          return newMember;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          logger.error('Failed to initialize presence', {
            ...LOG_CONTEXT,
            action: 'joinParty',
            metadata: { error: lastError },
          });
          
          // Ensure cleanup on failed subscription
          if (subscriptionRef.current) {
            await cleanup();
            subscriptionRef.current = false;
          }
          throw lastError;
        }
      } catch (error) {
        logger.error('Failed to join party', {
          ...LOG_CONTEXT,
          action: 'joinParty',
          metadata: { error },
        });

        // Clean up any partial state
        if (mountedRef.current) {
          setCurrentUser(null);
          setPartyState('idle');
          localStorage.removeItem('currentUser');
          localStorage.removeItem('partyState');
        }
        
        throw error;
      } finally {
        joinInProgress.current = false;
      }
    });
  }, [cleanup, initializePresence]);

  const leaveParty = useCallback(async () => {
    return stateMutex.runExclusive(async () => {
      if (!currentUser) {
        throw new Error('No user to remove from party');
      }

      if (partyState === 'leaving') {
        throw new Error('Already leaving party');
      }

      try {
        logger.info('Starting party leave sequence', {
          ...LOG_CONTEXT,
          action: 'leaveParty',
          metadata: {
            userId: currentUser.id,
            timestamp: new Date().toISOString(),
          },
        });

        setPartyState('leaving');

        // Ensure cleanup happens in correct order
        if (subscriptionRef.current) {
          // First untrack presence
          await cleanup();
          subscriptionRef.current = false;
          
          // Then clear local state
          localStorage.removeItem('currentUser');
          localStorage.removeItem('partyState');
          
          // Finally update component state
          if (mountedRef.current) {
            setCurrentUser(null);
            setPartyState('idle');
          }
        }

        logger.info('Successfully completed party leave sequence', {
          ...LOG_CONTEXT,
          action: 'leaveParty',
          metadata: {
            userId: currentUser.id,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        logger.error('Failed to leave party', {
          ...LOG_CONTEXT,
          action: 'leaveParty',
          metadata: { 
            error,
            userId: currentUser.id,
          },
        });
        // On error, still try to clean up user state
        if (mountedRef.current) {
          setPartyState('idle');
          setCurrentUser(null);
          localStorage.removeItem('currentUser');
          localStorage.removeItem('partyState');
        }
        throw error;
      }
    });
  }, [currentUser, partyState, cleanup]);

  const editProfile = useCallback(
    async (name: string, avatar: string, game: string) => {
      if (!currentUser) throw new Error('No user to edit');
      if (!subscriptionRef.current) throw new Error('Not subscribed to party');

      try {
        // Update local state
        const updatedUser = {
          ...currentUser,
          name,
          avatar,
          game,
          last_seen: new Date().toISOString(),
        };

        // Update presence state
        await initializePresence(updatedUser);

        // Update local storage and state
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));
        if (mountedRef.current) {
          setCurrentUser(updatedUser);
        }

        logger.info('Successfully updated profile', {
          ...LOG_CONTEXT,
          action: 'editProfile',
          metadata: { 
            userId: currentUser.id,
            updates: { name, avatar, game }
          },
        });
      } catch (error) {
        logger.error('Failed to update profile', {
          ...LOG_CONTEXT,
          action: 'editProfile',
          metadata: { 
            error,
            userId: currentUser.id,
          },
        });
        throw error;
      }
    },
    [currentUser, initializePresence]
  );

  return useMemo(
    () => ({
      currentUser,
      members: presenceMembers,
      partyState,
      joinParty,
      leaveParty,
      editProfile,
    }),
    [currentUser, presenceMembers, partyState, joinParty, leaveParty, editProfile]
  );
}
