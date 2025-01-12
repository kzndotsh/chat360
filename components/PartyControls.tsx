'use client';

import { useState } from 'react';

interface PartyControlsProps {
  currentUser: any;
  storedAvatar: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onEdit: () => void;
  volumeLevel?: number;
  isMuted: boolean;
  micPermissionDenied: boolean;
  onRequestMicrophonePermission: () => Promise<boolean>;
}

export function PartyControls({
  currentUser,
  storedAvatar,
  onJoin,
  onLeave,
  onToggleMute,
  onEdit,
  volumeLevel = 0,
  isMuted,
  micPermissionDenied = false,
  onRequestMicrophonePermission,
}: PartyControlsProps) {
  const [isLeaving, setIsLeaving] = useState(false);

  const handleMicrophoneRequest = async () => {
    await onRequestMicrophonePermission();
  };

  const handleLeave = async () => {
    if (isLeaving || !currentUser?.isActive) return; // Prevent multiple clicks and check active status
    
    try {
      setIsLeaving(true);
      await onLeave();
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <div className='flex flex-col gap-2 px-[30px]'>
      <div className='flex flex-wrap items-center gap-1 sm:gap-2 text-sm sm:text-base mt-1'>
        <button
          onClick={onJoin}
          className={`flex items-center gap-0 sm:gap-2 transition-opacity ${
            currentUser?.isActive
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:opacity-80'
          }`}
          disabled={currentUser?.isActive}>
          <div className='w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#55b611] flex items-center justify-center text-white font-bold text-[8px] sm:text-[10px]'>
            A
          </div>
          <span className='text-white ml-[-3px]'>Join Party</span>
        </button>
        <button
          onClick={handleLeave}
          className={`flex items-center gap-0 sm:gap-2 transition-opacity ${
            !currentUser?.isActive || isLeaving
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:opacity-80'
          }`}
          disabled={!currentUser?.isActive || isLeaving}>
          <div className='w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#ae1228] flex items-center justify-center text-white font-bold text-[8px] sm:text-[10px]'>
            B
          </div>
          <span className='text-white ml-[-3px]'>
            {isLeaving ? 'Leaving...' : 'Leave Party'}
          </span>
        </button>
        <button
          onClick={onToggleMute}
          className={`flex items-center gap-0 sm:gap-2 transition-opacity ${
            !currentUser?.isActive
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:opacity-80'
          }`}
          disabled={!currentUser?.isActive}>
          <div className='w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#0c71ba] flex items-center justify-center text-white font-bold text-[8px] sm:text-[10px]'>
            X
          </div>
          <span className='text-white ml-[-3px]'> 
            {isMuted ? 'Unmute' : 'Mute'}
          </span>
        </button>
        <button
          onClick={onEdit}
          className={`flex items-center gap-0 sm:gap-2 transition-opacity ${
            !currentUser && !storedAvatar
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:opacity-80'
          }`}
          disabled={!currentUser && !storedAvatar}>
          <div className='w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#e09a23] flex items-center justify-center text-white font-bold text-[8px] sm:text-[10px]'>
            Y
          </div>
          <span className='text-white ml-[-3px]'>Edit Profile</span>
        </button>
      </div>
      
      {micPermissionDenied && (
        <button
          onClick={handleMicrophoneRequest}
          className='flex items-center justify-center gap-2 text-white bg-[#0c71ba] hover:bg-[#0a5c94] transition-colors py-2 mt-1'
        >
          <span>Re-request Microphone Access</span>
        </button>
      )}
    </div>
  );
}