'use client';

import type { PartyControlsProps } from '@/lib/types/components/props';

import React, { memo, useCallback } from 'react';

import { AVATARS } from '@/lib/constants';
import { useToast } from '@/lib/hooks/use-toast';
import { useModalStore } from '@/lib/stores/useModalStore';
import { isRateLimited } from '@/lib/utils/rateLimiter';

export const PartyControls = memo(function PartyControls({
  currentUser,
  isLeaving,
  onLeaveAction,
  partyState,
  isMuted = false,
  onToggleMute,
  micPermissionDenied = false,
  onRequestMicrophonePermission,
}: PartyControlsProps) {
  const showModal = useModalStore((state) => state.showModal);
  const { toast } = useToast();

  const handleMuteToggle = useCallback(async () => {
    if (!onToggleMute) return;

    // Rate limit to 1 toggle every 500ms
    if (isRateLimited('mute-toggle', 500)) {
      toast({
        description: 'Please wait before toggling mute again',
        duration: 1000,
      });
      return;
    }

    await onToggleMute();
    toast({
      description: `Microphone ${!isMuted ? 'muted' : 'unmuted'}`,
      duration: 1000,
    });
  }, [onToggleMute, isMuted, toast]);

  const handleJoinClick = useCallback(() => {
    showModal('join', {
      name: '',
      avatar: '',
      game: '',
    });
  }, [showModal]);

  const handleProfileClick = useCallback(() => {
    if (!currentUser) return;
    showModal('profile', {
      name: currentUser.name ?? '',
      avatar: currentUser.avatar ?? AVATARS[0]!,
      game: currentUser.game ?? 'Offline',
    });
  }, [showModal, currentUser]);

  const buttonClass = (isActive: boolean, isProcessing: boolean) =>
    `flex items-center gap-1 md:gap-2 transition-opacity ${
      isActive && !isProcessing ? 'hover:opacity-80' : 'opacity-50 cursor-not-allowed'
    }`;

  return (
    <div className="flex flex-col px-[30px] py-3">
      <div className="flex min-w-[300px] flex-nowrap gap-2 text-xs md:gap-4 md:text-sm">
        {!currentUser && (
          <button
            onClick={handleJoinClick}

            className={buttonClass(partyState === 'idle', partyState === 'joining')}
            disabled={partyState !== 'idle'}
          >
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#55b611] text-[10px] font-bold text-white md:h-5 md:w-5 md:text-[11px]">
              A
            </div>
            <span className="font-semibold text-white [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset]">
              {partyState === 'joining' ? 'Joining...' : 'Join Party'}
            </span>
          </button>
        )}

        {currentUser && (
          <>
            <button
              onClick={onLeaveAction}

              className={buttonClass(true, isLeaving)}
              disabled={isLeaving || partyState === 'joining'}
            >
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#ae1228] text-[10px] font-bold text-white md:h-5 md:w-5 md:text-[11px]">
                B
              </div>
              <span className="text-white [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset]">
                {isLeaving ? 'Leaving...' : 'Leave Party'}
              </span>
            </button>

            <button
              onClick={handleMuteToggle}

              className={buttonClass(true, false)}
              disabled={partyState === 'joining'}
            >
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0c71ba] text-[10px] font-bold text-white md:h-5 md:w-5 md:text-[11px]">
                X
              </div>
              <span className="text-white [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset]">
                {isMuted ? 'Unmute' : 'Mute'}
              </span>
            </button>

            {micPermissionDenied && onRequestMicrophonePermission && (
              <button
                onClick={onRequestMicrophonePermission}

                className={buttonClass(true, false)}
                disabled={partyState === 'joining'}
              >
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0c71ba] text-[10px] font-bold text-white md:h-5 md:w-5 md:text-[11px]">
                  R
                </div>
                <span className="text-white [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset]">
                  Re-request Mic
                </span>
              </button>
            )}

            <button
              onClick={handleProfileClick}

              className={buttonClass(true, false)}
              disabled={partyState === 'joining'}
            >
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e09a23] text-[10px] font-bold text-white md:h-5 md:w-5 md:text-[11px]">
                Y
              </div>
              <span className="text-white [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset]">
                Edit Profile
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
});
