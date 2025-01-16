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
  joinParty: (username: string, avatar: string, game: string) => Promise<void>;
}

export function PartyControls({
  currentUser,
  isLeaving,
  onLeave,
  partyState,
  joinParty,
}: PartyControlsProps) {
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

  // Show join modal on initial load if no user
  useEffect(() => {
    if (!currentUser) {
      loggerRef.current.info('Showing join modal on initial load', {
        component: 'PartyControls',
        action: 'showInitialJoinModal',
      });
      showModal('join');
    }
  }, [currentUser, showModal]);

  const handleLeave = useCallback(async () => {
    loggerRef.current.debug('Leave button clicked', {
      component: 'PartyControls',
      action: 'handleLeave',
      metadata: {
        isDisabled: isLoading || isLeaving || !currentUser?.id || partyState !== 'joined',
        conditions: {
          isLoading,
          isLeaving,
          hasUser: !!currentUser?.id,
          userId: currentUser?.id,
          partyState,
          isJoined: partyState === 'joined',
          currentUserState: currentUser
        }
      }
    });
    
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

    setIsLoading(true);
    try {
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
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isLeaving, currentUser, partyState, onLeave, isConnected]);

  const handleJoinParty = useCallback(async () => {
    if (isLoading || partyState !== 'idle') {
      loggerRef.current.debug('Join button clicked while loading or not idle', {
        component: 'PartyControls',
        action: 'joinParty',
        metadata: { isLoading, partyState, currentUser },
      });
      return;
    }

    if (!currentUser) {
      loggerRef.current.info('Showing join modal - no user data', {
        component: 'PartyControls',
        action: 'showJoinModal',
      });
      showModal('join');
      return;
    }

    const { name, avatar, game } = currentUser;
    if (!name || !avatar || !game) {
      loggerRef.current.warn('Missing required user data for join', {
        component: 'PartyControls',
        action: 'showEditModal',
        metadata: { currentUser },
      });
      showModal('edit');
      return;
    }

    loggerRef.current.info('Join party button clicked', {
      component: 'PartyControls',
      action: 'joinParty',
      metadata: { currentUser },
    });
    
    setIsLoading(true);
    try {
      await joinParty(name, avatar, game);
      loggerRef.current.info('Successfully joined party', {
        component: 'PartyControls',
        action: 'joinParty',
        metadata: { currentUser },
      });
    } catch (error) {
      loggerRef.current.error('Failed to join party', {
        component: 'PartyControls',
        action: 'joinParty',
        metadata: { error: error instanceof Error ? error : new Error(String(error)) },
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, showModal, joinParty, isLoading, partyState]);

  const handleMute = useCallback(async () => {
    if (!currentUser || !isConnected) return;

    loggerRef.current.info('Mute button clicked', {
      component: 'PartyControls',
      action: 'toggleMute',
      metadata: { isConnected, currentUser },
    });
    await toggleMute();
  }, [toggleMute, isConnected, currentUser]);

  useEffect(() => {
    loggerRef.current.debug('Leave button state updated', {
      component: 'PartyControls',
      action: 'leaveButtonState',
      metadata: {
        isDisabled: isLoading || isLeaving || !currentUser?.id || partyState !== 'joined',
        conditions: {
          isLoading,
          isLeaving,
          hasUser: !!currentUser?.id,
          userId: currentUser?.id,
          partyState,
          isJoined: partyState === 'joined',
          currentUserState: currentUser
        }
      }
    });
  }, [isLoading, isLeaving, currentUser, partyState]);

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
          partyState === 'joined' ? 'Already in party' :
          partyState === 'joining' || isLoading ? 'Joining party...' :
          partyState === 'leaving' ? 'Leaving party...' :
          !currentUser ? 'Click to set up your profile' :
          'Click to join party'
        }
      >
        <div 
          className={`h-3 w-3 rounded-full text-[8px] font-bold leading-3 sm:h-4 sm:w-4 sm:text-[10px] sm:leading-4 ${
            partyState === 'joined' ? 'bg-gray-500' : 
            partyState === 'joining' || isLoading ? 'bg-yellow-500 animate-pulse' :
            partyState === 'leaving' ? 'bg-red-500' :
            partyState === 'idle' && !currentUser ? 'bg-blue-500' :
            'bg-[#70b603]'
          }`}
        >
          A
        </div>
        <span className="text-sm sm:text-base">
          {partyState === 'joined' ? 'In Party' :
           partyState === 'joining' || isLoading ? 'Joining...' :
           partyState === 'leaving' ? 'Leaving...' :
           partyState === 'cleanup' ? 'Cleaning up...' :
           !currentUser && partyState === 'idle' ? 'Set Up Profile' :
           'Join Party'}
        </span>
      </button>

      <button
        onClick={handleLeave}
        disabled={isLoading || isLeaving || !currentUser?.id || partyState !== 'joined'}
        className={`flex items-center gap-0 transition-all sm:gap-2 ${
          partyState === 'joined' && !isLoading && !isLeaving && !!currentUser?.id
            ? 'opacity-80 hover:opacity-100'
            : 'cursor-not-allowed opacity-30'
        }`}
        title={
          !currentUser?.id ? 'Not in party' :
          partyState !== 'joined' ? `Not in party yet (state: ${partyState})` :
          isLoading || isLeaving ? 'Leaving party...' :
          'Click to leave party'
        }
        onMouseEnter={() => {
          loggerRef.current.debug('Leave button state', {
            component: 'PartyControls',
            action: 'leaveButtonHover',
            metadata: {
              isDisabled: isLoading || isLeaving || !currentUser?.id || partyState !== 'joined',
              conditions: {
                isLoading,
                isLeaving,
                hasUser: !!currentUser?.id,
                partyState,
                isJoined: partyState === 'joined'
              }
            }
          });
        }}
      >
        <div className="h-3 w-3 rounded-full bg-[#ae1228] text-[8px] font-bold leading-3 sm:h-4 sm:w-4 sm:text-[10px] sm:leading-4">
          B
        </div>
        <span className="text-sm sm:text-base">{isLeaving ? 'Leaving...' : 'Leave Party'}</span>
      </button>

      <button
        onClick={() => {
          const userData = {
            name: currentUser?.name || '',
            avatar: currentUser?.avatar || '',
            game: currentUser?.game || ''
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
                isJoined: partyState === 'joined'
              }
            },
          });
          showModal('edit', userData);
        }}
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
          {currentUser?.voiceStatus === 'muted' ? 'Unmute Mic' : 'Mute Mic'}
        </span>
      </button>
    </div>
  );
}
