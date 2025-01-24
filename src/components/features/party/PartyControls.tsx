'use client';

import type { PartyControlsProps } from '@/lib/types/components/props';

import React from 'react';

import { useModalStore } from '@/lib/stores/useModalStore';

export function PartyControls({
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

  const buttonClass = (isActive: boolean, isProcessing: boolean) =>
    `flex items-center gap-2 transition-opacity ${
      isActive && !isProcessing ? 'hover:opacity-80' : 'opacity-50 cursor-not-allowed'
    }`;

  return (
    <div className="flex flex-col px-[30px] py-3">
      <div className="flex flex-wrap gap-4 text-sm">
        {!currentUser && (
          <button
            onClick={() => {
              showModal('join', {
                name: '',
                avatar: '',
                game: '',
              });
            }}

            className={buttonClass(partyState === 'idle', partyState === 'joining')}
            disabled={partyState !== 'idle'}
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#55b611] text-[11px] font-bold text-white">
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
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ae1228] text-[11px] font-bold text-white">
                B
              </div>
              <span className="text-white [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset]">
                {isLeaving ? 'Leaving...' : 'Leave Party'}
              </span>
            </button>

            <button
              onClick={onToggleMute}

              className={buttonClass(true, false)}
              disabled={partyState === 'joining'}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0c71ba] text-[11px] font-bold text-white">
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
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0c71ba] text-[11px] font-bold text-white">
                  R
                </div>
                <span className="text-white [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset]">
                  Re-request Mic
                </span>
              </button>
            )}

            <button
              onClick={() => {
                showModal('profile', {
                  name: currentUser.name,
                  avatar: currentUser.avatar || 'https://i.imgur.com/LCycgcq.png',
                  game: currentUser.game || 'Offline',
                });
              }}

              className={buttonClass(true, false)}
              disabled={partyState === 'joining'}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e09a23] text-[11px] font-bold text-white">
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
}
