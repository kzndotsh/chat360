'use client';

import React from 'react';
import { useModalStore } from '@/lib/stores/useModalStore';
import type { PartyMember } from '@/lib/types/party';
import { AVATARS } from '@/lib/config/constants';

type PartyState = 'idle' | 'joining' | 'joined' | 'leaving';

interface PartyControlsProps {
  currentUser: PartyMember | null;
  isLeaving: boolean;
  onLeave: () => void;
  partyState: PartyState;
  isMuted?: boolean;
  onToggleMute?: () => void;
  micPermissionDenied?: boolean;
  onRequestMicrophonePermission?: () => void;
}

export function PartyControls({
  currentUser,
  isLeaving,
  onLeave,
  partyState,
  isMuted = false,
  onToggleMute,
  micPermissionDenied = false,
  onRequestMicrophonePermission,
}: PartyControlsProps) {
  const showModal = useModalStore((state) => state.showModal);
  const buttonClass = (isActive: boolean, isProcessing: boolean) =>
    `flex items-center gap-0 sm:gap-2 transition-opacity ${
      isActive && !isProcessing ? 'hover:opacity-80' : 'opacity-50 cursor-not-allowed'
    }`;

  return (
    <div className="flex flex-col gap-2 px-[30px]">
      <div className="mt-1 flex flex-wrap items-center gap-1 text-sm sm:gap-2 sm:text-base">
        {!currentUser && (
          <button
            onClick={() =>
              showModal('join', {
                name: '',
                avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? AVATARS[0]!,
                game: 'Offline',
              })
            }
            className={buttonClass(partyState === 'idle', partyState === 'joining')}
            disabled={partyState !== 'idle'}
          >
            <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#55b611] text-[8px] font-bold text-white sm:h-4 sm:w-4 sm:text-[10px]">
              A
            </div>
            <span className="ml-[-3px] text-white">
              {partyState === 'joining' ? 'Joining...' : 'Join Party'}
            </span>
          </button>
        )}

        {currentUser && (
          <>
            <button
              onClick={onLeave}
              className={buttonClass(true, isLeaving)}
              disabled={isLeaving || partyState === 'joining'}
            >
              <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ae1228] text-[8px] font-bold text-white sm:h-4 sm:w-4 sm:text-[10px]">
                B
              </div>
              <span className="ml-[-3px] text-white">
                {isLeaving ? 'Leaving...' : 'Leave Party'}
              </span>
            </button>

            {onToggleMute && (
              <button
                onClick={onToggleMute}
                className={buttonClass(true, false)}
                disabled={partyState === 'joining'}
              >
                <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#0c71ba] text-[8px] font-bold text-white sm:h-4 sm:w-4 sm:text-[10px]">
                  X
                </div>
                <span className="ml-[-3px] text-white">{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>
            )}

            {micPermissionDenied && onRequestMicrophonePermission && (
              <button
                onClick={onRequestMicrophonePermission}
                className={buttonClass(true, false)}
                disabled={partyState === 'joining'}
              >
                <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#0c71ba] text-[8px] font-bold text-white sm:h-4 sm:w-4 sm:text-[10px]">
                  R
                </div>
                <span className="ml-[-3px] text-white">Re-request Mic</span>
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
              <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#e09a23] text-[8px] font-bold text-white sm:h-4 sm:w-4 sm:text-[10px]">
                Y
              </div>
              <span className="ml-[-3px] text-white">Edit Profile</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
