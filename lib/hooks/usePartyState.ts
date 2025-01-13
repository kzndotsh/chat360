import { useState, useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { PartyMember } from '@/types';
import { useVoiceChat } from './useVoiceChat';
import { supabase } from '@/lib/supabase';
import { logWithContext } from '@/lib/logger';

export function usePartyState() {
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [currentUser, setCurrentUser] = useState<PartyMember | null>(null);
  const [storedUser, setStoredUser] = useState<PartyMember | null>(null);
  const [localMuted, setLocalMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const {
    isJoined,
    isMuted,
    currentUid,
    joinRoom,
    leaveRoom,
    toggleMute: toggleVoiceMute,
  } = useVoiceChat();

  const initialized = useRef(false);
  const voiceChatInitialized = useRef(false);
  const isLeavingRef = useRef(false);
  const joinInProgressRef = useRef(false);

  useEffect(() => {
    const channel = supabase
      .channel('party_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_members' },
        async () => {
          try {
            const { data: members, error } = await supabase
              .from('party_members')
              .select('*')
              .eq('is_active', true)
              .order('created_at', { ascending: true });

            if (error) throw error;

            if (members) {
              setMembers(members.map(mapMember));
              logWithContext(
                'usePartyState.ts',
                'useEffect',
                `Updated Members: ${JSON.stringify(members)}`,
              );
            }
          } catch (error) {
            console.error('Error fetching members:', error);
            Sentry.captureException(error);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    setIsConnected(isJoined && voiceChatInitialized.current);
  }, [isJoined]);

  useEffect(() => {
    if (currentUser?.id && typeof isMuted === 'boolean' && isJoined) {
      setLocalMuted(isMuted);
      updateMuteState(isMuted, currentUser.id);
    }
  }, [isMuted, currentUser?.id, isJoined]);

  const mapMember = (m: any): PartyMember => ({
    id: m.id,
    name: m.name,
    game: m.game,
    muted: m.muted,
    avatar: m.avatar,
    isActive: m.is_active,
  });

  const updateMuteState = async (muted: boolean, id: string) => {
    try {
      await supabase.from('party_members').update({ muted }).eq('id', id);
      logWithContext(
        'usePartyState.ts',
        'updateMuteState',
        `Updated mute state for ID ${id} to ${muted}`,
      );
    } catch (error) {
      console.error('Error updating mute state:', error);
      Sentry.captureException(error);
    }
  };

  const updateMemberState = useCallback(
    async (member: PartyMember) => {
      if (!member) return;

      try {
        if (!member.isActive) {
          await supabase
            .from('party_members')
            .update({ agora_uid: null, is_active: false })
            .eq('id', member.id);
        }

        await supabase.from('party_members').upsert({
          id: member.id,
          name: member.name,
          avatar: member.avatar,
          game: member.game,
          muted: member.muted,
          is_active: member.isActive,
          agora_uid: member.isActive ? currentUid : null,
          last_seen: new Date().toISOString(),
        });

        setCurrentUser(member);
        setStoredUser(member);
        localStorage.setItem('currentUser', JSON.stringify(member));
        logWithContext(
          'usePartyState.ts',
          'updateMemberState',
          `Member state updated: ${JSON.stringify(member)}`,
        );
      } catch (error) {
        console.error('Error updating member state:', error);
        Sentry.captureException(error);
        throw error;
      }
    },
    [currentUid],
  );

  const joinParty = useCallback(
    async (username: string, avatar: string, status: string) => {
      if (joinInProgressRef.current) return;

      joinInProgressRef.current = true;

      try {
        await joinRoom();
        voiceChatInitialized.current = true;

        const newMember = storedUser
          ? {
              ...storedUser,
              name: username,
              avatar,
              game: status,
              isActive: true,
              muted: false,
            }
          : {
              id: crypto.randomUUID(),
              name: username,
              game: status,
              muted: false,
              avatar,
              isActive: true,
            };

        await updateMemberState(newMember);
        setMembers((prev) => [
          ...prev.filter((m) => m.id !== newMember.id),
          newMember,
        ]);
        logWithContext(
          'usePartyState.ts',
          'joinParty',
          `Joined party: ${JSON.stringify(newMember)}`,
        );
      } catch (error) {
        console.error('Error joining party:', error);
        Sentry.captureException(error);
        if (voiceChatInitialized.current) {
          await leaveRoom();
          voiceChatInitialized.current = false;
        }
        throw error;
      } finally {
        joinInProgressRef.current = false;
      }
    },
    [storedUser, joinRoom, leaveRoom, updateMemberState],
  );

  const editProfile = useCallback(
    async (username: string, avatar: string, status: string) => {
      if (!currentUser) return;

      const updatedUser = {
        ...currentUser,
        name: username,
        avatar,
        game: status,
      };
      await updateMemberState(updatedUser);
      logWithContext(
        'usePartyState.ts',
        'editProfile',
        `Profile edited: ${JSON.stringify(updatedUser)}`,
      );
    },
    [currentUser, updateMemberState],
  );

  const toggleMute = async (id: string) => {
    if (currentUser?.id !== id || !voiceChatInitialized.current || !isJoined)
      return;

    try {
      toggleVoiceMute();
      const newMutedState = !currentUser.muted;
      await updateMemberState({ ...currentUser, muted: newMutedState });

      setCurrentUser((prev) =>
        prev ? { ...prev, muted: newMutedState } : prev,
      );
      logWithContext(
        'usePartyState.ts',
        'toggleMute',
        `Mute toggled for ${currentUser.name}: ${newMutedState}`,
      );
    } catch (error) {
      console.error('Error toggling mute:', error);
      Sentry.captureException(error);
    }
  };

  const leaveParty = async () => {
    if (!currentUser?.isActive || isLeavingRef.current) return;

    try {
      isLeavingRef.current = true;
      voiceChatInitialized.current = false;
      await leaveRoom();

      const userToStore = { ...currentUser, isActive: false };
      await updateMemberState(userToStore);

      setMembers((prev) => prev.filter((m) => m.id !== currentUser.id));
      logWithContext(
        'usePartyState.ts',
        'leaveParty',
        `Left party: ${JSON.stringify(userToStore)}`,
      );
    } catch (error) {
      console.error('Error leaving party:', error);
      Sentry.captureException(error);
      throw error;
    } finally {
      isLeavingRef.current = false;
    }
  };

  const initialize = useCallback(async () => {
    if (initialized.current) return;

    initialized.current = true;

    try {
      const stored = localStorage.getItem('currentUser');
      if (stored) {
        const user = JSON.parse(stored);
        setStoredUser(user);

        const { data: members, error } = await supabase
          .from('party_members')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (members) {
          setMembers(members.map(mapMember));
        }

        if (user.isActive) {
          await updateMemberState({ ...user, isActive: false });
        }
      }
    } catch (error) {
      console.error('Error during initialization:', error);
      Sentry.captureException(error);
      throw error;
    }
  }, [updateMemberState]);

  return {
    members,
    currentUser,
    storedAvatar: storedUser?.avatar || null,
    isConnected,
    isMuted: localMuted,
    toggleMute,
    joinParty,
    editProfile,
    leaveParty,
    initialize,
  };
}
