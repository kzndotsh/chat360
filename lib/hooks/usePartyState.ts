import { useState, useEffect, useCallback, useRef } from 'react';
import { PartyMember } from '@/types';
import { useVoiceChat } from './useVoiceChat';
import { supabase } from '@/lib/supabase';
import logger from '@/lib/utils/logger';

export function usePartyState() {
  const logPrefix = '[PartyState]';

  const [members, setMembers] = useState<PartyMember[]>([]);
  const [currentUser, setCurrentUser] = useState<PartyMember | null>(null);
  const [storedUser, setStoredUser] = useState<PartyMember | null>(null);
  const [localMuted, setLocalMuted] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const {
    isJoined,
    isMuted,
    volumeLevel,
    currentUid,
    joinRoom,
    leaveRoom,
    toggleMute: toggleVoiceMute,
  } = useVoiceChat();

  const initialized = useRef(false);
  const voiceChatInitialized = useRef(false);
  const isLeavingRef = useRef(false);
  const joinInProgressRef = useRef(false);

  // Subscribe to realtime changes
  useEffect(() => {
    logger.debug(`${logPrefix} Subscribing to realtime changes`);
    const channel = supabase
      .channel('party_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'party_members',
        },
        async (payload) => {
          logger.debug(
            `${logPrefix} Realtime change detected: ${JSON.stringify(payload)}`,
          );
          try {
            // Fetch latest active members
            const { data: members, error } = await supabase
              .from('party_members')
              .select('*')
              .eq('is_active', true)
              .order('created_at', { ascending: true });

            if (error) throw error;

            if (members) {
              setMembers(
                members.map((m) => ({
                  id: m.id,
                  name: m.name,
                  game: m.game,
                  muted: m.muted,
                  avatar: m.avatar,
                  isActive: m.is_active,
                })),
              );
              logger.debug(
                `${logPrefix} Members updated: ${JSON.stringify(members)}`,
              );
            }
          } catch (error) {
            logger.error(`${logPrefix} Failed to fetch members: ${error}`);
          }
        },
      )
      .subscribe();

    return () => {
      logger.debug(`${logPrefix} Unsubscribing from realtime changes`);
      supabase.removeChannel(channel);
    };
  }, []);

  // Handle voice chat connection state
  useEffect(() => {
    logger.debug(
      `${logPrefix} Voice chat connection state changed: isJoined=${isJoined}`,
    );
    setIsConnected(isJoined && voiceChatInitialized.current);
  }, [isJoined]);

  // Handle voice chat mute state changes
  useEffect(() => {
    if (currentUser?.id && typeof isMuted === 'boolean' && isJoined) {
      logger.debug(
        `${logPrefix} Voice chat mute state changed: isMuted=${isMuted}`,
      );
      setLocalMuted(isMuted);
      setCurrentUser((prev) => (prev ? { ...prev, muted: isMuted } : null));

      // Update mute state in database
      supabase
        .from('party_members')
        .update({ muted: isMuted })
        .eq('id', currentUser.id)
        .then(({ error }) => {
          if (error) {
            logger.error(`${logPrefix} Failed to update mute state: ${error}`);
          }
        });
    }
  }, [isMuted, currentUser?.id, isJoined]);

  const updateMemberState = useCallback(
    async (member: PartyMember) => {
      if (!member) return;

      logger.debug(`${logPrefix} Updating member state for: ${member.name}`);

      try {
        // First, if member is becoming inactive, clear their agora_uid
        if (!member.isActive) {
          const { error: clearError } = await supabase
            .from('party_members')
            .update({ agora_uid: null, is_active: false })
            .eq('id', member.id);

          if (clearError) throw clearError;
        }

        // Then update the member state
        const { error: updateError } = await supabase
          .from('party_members')
          .upsert({
            id: member.id,
            name: member.name,
            avatar: member.avatar,
            game: member.game,
            muted: member.muted,
            is_active: member.isActive,
            agora_uid: member.isActive ? currentUid : null,
            last_seen: new Date().toISOString(),
          });

        if (updateError) throw updateError;

        setCurrentUser(member);
        setStoredUser(member);
        localStorage.setItem('currentUser', JSON.stringify(member));
        logger.debug(
          `${logPrefix} Member state updated: ${JSON.stringify(member)}`,
        );
      } catch (error) {
        logger.error(`${logPrefix} Failed to update member state: ${error}`);
        throw error;
      }
    },
    [currentUid],
  );

  const joinParty = useCallback(
    async (username: string, avatar: string, status: string) => {
      if (joinInProgressRef.current) {
        logger.debug(`${logPrefix} Join already in progress`);
        return;
      }

      joinInProgressRef.current = true;

      try {
        logger.debug(`${logPrefix} Attempting to join party: ${username}`);

        // Initialize voice chat first to get the agora_uid
        try {
          logger.debug(`${logPrefix} Initializing voice chat`);
          await joinRoom();
          voiceChatInitialized.current = true;
        } catch (error) {
          logger.error(
            `${logPrefix} Voice chat initialization failed: ${error}`,
          );
          throw error;
        }

        // Create or update member with the new agora_uid
        const newMember: PartyMember = storedUser
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

        // Update member state with the current agora_uid
        await updateMemberState(newMember);

        // Update members state
        setMembers((prevMembers) => [
          ...prevMembers.filter((m) => m.id !== newMember.id),
          newMember,
        ]);
        logger.debug(`${logPrefix} Joined party: ${JSON.stringify(newMember)}`);
      } catch (error) {
        logger.error(`${logPrefix} Failed to join party: ${error}`);
        // Cleanup on failure
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
      logger.debug(
        `${logPrefix} Profile edited: ${JSON.stringify(updatedUser)}`,
      );
    },
    [currentUser, updateMemberState],
  );

  const toggleMute = async (id: string) => {
    if (currentUser?.id !== id) return;

    if (!voiceChatInitialized.current || !isJoined) {
      logger.warn(
        `${logPrefix} Cannot toggle mute - Voice chat not initialized`,
      );
      return;
    }

    try {
      logger.debug(`${logPrefix} Toggling mute for user: ${id}`);
      const newMuteState = toggleVoiceMute();

      if (typeof newMuteState !== 'boolean') {
        logger.warn(
          `${logPrefix} Invalid mute state returned: ${newMuteState}`,
        );
        return;
      }

      const updatedUser = { ...currentUser, muted: newMuteState };
      await updateMemberState(updatedUser);
      logger.debug(`${logPrefix} Mute toggled: ${JSON.stringify(updatedUser)}`);
    } catch (error) {
      logger.error(`${logPrefix} Failed to toggle mute: ${error}`);
    }
  };

  const leaveParty = async () => {
    if (!currentUser?.isActive || isLeavingRef.current) {
      logger.debug(
        `${logPrefix} Leave party blocked - User not active or already leaving`,
      );
      return;
    }

    try {
      isLeavingRef.current = true;
      logger.debug(`${logPrefix} Leaving party: ${currentUser.name}`);

      // Reset voice chat state first
      voiceChatInitialized.current = false;
      await leaveRoom();

      // Then update user state
      const userToStore = { ...currentUser, isActive: false };
      await updateMemberState(userToStore);

      // Update members state
      setMembers((prevMembers) =>
        prevMembers.filter((m) => m.id !== currentUser.id),
      );
      logger.debug(`${logPrefix} Left party: ${currentUser.name}`);
    } catch (error) {
      logger.error(`${logPrefix} Failed to leave party: ${error}`);
      throw error;
    } finally {
      isLeavingRef.current = false;
    }
  };

  const initialize = useCallback(async () => {
    if (initialized.current) return;

    logger.debug(`${logPrefix} Initializing party state`);
    initialized.current = true;

    try {
      const stored = localStorage.getItem('currentUser');
      if (!stored) return;

      const user = JSON.parse(stored);
      setStoredUser(user);

      // Fetch initial members list
      const { data: members, error } = await supabase
        .from('party_members')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (members) {
        setMembers(
          members.map((m) => ({
            id: m.id,
            name: m.name,
            game: m.game,
            muted: m.muted,
            avatar: m.avatar,
            isActive: m.is_active,
          })),
        );
        logger.debug(
          `${logPrefix} Initial members fetched: ${JSON.stringify(members)}`,
        );
      }

      // If user was previously active, mark them as inactive
      if (user.isActive) {
        const userToStore = { ...user, isActive: false };
        await updateMemberState(userToStore);
      }
    } catch (error) {
      logger.error(`${logPrefix} Failed to initialize: ${error}`);
      throw error;
    }
  }, [updateMemberState]);

  return {
    members,
    currentUser,
    storedAvatar: storedUser?.avatar || null,
    isConnected,
    isMuted: localMuted,
    volumeLevel,
    toggleMute,
    joinParty,
    editProfile,
    leaveParty,
    initialize,
  };
}
