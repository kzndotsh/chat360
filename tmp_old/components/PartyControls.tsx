'use client';

import { useState } from 'react';
import { logWithContext } from '@/lib/logger';
import { type PartyMember } from '@/types';

interface PartyControlsProps {
  currentUser: PartyMember | null;
  storedAvatar: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onEdit: (data: { name: string; avatar: string; status: string }) => void;
  isMuted: boolean;
  micPermissionDenied?: boolean;
  onRequestMicrophonePermission: () => void;
  isConnected: boolean;
}

export function PartyControls({
  currentUser,
  storedAvatar,
  onJoin,
  onLeave,
  onToggleMute,
  onEdit,
  isMuted,
  micPermissionDenied = false,
  onRequestMicrophonePermission,
}: PartyControlsProps) {
  const [isLeaving, setIsLeaving] = useState(false);

  const handleLeave = async () => {
    if (isLeaving || !currentUser?.isActive) return;
    setIsLeaving(true);
    try {
      logWithContext('PartyControls.tsx', 'handleLeave', 'Attempting to leave party');
      await onLeave();
      logWithContext('PartyControls.tsx', 'handleLeave', 'Left party successfully');
    } finally {
      setIsLeaving(false);
    }
  };

  const handleJoin = () => {
    logWithContext('PartyControls.tsx', 'handleJoin', 'Opening join modal');
    onJoin();
  };

  const buttonClass = (isActive: boolean, isProcessing: boolean) =>
    `flex items-center gap-0 sm:gap-2 transition-opacity ${
      isActive && !isProcessing ? 'hover:opacity-80' : 'opacity-50 cursor-not-allowed'
    }`;

  return (
    <div className="flex flex-col gap-2 px-[30px]">
      <div className="mt-1 flex flex-wrap items-center gap-1 text-sm sm:gap-2 sm:text-base">
        <button
          onClick={handleJoin}
          className={buttonClass(!(currentUser?.isActive ?? false), false)}
          disabled={currentUser?.isActive ?? false}
        >
          <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#55b611] text-[8px] font-bold text-white sm:h-4 sm:w-4 sm:text-[10px]">
            A
          </div>
          <span className="ml-[-3px] text-white">Join Party</span>
        </button>

        <button
          onClick={handleLeave}
          className={buttonClass(currentUser?.isActive ?? false, isLeaving)}
          disabled={!(currentUser?.isActive ?? false) || isLeaving}
        >
          <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#ae1228] text-[8px] font-bold text-white sm:h-4 sm:w-4 sm:text-[10px]">
            B
          </div>
          <span className="ml-[-3px] text-white">{isLeaving ? 'Leaving...' : 'Leave Party'}</span>
        </button>

        <button
          onClick={() => {
            logWithContext('PartyControls.tsx', 'toggleMute', 'Toggling mute');
            onToggleMute();
          }}
          className={buttonClass(currentUser?.isActive ?? false, false)}
          disabled={!(currentUser?.isActive ?? false)}
        >
          <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#0c71ba] text-[8px] font-bold text-white sm:h-4 sm:w-4 sm:text-[10px]">
            X
          </div>
          <span className="ml-[-3px] text-white">{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          onClick={() => {
            logWithContext(
              'PartyControls.tsx',
              'editProfile',
              `Editing profile for user: ${JSON.stringify({
                currentUser,
                storedAvatar,
              })}`
            );
            onEdit({
              name: currentUser?.name || '',
              avatar: currentUser?.avatar || storedAvatar || '',
              status: currentUser?.game || '',
            });
          }}
          className={buttonClass(Boolean(currentUser || storedAvatar), false)}
          disabled={!currentUser && !storedAvatar}
        >
          <div className="flex h-3 w-3 items-center justify-center rounded-full bg-[#e09a23] text-[8px] font-bold text-white sm:h-4 sm:w-4 sm:text-[10px]">
            Y
          </div>
          <span className="ml-[-3px] text-white">Edit Profile</span>
        </button>
      </div>

      {micPermissionDenied && (
        <button
          onClick={() => {
            logWithContext(
              'PartyControls.tsx',
              'requestMicrophonePermission',
              'Requesting microphone permission'
            );
            onRequestMicrophonePermission();
          }}
          className="mt-1 flex items-center justify-center gap-2 bg-[#0c71ba] py-2 text-white transition-colors hover:bg-[#0a5c94]"
        >
          <span>Re-request Microphone Access</span>
        </button>
      )}
    </div>
  );
}
