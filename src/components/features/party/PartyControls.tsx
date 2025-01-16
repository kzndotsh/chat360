'use client';

import React, { useState, useCallback } from 'react';
import { logger } from '@/lib/utils/logger';
import { type PartyMember } from '@/types';
import { useModalStore } from '@/lib/stores/useModalStore';
import { AVATARS } from '@/lib/config/constants';

interface PartyControlsProps {
  currentUser: PartyMember | null;
  isLeaving: boolean;
  isMuted: boolean;
  micPermissionDenied?: boolean;
  onJoin: (name: string, avatar: string, game: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onToggleMute: () => Promise<void>;
  onRequestMicrophonePermission: () => Promise<boolean>;
}

export function PartyControls({
  currentUser,
  isLeaving,
  isMuted,
  micPermissionDenied = false,
  onJoin,
  onLeave,
  onToggleMute,
  onRequestMicrophonePermission,
}: PartyControlsProps) {
  const showModal = useModalStore((state) => state.showModal);
  const hideModal = useModalStore((state) => state.hideModal);
  const [isLoading, setIsLoading] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);

  const handleJoinClick = useCallback(async () => {
    try {
      setIsLoading(true);
      const storedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

      if (storedUser) {
        const userData = {
          name: storedUser.name || '',
          avatar: storedUser.avatar || AVATARS[0],
          game: storedUser.game || 'Online',
        };

        await onJoin(userData.name, userData.avatar, userData.game);
      } else {
        showModal('join');
      }
    } catch (err) {
      logger.error('Failed to join party', {
        action: 'joinParty',
        metadata: { error: err instanceof Error ? err : new Error(String(err)) },
      });
      if (err instanceof Error && err.message.includes('Missing required profile fields')) {
        showModal('join');
      }
    } finally {
      setIsLoading(false);
    }
  }, [onJoin, showModal]);

  const handleEditClick = useCallback(() => {
    showModal('edit', {
      name: currentUser?.name || '',
      avatar: currentUser?.avatar || '',
      game: currentUser?.game || '',
    });
  }, [showModal, currentUser]);

  const handleLeaveClick = useCallback(async () => {
    try {
      hideModal();
      localStorage.removeItem('currentUser');
      await onLeave();
    } catch (err) {
      logger.error('Failed to leave party', {
        action: 'leaveParty',
        metadata: { error: err instanceof Error ? err : new Error(String(err)) },
      });
    }
  }, [onLeave, hideModal]);

  const handleMuteClick = useCallback(async () => {
    if (isTogglingMute) return;
    try {
      setIsTogglingMute(true);
      if (micPermissionDenied) {
        const granted = await onRequestMicrophonePermission();
        if (!granted) {
          logger.warn('Microphone permission denied', {
            action: 'handleMuteClick',
          });
        }
      } else {
        await onToggleMute();
      }
    } finally {
      setIsTogglingMute(false);
    }
  }, [isTogglingMute, micPermissionDenied, onRequestMicrophonePermission, onToggleMute]);

  const buttonClass = (enabled: boolean, loading: boolean) =>
    `flex items-center gap-2 ${
      enabled
        ? loading
          ? 'cursor-not-allowed opacity-50'
          : 'hover:opacity-80'
        : 'cursor-not-allowed opacity-50'
    } text-white transition-opacity`;

  const isActive = currentUser?.is_active ?? false;

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-start gap-6 px-4 py-2">
        <button
          onClick={handleJoinClick}
          className={buttonClass(!isActive && !isLoading && !isLeaving, isLoading)}
          disabled={isActive || isLoading || isLeaving}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#55b611] text-[10px] font-bold text-white">
            A
          </div>
          <span>{isLoading ? 'Joining...' : 'Join Party'}</span>
        </button>

        <button
          onClick={handleLeaveClick}
          className={buttonClass(isActive && !isLeaving, isLeaving)}
          disabled={!isActive || isLeaving}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ae1228] text-[10px] font-bold text-white">
            X
          </div>
          <span>{isLeaving ? 'Leaving...' : 'Leave Party'}</span>
        </button>

        <button
          onClick={handleMuteClick}
          className={buttonClass(isActive && !isTogglingMute, isTogglingMute)}
          disabled={!isActive || isTogglingMute}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0c71ba] text-[10px] font-bold text-white">
            Y
          </div>
          <span>{micPermissionDenied ? 'Enable Microphone' : isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          onClick={handleEditClick}
          className={buttonClass(isActive, false)}
          disabled={!isActive}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e09a23] text-[10px] font-bold text-white">
            B
          </div>
          <span>Edit Profile</span>
        </button>
      </div>
    </div>
  );
}

PartyControls.displayName = 'PartyControls';
