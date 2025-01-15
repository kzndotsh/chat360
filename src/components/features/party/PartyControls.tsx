'use client';

import React, { useState } from 'react';
import { logger } from '@/lib/utils/logger';
import { type PartyMember } from '@/types';
import { useFormStore } from '@/lib/stores/useFormStore';
import { useModalStore } from '@/lib/stores/useModalStore';

interface PartyControlsProps {
  currentUser: PartyMember | null;
  isMuted: boolean;
  micPermissionDenied?: boolean;
  onJoin: (name: string, avatar: string, status: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onToggleMute: () => Promise<void>;
  onRequestMicrophonePermission: () => Promise<boolean>;
}

export function PartyControls({
  currentUser,
  onJoin,
  onLeave,
  onToggleMute,
  isMuted,
  micPermissionDenied = false,
  onRequestMicrophonePermission,
}: PartyControlsProps) {
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const { showModal } = useModalStore();

  const buttonClass = (enabled: boolean, loading: boolean) =>
    `flex items-center gap-1 ${
      enabled
        ? loading
          ? 'cursor-not-allowed opacity-50'
          : 'hover:opacity-80'
        : 'cursor-not-allowed opacity-50'
    } text-white transition-opacity`;

  const handleLeave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    try {
      await onLeave();
    } finally {
      setIsLeaving(false);
    }
  };

  const handleJoin = async () => {
    if (isJoining) return;
    setIsJoining(true);
    
    try {
      const lastUsedData = useFormStore.getState().lastUsedData;
      const storedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

      // If we have prior data, join directly without showing modal
      if (lastUsedData || storedUser) {
        logger.info('Joining with existing user data', {
          action: 'joinParty',
          metadata: {
            lastUsedData,
            storedUser
          }
        });

        // Use lastUsedData if available, otherwise use storedUser
        const userData = lastUsedData || {
          name: storedUser.name,
          avatar: storedUser.avatar,
          status: storedUser.status || 'Online'
        };

        // Call onJoin directly without showing modal
        await onJoin(userData.name, userData.avatar, userData.status);
        return;
      }

      // Only show the new user modal if we have no prior data
      logger.info('No existing user data, showing join modal', {
        action: 'joinParty'
      });
      showModal('join');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-start gap-6 px-4 py-2">
        <button
          onClick={handleJoin}
          className={buttonClass(!currentUser?.isActive ?? true, isJoining)}
          disabled={(currentUser?.isActive ?? false) || isJoining}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#55b611] text-[10px] font-bold text-white">
            A
          </div>
          <span>
            {isJoining ? 'Joining...' : 'Join Party'}
          </span>
        </button>

        <button
          onClick={handleLeave}
          className={buttonClass(currentUser?.isActive ?? false, isLeaving)}
          disabled={!(currentUser?.isActive ?? false) || isLeaving}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ae1228] text-[10px] font-bold text-white">
            B
          </div>
          <span>
            {isLeaving ? 'Leaving...' : 'Leave Party'}
          </span>
        </button>

        <button
          onClick={() => {
            logger.info('Toggling mute', {
              action: 'toggleMute'
            });
            onToggleMute();
          }}
          className={buttonClass(currentUser?.isActive ?? false, false)}
          disabled={!(currentUser?.isActive ?? false)}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0c71ba] text-[10px] font-bold text-white">
            X
          </div>
          <span>
            {isMuted ? 'Unmute' : 'Mute'}
          </span>
        </button>

        <button
          onClick={() => {
            logger.info('Opening edit modal', {
              action: 'openEditModal'
            });
            showModal('edit', {
              name: currentUser?.name || '',
              avatar: currentUser?.avatar || '',
              status: currentUser?.game || ''
            });
          }}
          className={buttonClass(true, false)}
          disabled={false}
        >
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e09a23] text-[10px] font-bold text-white">
            Y
          </div>
          <span>Edit Profile</span>
        </button>
      </div>

      {micPermissionDenied && (
        <button
          onClick={onRequestMicrophonePermission}
          className="mx-4 flex items-center justify-center gap-2 bg-[#0c71ba] py-2 text-white transition-colors hover:bg-[#0a5c94]"
        >
          <span>Re-request Microphone Access</span>
        </button>
      )}
    </div>
  );
}

PartyControls.displayName = 'PartyControls';
