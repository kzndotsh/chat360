"use client";

import { useCallback, useRef, useEffect, useReducer } from 'react';
import { RealtimeChannel } from '@supabase/realtime-js';
import { logger } from '@/lib/utils/logger';
import type { PartyMember, PresenceMemberState, VoiceStatus } from '@/lib/types/party';
import { getGlobalPresenceChannel } from '@/lib/api/supabase';
import { Mutex } from 'async-mutex';

const LOG_CONTEXT = { component: 'usePresence' };

type PresenceState = {
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
  members: PartyMember[];
  currentMember: PartyMember | null;
  error: Error | null;
  lastUpdate: number;
};

type PresenceAction = 
  | { type: 'CONNECT' }
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECT' }
  | { type: 'UPDATE_PROFILE'; payload: Partial<PartyMember> }
  | { type: 'UPDATE_STATUS'; payload: { voice_status?: string; muted?: boolean } }
  | { type: 'SET_MEMBERS'; payload: PartyMember[] }
  | { type: 'SET_ERROR'; payload: Error };

function presenceReducer(state: PresenceState, action: PresenceAction): PresenceState {
  switch (action.type) {
    case 'CONNECT':
      return {
        ...state,
        status: 'connecting',
        error: null
      };
    case 'CONNECTED':
      return {
        ...state,
        status: 'connected',
        error: null
      };
    case 'DISCONNECT':
      return {
        ...state,
        status: 'disconnected',
        members: [],
        currentMember: null
      };
    case 'UPDATE_PROFILE': {
      if (!state.currentMember) return state;
      const updatedMember: PartyMember = {
        ...state.currentMember,
        ...action.payload,
        voice_status: action.payload.voice_status as VoiceStatus || state.currentMember.voice_status,
        _lastUpdate: Date.now()
      };
      return {
        ...state,
        currentMember: updatedMember,
        members: state.members.map(m => 
          m.id === updatedMember.id ? updatedMember : m
        ),
        lastUpdate: Date.now()
      };
    }
    case 'UPDATE_STATUS': {
      if (!state.currentMember) return state;
      const updatedMember: PartyMember = {
        ...state.currentMember,
        voice_status: action.payload.voice_status as VoiceStatus || state.currentMember.voice_status,
        muted: action.payload.muted ?? state.currentMember.muted,
        _lastUpdate: Date.now()
      };
      return {
        ...state,
        currentMember: updatedMember,
        members: state.members.map(m => 
          m.id === updatedMember.id ? updatedMember : m
        ),
        lastUpdate: Date.now()
      };
    }
    case 'SET_MEMBERS': {
      // When setting members from presence sync, preserve current member's profile data
      const newMembers = action.payload.map(member => {
        if (state.currentMember && member.id === state.currentMember.id) {
          // Keep profile fields from current member, but take presence/status fields from sync
          return {
            ...state.currentMember,
            voice_status: member.voice_status,
            muted: member.muted,
            deafened_users: member.deafened_users,
            is_active: member.is_active,
            last_seen: member.last_seen,
            _lastUpdate: Date.now()
          };
        }
        return {
          ...member,
          _lastUpdate: Date.now()
        };
      });

      // Update current member if it exists in new members
      const updatedCurrentMember = state.currentMember ? 
        newMembers.find(m => m.id === state.currentMember?.id) || state.currentMember : 
        null;

      logger.debug('Setting members', {
        ...LOG_CONTEXT,
        action: 'SET_MEMBERS',
        metadata: {
          memberCount: newMembers.length,
          memberIds: newMembers.map(m => m.id),
          currentMemberId: updatedCurrentMember?.id
        }
      });

      return {
        ...state,
        members: newMembers,
        currentMember: updatedCurrentMember,
        lastUpdate: Date.now()
      };
    }
    case 'SET_ERROR':
      return {
        ...state,
        status: 'error',
        error: action.payload
      };
    default:
      return state;
  }
}

function convertPresenceToMembers(state: Record<string, PresenceMemberState[]>): PartyMember[] {
  const memberMap = new Map<string, PartyMember>();
  const currentTime = new Date().toISOString();

  Object.values(state)
    .flat()
    .forEach((presence: PresenceMemberState) => {
      if (!presence.id) return;

      // Get existing member if available to preserve fields
      const existingMember = memberMap.get(presence.id);

      const member: PartyMember = {
        id: presence.id,
        name: presence.name || existingMember?.name || '',
        avatar: presence.avatar || existingMember?.avatar || '',
        game: presence.game || existingMember?.game || '',
        is_active: true,
        created_at: existingMember?.created_at || currentTime,
        last_seen: presence.online_at || currentTime,
        voice_status: (presence.voice_status as VoiceStatus) || existingMember?.voice_status || 'silent',
        muted: presence.muted ?? existingMember?.muted ?? false,
        _lastUpdate: presence._lastUpdate || Date.now(),
        deafened_users: presence.deafened_users || existingMember?.deafened_users || [],
        agora_uid: presence.agora_uid ? Number(presence.agora_uid) : existingMember?.agora_uid,
      };

      memberMap.set(member.id, member);
    });

  return Array.from(memberMap.values());
}

export function usePresence() {
  const [state, dispatch] = useReducer(presenceReducer, {
    status: 'idle',
    members: [],
    currentMember: null,
    error: null,
    lastUpdate: Date.now()
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const mountedRef = useRef(true);
  const subscriptionMutex = useRef<Mutex>(new Mutex());

  // Keep a ref to the latest state to avoid stale closures
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const updatePresence = useCallback(async (presence: PresenceMemberState) => {
    if (!channelRef.current) {
      logger.error('No channel available for presence update', {
        ...LOG_CONTEXT,
        action: 'updatePresence',
        metadata: { presence }
      });
      throw new Error('No channel available');
    }

    try {
      // Log the current state before update
      logger.debug('Updating presence with voice state', {
        ...LOG_CONTEXT,
        action: 'updatePresence',
        metadata: {
          currentState: stateRef.current.currentMember,
          newPresence: presence,
          voiceStateChanges: {
            oldStatus: stateRef.current.currentMember?.voice_status,
            newStatus: presence.voice_status,
            oldMuted: stateRef.current.currentMember?.muted,
            newMuted: presence.muted
          }
        }
      });

      // Add timeout for presence tracking
      const trackPromise = channelRef.current.track(presence);
      const timeoutPromise = new Promise<'ok'>((resolve, reject) => {
        setTimeout(() => reject(new Error('Presence update timeout')), 5000);
      });

      await Promise.race([trackPromise, timeoutPromise]);

      // Update local state immediately after successful presence update
      dispatch({ 
        type: 'UPDATE_STATUS', 
        payload: { 
          voice_status: presence.voice_status,
          muted: presence.muted
        } 
      });

      // Log successful update with final state
      logger.info('Successfully updated presence with voice state', {
        ...LOG_CONTEXT,
        action: 'updatePresence',
        metadata: { 
          presence,
          finalState: {
            voice_status: stateRef.current.currentMember?.voice_status,
            muted: stateRef.current.currentMember?.muted
          }
        }
      });
    } catch (error) {
      logger.error('Failed to update presence', {
        ...LOG_CONTEXT,
        action: 'updatePresence',
        metadata: { 
          error,
          presence,
          currentState: stateRef.current.currentMember
        }
      });
      throw error;
    }
  }, []);

  const initialize = useCallback(async (member: PartyMember) => {
    if (state.status === 'connecting') return;
    
    dispatch({ type: 'CONNECT' });

    try {
      // Add timeout for channel initialization
      const channelPromise = getGlobalPresenceChannel();
      const timeoutPromise = new Promise<RealtimeChannel>((resolve, reject) => {
        setTimeout(() => reject(new Error('Channel initialization timeout')), 5000);
      });

      const channel = await Promise.race([channelPromise, timeoutPromise]);
      if (!channel) throw new Error('Failed to get presence channel');

      channelRef.current = channel;

      // Set up handlers with error boundaries
      try {
        // Set current member first
        dispatch({ type: 'UPDATE_PROFILE', payload: member });

        // Track initial presence
        await updatePresence({
          id: member.id,
          name: member.name,
          avatar: member.avatar,
          game: member.game,
          muted: member.muted,
          voice_status: 'silent',
          online_at: new Date().toISOString(),
          _lastUpdate: Date.now()
        });

        // Get initial state
        const initialState = channel.presenceState<PresenceMemberState>();
        if (initialState) {
          const initialMembers = convertPresenceToMembers(initialState);
          dispatch({ type: 'SET_MEMBERS', payload: initialMembers });
        }

        channel
          .on('presence', { event: 'sync' }, () => {
            if (!mountedRef.current) return;
            
            const state = channel.presenceState<PresenceMemberState>();
            if (!state) return;

            const newMembers = convertPresenceToMembers(state);
            dispatch({ type: 'SET_MEMBERS', payload: newMembers });
          })
          .on('presence', { event: 'join' }, () => {
            if (!mountedRef.current) return;
            
            const state = channel.presenceState<PresenceMemberState>();
            if (!state) return;

            const newMembers = convertPresenceToMembers(state);
            dispatch({ type: 'SET_MEMBERS', payload: newMembers });
          })
          .on('presence', { event: 'leave' }, () => {
            if (!mountedRef.current) return;
            
            const state = channel.presenceState<PresenceMemberState>();
            if (!state) return;

            const newMembers = convertPresenceToMembers(state);
            dispatch({ type: 'SET_MEMBERS', payload: newMembers });
          });

        dispatch({ type: 'CONNECTED' });

      } catch (error) {
        logger.error('Failed to set up presence handlers', {
          ...LOG_CONTEXT,
          action: 'initialize',
          metadata: { error }
        });
        throw error;
      }

    } catch (error) {
      logger.error('Failed to initialize presence', {
        ...LOG_CONTEXT,
        action: 'initialize',
        metadata: { error }
      });
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error : new Error(String(error)) });
    }
  }, [state.status, updatePresence]);

  const cleanup = useCallback(async () => {
    const release = await subscriptionMutex.current.acquire();
    try {
      if (!mountedRef.current) return;

      if (channelRef.current) {
        await channelRef.current.untrack();
        
        const channel = await getGlobalPresenceChannel();
        if (channelRef.current !== channel) {
          await channelRef.current.unsubscribe();
        }
        
        channelRef.current = null;
      }

      dispatch({ type: 'DISCONNECT' });

    } catch (error) {
      logger.error('Error during cleanup', {
        ...LOG_CONTEXT,
        action: 'cleanup',
        metadata: { error }
      });
    } finally {
      release();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      void cleanup();
    };
  }, [cleanup]);

  // Add new function to get members without joining
  const getMembers = useCallback(async () => {
    try {
      // Add timeout for channel initialization
      const channelPromise = getGlobalPresenceChannel();
      const timeoutPromise = new Promise<RealtimeChannel>((resolve, reject) => {
        setTimeout(() => reject(new Error('Channel initialization timeout')), 5000);
      });

      const channel = await Promise.race([channelPromise, timeoutPromise]);
      if (!channel) throw new Error('Failed to get presence channel');

      const state = channel.presenceState<PresenceMemberState>();
      if (!state) return [];

      return convertPresenceToMembers(state);
    } catch (error) {
      logger.error('Failed to get members', {
        ...LOG_CONTEXT,
        action: 'getMembers',
        metadata: { error }
      });
      return [];
    }
  }, []);

  return {
    status: state.status,
    members: state.members,
    currentMember: state.currentMember,
    error: state.error,
    initialize,
    cleanup,
    updatePresence,
    getMembers
  };
}
