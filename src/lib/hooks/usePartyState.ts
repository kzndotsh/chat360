'use client';

import { useCallback, useEffect, useRef, useReducer, useMemo } from 'react';
import { usePresence } from './usePresence';
import { logger } from '../utils/logger';
import type { PartyMember } from '../types/party';

type PartyState = 'idle' | 'joining' | 'joined' | 'leaving';

const LOG_CONTEXT = {
  context: 'usePartyState',
  file: 'usePartyState.ts',
};

type PartyAction =
  | { type: 'INITIALIZE'; payload: { currentUser: PartyMember | null; partyState: PartyState } }
  | { type: 'START_JOIN'; payload: { userId: string } }
  | { type: 'JOIN_SUCCESS'; payload: { user: PartyMember } }
  | { type: 'JOIN_ERROR'; payload: { error: Error } }
  | { type: 'START_LEAVE' }
  | { type: 'LEAVE_SUCCESS' }
  | { type: 'LEAVE_ERROR'; payload: { error: Error } }
  | { type: 'UPDATE_PROFILE'; payload: { user: PartyMember } }
  | { type: 'UPDATE_MEMBERS'; payload: { members: PartyMember[] } };

interface PartyStateType {
  currentUser: PartyMember | null;
  members: PartyMember[];
  partyState: PartyState;
  error: Error | null;
  lastUpdate: number;
}

const initialState: PartyStateType = {
  currentUser: null,
  members: [],
  partyState: 'idle',
  error: null,
  lastUpdate: Date.now(),
};

function partyReducer(state: PartyStateType, action: PartyAction): PartyStateType {
  let updatedUser: PartyMember;
  let currentMemberInUpdate: PartyMember | undefined;
  let updatedMembers: PartyMember[];

  switch (action.type) {
    case 'INITIALIZE':
      return {
        ...state,
        currentUser: action.payload.currentUser,
        partyState: action.payload.partyState,
        lastUpdate: Date.now(),
      };

    case 'START_JOIN':
      return {
        ...state,
        partyState: 'joining',
        error: null,
        lastUpdate: Date.now(),
      };

    case 'JOIN_SUCCESS':
      return {
        ...state,
        currentUser: action.payload.user,
        partyState: 'joined',
        error: null,
        lastUpdate: Date.now(),
      };

    case 'JOIN_ERROR':
      return {
        ...state,
        partyState: 'idle',
        error: action.payload.error,
        lastUpdate: Date.now(),
      };

    case 'START_LEAVE':
      return {
        ...state,
        partyState: 'leaving',
        lastUpdate: Date.now(),
      };

    case 'LEAVE_SUCCESS':
      return {
        ...state,
        currentUser: null,
        members: [],
        partyState: 'idle',
        error: null,
        lastUpdate: Date.now(),
      };

    case 'LEAVE_ERROR':
      return {
        ...state,
        error: action.payload.error,
        lastUpdate: Date.now(),
      };

    case 'UPDATE_PROFILE':
      updatedUser = {
        ...action.payload.user,
        // Preserve voice state and ensure defaults
        voice_status: state.currentUser?.voice_status || 'silent',
        muted: state.currentUser?.muted || false,
        deafened_users: state.currentUser?.deafened_users || [],
        agora_uid: state.currentUser?.agora_uid,
        _lastUpdate: Date.now(),
      };

      // Log voice state preservation
      logger.debug('Preserving voice state in profile update', {
        ...LOG_CONTEXT,
        action: 'UPDATE_PROFILE',
        metadata: {
          oldState: {
            voice_status: state.currentUser?.voice_status,
            muted: state.currentUser?.muted,
          },
          newState: {
            voice_status: updatedUser.voice_status,
            muted: updatedUser.muted,
          },
        },
      });

      return {
        ...state,
        currentUser: updatedUser,
        // Also update the user in the members list
        members: state.members.map((member) =>
          member.id === updatedUser.id ? updatedUser : member
        ),
        lastUpdate: Date.now(),
      };

    case 'UPDATE_MEMBERS':
      // First, get the current member's state
      currentMemberInUpdate = action.payload.members.find((m) => m.id === state.currentUser?.id);

      // Update members with voice state preserved
      updatedMembers = action.payload.members.map((member) => {
        const existingMember = state.members.find((m) => m.id === member.id);
        const isCurrentUser = member.id === state.currentUser?.id;

        return {
          ...member,
          // For current user, preserve our local voice state
          ...(isCurrentUser
            ? {
                ...state.currentUser,
                name: member.name,
                avatar: member.avatar,
                game: member.game,
                last_seen: member.last_seen,
                is_active: member.is_active,
              }
            : {
                // For other members, preserve their existing voice state if any
                voice_status: existingMember?.voice_status || member.voice_status || 'silent',
                muted: existingMember?.muted ?? member.muted ?? false,
                deafened_users: existingMember?.deafened_users || member.deafened_users || [],
              }),
          _lastUpdate: Date.now(),
        };
      });

      return {
        ...state,
        members: updatedMembers,
        // Only update current user if it exists in the update and preserve voice state
        currentUser: currentMemberInUpdate
          ? {
              ...state.currentUser!,
              name: currentMemberInUpdate.name,
              avatar: currentMemberInUpdate.avatar,
              game: currentMemberInUpdate.game,
              last_seen: currentMemberInUpdate.last_seen,
              is_active: currentMemberInUpdate.is_active,
              _lastUpdate: Date.now(),
            }
          : state.currentUser,
        lastUpdate: Date.now(),
      };

    default:
      return state;
  }
}

export function usePartyState() {
  const [state, dispatch] = useReducer(partyReducer, initialState);

  // Refs
  const mountedRef = useRef(true);
  const initializingRef = useRef(false);
  const joinInProgress = useRef(false);
  const subscriptionRef = useRef<boolean>(false);

  const {
    members: presenceMembers,
    initialize: initializePresence,
    cleanup,
    updatePresence,
  } = usePresence();

  // Initialize state from localStorage
  useEffect(() => {
    if (typeof window === 'undefined' || initializingRef.current) return;

    initializingRef.current = true;
    const savedUser = localStorage.getItem('currentUser');
    const savedState = (localStorage.getItem('partyState') as PartyState) || 'idle';

    dispatch({
      type: 'INITIALIZE',
      payload: {
        currentUser: savedUser ? JSON.parse(savedUser) : null,
        partyState: savedState,
      },
    });
  }, []);

  // Sync presence members
  useEffect(() => {
    if (!presenceMembers) return;

    logger.debug('Syncing presence members', {
      ...LOG_CONTEXT,
      action: 'syncMembers',
      metadata: {
        memberCount: presenceMembers.length,
        memberIds: presenceMembers.map((m) => m.id),
        currentUserId: state.currentUser?.id,
      },
    });

    dispatch({
      type: 'UPDATE_MEMBERS',
      payload: {
        members: presenceMembers.map((member) => ({
          ...member,
          _lastUpdate: Date.now(),
        })),
      },
    });
  }, [presenceMembers, state.currentUser?.id]);

  // Update local storage when state changes
  useEffect(() => {
    if (state.currentUser) {
      localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
      localStorage.setItem('partyState', state.partyState);
    }
  }, [state.currentUser, state.partyState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (subscriptionRef.current) {
        void cleanup().catch((err) => {
          logger.error('Failed to cleanup on unmount', {
            ...LOG_CONTEXT,
            action: 'cleanup',
            metadata: { error: err },
          });
        });
      }
    };
  }, [cleanup]);

  const joinParty = useCallback(
    async (name: string, game: string, avatar: string) => {
      if (joinInProgress.current) return;
      joinInProgress.current = true;

      try {
        dispatch({ type: 'START_JOIN', payload: { userId: crypto.randomUUID() } });

        const user: PartyMember = {
          id: crypto.randomUUID(),
          name,
          game,
          avatar,
          is_active: true,
          created_at: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          voice_status: 'silent',
          muted: false,
          deafened_users: [],
          _lastUpdate: Date.now(),
        };

        localStorage.setItem('currentUser', JSON.stringify(user));
        localStorage.setItem('partyState', 'joining');

        await initializePresence(user);
        subscriptionRef.current = true;

        if (mountedRef.current) {
          dispatch({ type: 'JOIN_SUCCESS', payload: { user } });
        }

        logger.info('Successfully joined party', {
          ...LOG_CONTEXT,
          action: 'joinParty',
          metadata: {
            memberId: user.id,
            voiceState: {
              voice_status: user.voice_status,
              muted: user.muted,
            },
          },
        });

        return user.id;
      } catch (error) {
        dispatch({ type: 'JOIN_ERROR', payload: { error: error as Error } });
        logger.error('Failed to join party', {
          ...LOG_CONTEXT,
          action: 'joinParty',
          metadata: { error },
        });
        throw error;
      } finally {
        joinInProgress.current = false;
      }
    },
    [initializePresence]
  );

  const leaveParty = useCallback(async () => {
    if (!state.currentUser) return;

    try {
      dispatch({ type: 'START_LEAVE' });

      await cleanup();
      subscriptionRef.current = false;

      localStorage.removeItem('currentUser');
      localStorage.setItem('partyState', 'idle');

      if (mountedRef.current) {
        dispatch({ type: 'LEAVE_SUCCESS' });
      }

      logger.info('Successfully left party', {
        ...LOG_CONTEXT,
        action: 'leaveParty',
        metadata: { userId: state.currentUser.id },
      });
    } catch (error) {
      dispatch({ type: 'LEAVE_ERROR', payload: { error: error as Error } });
      logger.error('Failed to leave party', {
        ...LOG_CONTEXT,
        action: 'leaveParty',
        metadata: { error, userId: state.currentUser.id },
      });
      throw error;
    }
  }, [cleanup, state.currentUser]);

  const editProfile = useCallback(
    async (name: string, avatar: string, game: string) => {
      if (!state.currentUser) throw new Error('No user to edit');
      if (!subscriptionRef.current) throw new Error('Not subscribed to party');

      try {
        // Log current state before update
        logger.debug('Starting profile update', {
          ...LOG_CONTEXT,
          action: 'editProfile',
          metadata: {
            currentState: {
              ...state.currentUser,
              voice_status: state.currentUser.voice_status,
              muted: state.currentUser.muted,
              deafened_users: state.currentUser.deafened_users,
            },
            updates: { name, avatar, game },
          },
        });

        // Create updated user with preserved voice state
        const updatedUser: PartyMember = {
          ...state.currentUser,
          name,
          avatar,
          game,
          last_seen: new Date().toISOString(),
          // Explicitly preserve voice state
          voice_status: state.currentUser.voice_status || 'silent',
          muted: state.currentUser.muted || false,
          deafened_users: state.currentUser.deafened_users || [],
          agora_uid: state.currentUser.agora_uid,
          _lastUpdate: Date.now(),
        };

        // Update local state first
        dispatch({ type: 'UPDATE_PROFILE', payload: { user: updatedUser } });
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));

        // Log state after local update but before presence update
        logger.debug('Profile updated locally, updating presence', {
          ...LOG_CONTEXT,
          action: 'editProfile',
          metadata: {
            updatedUser,
            voiceState: {
              voice_status: updatedUser.voice_status,
              muted: updatedUser.muted,
              deafened_users: updatedUser.deafened_users,
            },
          },
        });

        // Update presence with complete state
        await updatePresence({
          id: updatedUser.id,
          name: updatedUser.name,
          avatar: updatedUser.avatar,
          game: updatedUser.game,
          online_at: updatedUser.last_seen,
          // Use the preserved voice state
          voice_status: updatedUser.voice_status,
          muted: updatedUser.muted,
          agora_uid: updatedUser.agora_uid?.toString(),
          deafened_users: updatedUser.deafened_users,
          _lastUpdate: updatedUser._lastUpdate,
        });

        logger.info('Successfully updated profile', {
          ...LOG_CONTEXT,
          action: 'editProfile',
          metadata: {
            userId: updatedUser.id,
            updates: { name, avatar, game },
            voiceState: {
              voice_status: updatedUser.voice_status,
              muted: updatedUser.muted,
              deafened_users: updatedUser.deafened_users,
            },
            finalState: updatedUser,
          },
        });
      } catch (error) {
        // Revert local changes on error
        if (mountedRef.current) {
          localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
          dispatch({ type: 'UPDATE_PROFILE', payload: { user: state.currentUser } });
        }

        logger.error('Failed to update profile', {
          ...LOG_CONTEXT,
          action: 'editProfile',
          metadata: {
            error,
            userId: state.currentUser.id,
            currentState: state.currentUser,
            attemptedUpdates: { name, avatar, game },
          },
        });
        throw error;
      }
    },
    [state.currentUser, updatePresence]
  );

  return useMemo(
    () => ({
      currentUser: state.currentUser,
      members: state.members,
      partyState: state.partyState,
      error: state.error,
      joinParty,
      leaveParty,
      editProfile,
    }),
    [
      state.currentUser,
      state.members,
      state.partyState,
      state.error,
      joinParty,
      leaveParty,
      editProfile,
    ]
  );
}
