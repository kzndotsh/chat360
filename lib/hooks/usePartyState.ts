import { useState, useEffect, useCallback, useRef } from 'react';
import { PartyMember } from '@/types';
import { useVoiceChat } from './useVoiceChat';
import { useDebounce } from './useDebounce';

export function usePartyState() {
  const logPrefix = '[PartyState]';

  const [members, setMembers] = useState<PartyMember[]>([]);
  const [currentUser, setCurrentUser] = useState<PartyMember | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const {
    isJoined,
    isMuted,
    volumeLevel,
    joinRoom,
    leaveRoom,
    toggleMute: toggleVoiceMute
  } = useVoiceChat();

  const [storedUser, setStoredUser] = useState<PartyMember | null>(null);
  const [localMuted, setLocalMuted] = useState<boolean>(false);
  const initialized = useRef(false);
  const voiceChatInitialized = useRef(false);

  // Initialize state from localStorage
  useEffect(() => {
    if (initialized.current) return;
    console.log(`${logPrefix} Initializing party state`);
    initialized.current = true;

    const stored = localStorage.getItem('currentUser');
    try {
      if (stored) {
        console.log(`${logPrefix} Found stored user data`);
        const user = JSON.parse(stored);
        setStoredUser(user);
        // Always start as not active, requiring explicit join
        if (user.isActive) {
          console.log(`${logPrefix} Resetting stored user to inactive state`);
          const inactiveUser = { ...user, isActive: false };
          localStorage.setItem('currentUser', JSON.stringify(inactiveUser));
        }
      }
    } catch (error) {
      console.error(`${logPrefix} Failed to load stored user:`, error);
    }
  }, []);

  // Sync members list with current user
  useEffect(() => {
    if (currentUser) {
      console.log(`${logPrefix} Updating members list with current user:`, currentUser.name);
      setMembers([currentUser]);
    } else {
      console.log(`${logPrefix} Clearing members list - no current user`);
      setMembers([]);
    }
  }, [currentUser]);

  // Handle voice chat mute state changes
  useEffect(() => {
    if (currentUser?.id && typeof isMuted === 'boolean' && isJoined) {
      setLocalMuted(isMuted);
      setCurrentUser(prev => prev ? { ...prev, muted: isMuted } : null);
      setMembers(prevMembers => 
        prevMembers.map(member => 
          member.id === currentUser.id ? { ...member, muted: isMuted } : member
        )
      );
    }
  }, [isMuted, currentUser?.id, isJoined]);

  const updateMemberState = useCallback((member: PartyMember) => {
    console.log(`${logPrefix} Updating member state for:`, member.name);
    setCurrentUser(member);
    setStoredUser(member);
    localStorage.setItem('currentUser', JSON.stringify(member));
  }, []);

  const debouncedJoinParty = useDebounce(async (username: string, avatar: string, status: string) => {
    if (isProcessing) {
      console.log(`${logPrefix} Join operation in progress, skipping`);
      return;
    }

    try {
      setIsProcessing(true);
      console.log(`${logPrefix} Attempting to join party:`, username);
      const newMember: PartyMember = storedUser ? {
        ...storedUser,
        name: username,
        avatar,
        game: status,
        isActive: true,
        muted: false
      } : {
        id: String(Date.now()),
        name: username,
        game: status,
        muted: false,
        avatar,
        isActive: true
      };

      updateMemberState(newMember);
      
      // Initialize voice chat after member state is updated
      try {
        console.log(`${logPrefix} Initializing voice chat`);
        await joinRoom();
        voiceChatInitialized.current = true;
      } catch (error) {
        console.error(`${logPrefix} Voice chat initialization failed:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`${logPrefix} Failed to join party:`, error);
      // Revert member state if voice chat fails
      if (storedUser) {
        console.log(`${logPrefix} Reverting to stored user state`);
        updateMemberState({ ...storedUser, isActive: false });
      }
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, 500);

  const joinParty = async (username: string, avatar: string, status: string) => {
    await debouncedJoinParty(username, avatar, status);
  };

  const editProfile = useCallback((username: string, avatar: string, status: string) => {
    if (!currentUser) return;

    const updatedUser = {
      ...currentUser,
      name: username,
      avatar,
      game: status
    };

    updateMemberState(updatedUser);
  }, [currentUser, updateMemberState]);

  const toggleMute = async (id: string) => {
    if (currentUser?.id !== id) return;
    
    if (!voiceChatInitialized.current || !isJoined) {
      console.warn(`${logPrefix} Cannot toggle mute - Voice chat not initialized`);
      return;
    }
    
    try {
      console.log(`${logPrefix} Toggling mute for user:`, id);
      const newMuteState = await toggleVoiceMute();
      
      if (typeof newMuteState !== 'boolean') {
        console.warn(`${logPrefix} Invalid mute state returned:`, newMuteState);
        return;
      }
      
      setLocalMuted(newMuteState);
      setCurrentUser(prev => prev ? { ...prev, muted: newMuteState } : null);
      setMembers(prevMembers => 
        prevMembers.map(member => 
          member.id === id ? { ...member, muted: newMuteState } : member
        )
      );
    } catch (error) {
      console.error(`${logPrefix} Failed to toggle mute:`, error);
      // Don't throw, just log the error
    }
  };

  const debouncedLeaveParty = useDebounce(async () => {
    if (isProcessing) {
      console.log(`${logPrefix} Leave operation in progress, skipping`);
      return;
    }

    if (!currentUser) return;

    try {
      setIsProcessing(true);
      console.log(`${logPrefix} Leaving party:`, currentUser.name);
      
      // Reset voice chat state first
      voiceChatInitialized.current = false;
      await leaveRoom();
      
      // Then update user state
      const userToStore = { ...currentUser, isActive: false };
      localStorage.setItem('currentUser', JSON.stringify(userToStore));
      setStoredUser(userToStore);
      setCurrentUser(null);
      setLocalMuted(false);
    } catch (error) {
      console.error(`${logPrefix} Failed to leave party:`, error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, 500);

  const leaveParty = async () => {
    await debouncedLeaveParty();
  };

  return {
    members,
    currentUser,
    storedAvatar: storedUser?.avatar || null,
    isConnected: isJoined && voiceChatInitialized.current,
    isMuted: localMuted,
    volumeLevel,
    toggleMute,
    joinParty,
    editProfile,
    leaveParty,
    isProcessing
  };
}