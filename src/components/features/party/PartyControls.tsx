'use client';

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useVoiceChat } from '@/lib/hooks/useVoiceChat';
import type { PartyMember } from '@/lib/types/party';
import { logger } from '@/lib/utils/logger';
import { useModalStore } from '@/lib/stores/useModalStore';

interface PartyControlsProps {
  currentUser: PartyMember | null;
  isLeaving: boolean;
  onLeave: () => Promise<void>;
  partyState: 'idle' | 'joining' | 'joined' | 'leaving' | 'cleanup';
}

export function PartyControls({ currentUser, isLeaving, onLeave, partyState }: PartyControlsProps) {
  const { isConnected, toggleMute } = useVoiceChat();
  const [isLoading, setIsLoading] = useState(false);
  const loggerRef = useRef(logger);
  const showModal = useModalStore((state) => state.showModal);

  // Debug log party state changes
  useEffect(() => {
    loggerRef.current.debug('Party state changed', {
      component: 'PartyControls',
      action: 'partyStateChange',
      metadata: {
        partyState,
        currentUser: currentUser?.id,
        isLoading,
        isLeaving,
      },
    });
  }, [partyState, currentUser, isLoading, isLeaving]);

  const handleLeave = useCallback(async () => {
    // Only allow leave if user is in party and not already leaving
    if (isLoading || isLeaving || !currentUser?.id || partyState !== 'joined') {
      loggerRef.current.debug('Leave button clicked while disabled', {
        component: 'PartyControls',
        action: 'leaveParty',
        metadata: { isLoading, isLeaving, currentUser, partyState },
      });
      return;
    }

    loggerRef.current.info('Leave button clicked', {
      component: 'PartyControls',
      action: 'leaveParty',
      metadata: { currentUser, isConnected },
    });

    try {
      setIsLoading(true);

      // First try to leave voice chat if connected
      if (isConnected) {
        try {
          await toggleMute();
        } catch (error) {
          loggerRef.current.warn('Failed to toggle mute before leaving', {
            component: 'PartyControls',
            action: 'leaveParty',
            metadata: { error },
          });
          // Continue with leave even if mute fails
        }
      }

      // Then try to leave party
      await onLeave();

      loggerRef.current.info('Successfully left party from controls', {
        component: 'PartyControls',
        action: 'leaveParty',
        metadata: { currentUser, isConnected },
      });
    } catch (error) {
      loggerRef.current.error('Failed to leave party from controls', {
        component: 'PartyControls',
        action: 'leaveParty',
        metadata: {
          error: error instanceof Error ? error : new Error(String(error)),
          currentUser,
          isConnected,
        },
      });
      throw error; // Re-throw to let parent handle error state
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isLeaving, currentUser, partyState, onLeave, isConnected, toggleMute]);

  const handleJoinParty = useCallback(async () => {
    // Only allow join if in idle state and not loading
    if (isLoading || partyState !== 'idle') {
      loggerRef.current.debug('Join button clicked while loading or not idle', {
        component: 'PartyControls',
        action: 'joinParty',
        metadata: { isLoading, partyState, currentUser },
      });
      return;
    }

    loggerRef.current.info('Opening join modal', {
      component: 'PartyControls',
      action: 'showJoinModal',
    });
    showModal('join');
  }, [isLoading, partyState, showModal, currentUser]);

  const handleMute = useCallback(async () => {
    // Only allow mute toggle if user is in party and connected
    if (!currentUser || !isConnected || partyState !== 'joined') {
      loggerRef.current.debug('Mute button clicked while disabled', {
        component: 'PartyControls',
        action: 'toggleMute',
        metadata: { isConnected, currentUser, partyState },
      });
      return;
    }

    loggerRef.current.info('Mute button clicked', {
      component: 'PartyControls',
      action: 'toggleMute',
      metadata: { isConnected, currentUser },
    });
    await toggleMute();
  }, [toggleMute, isConnected, currentUser, partyState]);

  const handleEditProfile = useCallback(() => {
    const userData = {
      name: currentUser?.name || '',
      avatar: currentUser?.avatar || '',
      game: currentUser?.game || '',
    };

    loggerRef.current.info('Opening edit modal', {
      component: 'PartyControls',
      action: 'showEditModal',
      metadata: {
        currentUser,
        userData,
        partyState,
        conditions: {
          hasUser: !!currentUser?.id,
          partyState,
          isJoined: partyState === 'joined',
        },
      },
    });
    showModal('edit', userData);
  }, [currentUser, showModal, partyState]);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 px-[30px] text-white sm:gap-2">
      <button
        onClick={handleJoinParty}
        disabled={partyState !== 'idle' || isLoading || !!currentUser?.id}
        className={`flex items-center gap-0 transition-all sm:gap-2 ${
          partyState === 'idle' && !isLoading && !currentUser?.id
            ? 'opacity-80 hover:opacity-100'
            : 'cursor-not-allowed opacity-30'
        }`}
        title={
          currentUser?.id
            ? 'Already in party'
            : partyState === 'joining' || isLoading
              ? 'Joining party...'
              : partyState === 'leaving'
                ? 'Leaving party...'
                : 'Click to join party'
        }
      >
        <div
          className={`h-3 w-3 rounded-full text-[8px] font-bold leading-3 sm:h-4 sm:w-4 sm:text-[10px] sm:leading-4 ${
            currentUser?.id
              ? 'bg-gray-500'
              : partyState === 'joining' || isLoading
                ? 'animate-pulse bg-yellow-500'
                : partyState === 'leaving'
                  ? 'bg-red-500'
                  : 'bg-[#70b603]'
          }`}
        >
          A
        </div>
        <span className="text-sm sm:text-base">
          {currentUser?.id
            ? 'In Party'
            : partyState === 'joining' || isLoading
              ? 'Joining...'
              : partyState === 'leaving'
                ? 'Leaving...'
                : partyState === 'cleanup'
                  ? 'Cleaning up...'
                  : 'Join Party'}
        </span>
      </button>

      <button
        onClick={handleLeave}
        disabled={isLoading || isLeaving || !currentUser?.id || partyState !== 'joined'}
        className={`flex items-center gap-0 transition-all sm:gap-2 ${
          !isLoading && !isLeaving && currentUser?.id && partyState === 'joined'
            ? 'opacity-80 hover:opacity-100'
            : 'cursor-not-allowed opacity-30'
        }`}
        title={
          !currentUser?.id
            ? 'Not in party'
            : partyState !== 'joined'
              ? `Not in party yet (state: ${partyState})`
              : isLoading || isLeaving
                ? 'Leaving party...'
                : 'Click to leave party'
        }
      >
        <div className="h-3 w-3 rounded-full bg-[#ae1228] text-[8px] font-bold leading-3 sm:h-4 sm:w-4 sm:text-[10px] sm:leading-4">
          B
        </div>
        <span className="text-sm sm:text-base">
          {isLoading || isLeaving ? 'Leaving...' : 'Leave Party'}
        </span>
      </button>

      <button
        onClick={handleEditProfile}
        className="flex items-center gap-0 opacity-80 transition-opacity hover:opacity-100 sm:gap-2"
      >
        <div className="h-3 w-3 rounded-full bg-[#006bb3] text-[8px] font-bold leading-3 sm:h-4 sm:w-4 sm:text-[10px] sm:leading-4">
          X
        </div>
        <span className="text-sm sm:text-base">Edit Profile</span>
      </button>

      <button
        onClick={handleMute}
        disabled={!isConnected || !currentUser || partyState !== 'joined'}
        className={`flex items-center gap-0 transition-all sm:gap-2 ${
          isConnected && currentUser && partyState === 'joined'
            ? 'opacity-80 hover:opacity-100'
            : 'cursor-not-allowed opacity-30'
        }`}
      >
        <div className="h-3 w-3 rounded-full bg-[#ffb400] text-[8px] font-bold leading-3 sm:h-4 sm:w-4 sm:text-[10px] sm:leading-4">
          Y
        </div>
        <span className="text-sm sm:text-base">
          {currentUser?.voice_status === 'muted' ? 'Unmute Mic' : 'Mute Mic'}
        </span>
      </button>
    </div>
  );
}
