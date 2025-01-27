'use client';

import type { MemberListProps } from '@/lib/types/components/props';

import { useMemo, useCallback, useState, useEffect } from 'react';

import Image from 'next/image';

import { motion, AnimatePresence } from 'framer-motion';

import { VoiceStatusIcon } from '@/components/features/party/icons/VoiceStatusIcon';

import { AVATARS } from '@/lib/constants';
import { useToast } from '@/lib/hooks/use-toast';
import { logger } from '@/lib/logger';
import { usePartyStore } from '@/lib/stores/partyStore';
import { isRateLimited } from '@/lib/utils/rateLimiter';

export function MemberList({ members, currentUserId, volumeLevels = {} }: MemberListProps) {
  const {
    voice: { isMuted: storeIsMuted },
  } = usePartyStore();
  const { toast } = useToast();
  const [localMutes, setLocalMutes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Load saved local mutes from localStorage
    const savedMutes = localStorage.getItem('localMutes');
    if (savedMutes) {
      try {
        setLocalMutes(JSON.parse(savedMutes));
      } catch (error) {
        logger.error('Failed to load saved mutes', {
          component: 'MemberList',
          action: 'loadSavedMutes',
          metadata: { error },
        });
      }
    }
  }, []);

  // Save local mutes whenever they change
  useEffect(() => {
    localStorage.setItem('localMutes', JSON.stringify(localMutes));
  }, [localMutes]);

  // Handle muting/unmuting other users
  const handleOtherMemberMute = useCallback(async (memberId: string) => {
    // Rate limit to 1 action per second per member
    if (isRateLimited(`mute-${memberId}`, 2000)) {
      toast({
        description: 'Please wait before toggling mute again',
        duration: 1000,
      });
      return;
    }

    const member = members.find(m => m.id === memberId);
    const isLocallyMuted = localMutes[memberId] ?? false;

    try {
      // Toggle local mute state
      const newMuteState = !isLocallyMuted;
      setLocalMutes(prev => ({
        ...prev,
        [memberId]: newMuteState
      }));

      // Show toast after successful toggle
      toast({
        description: `${member?.name ?? 'User'} ${newMuteState ? 'muted' : 'unmuted'} locally`,
        duration: 1000,
      });
    } catch (error) {
      // Revert local mute state on error
      setLocalMutes(prev => ({
        ...prev,
        [memberId]: isLocallyMuted
      }));

      logger.error('Failed to toggle member mute', {
        component: 'MemberList',
        action: 'handleOtherMemberMute',
        metadata: { error, memberId, currentState: isLocallyMuted },
      });
      toast({
        description: 'Failed to update mute state',
        duration: 2000,
      });
    }
  }, [members, toast, localMutes]);

  // Memoize member rendering to prevent unnecessary recalculations
  const renderedMembers = useMemo(() => {
    // Filter out inactive or left members
    const activeMembers = members.filter(member =>
      member.is_active && member.status !== 'left'
    );

    if (!activeMembers.length) {
      return (
        <div
          aria-label="No members in party"
          className="flex h-full items-center justify-center opacity-0 animate-fadeIn"
          role="status"
          style={{ animationDelay: '150ms', animationFillMode: 'forwards' }}
        >
          <span className="p-10 text-base text-[#282b2f]">nostalgia, onchain.</span>
        </div>
      );
    }

    // Sort members with the following priority:
    // 1. Current user always first
    // 2. Currently speaking members
    // 3. Members who have spoken before
    // 4. Members who haven't spoken
    const sortedMembers = [...activeMembers].sort((a, b) => {
      // Current user always first
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;

      // Get voice states for both members
      const aVoiceState = volumeLevels[a.id];
      const bVoiceState = volumeLevels[b.id];

      // Check current speaking state
      const aIsSpeaking = aVoiceState?.voice_status === 'speaking' && !aVoiceState?.muted;
      const bIsSpeaking = bVoiceState?.voice_status === 'speaking' && !bVoiceState?.muted;

      // Check if they have ever spoken (has a timestamp)
      const aHasSpoken = aVoiceState?.timestamp != null;
      const bHasSpoken = bVoiceState?.timestamp != null;

      // Currently speaking members go to the top
      if (aIsSpeaking && !bIsSpeaking) return -1;
      if (!aIsSpeaking && bIsSpeaking) return 1;

      // Members who have spoken stay above those who haven't
      if (aHasSpoken && !bHasSpoken) return -1;
      if (!aHasSpoken && bHasSpoken) return 1;

      // If both have spoken, most recent speaker goes first
      if (aHasSpoken && bHasSpoken) {
        return (bVoiceState?.timestamp ?? 0) - (aVoiceState?.timestamp ?? 0);
      }

      // Keep original order for members who haven't spoken
      return 0;
    });

    return sortedMembers.map(member => {
      const isCurrentUser = member.id === currentUserId;
      const volumeState = volumeLevels[member.id];
      const isLocallyMuted = localMutes[member.id] ?? false;
      const isSelfMuted = volumeState?.muted ?? false;
      const voice_status = volumeState?.voice_status ?? 'silent';

      // Determine the effective voice status based on mute states
      let effectiveStatus = voice_status;
      if (isCurrentUser) {
        effectiveStatus = storeIsMuted ? 'muted' : voice_status;
      } else {
        if (isLocallyMuted || isSelfMuted) {
          effectiveStatus = 'muted';
        }
      }

      return (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          aria-label={`${member.name} - ${member.game} - ${effectiveStatus}`}
          className="flex h-[48px] items-center border-t border-[#e5e5e5] px-1 sm:px-3 transition-all duration-200 ease-out first:border-t-0 hover:bg-[#f5f5f5] gap-1 sm:gap-4"
          exit={{ opacity: 0, y: 10 }}
          initial={{ opacity: 0, y: -10 }}
          key={member.id}
          role="listitem"
          transition={{ duration: 0.2 }}
        >
          <div className="flex w-[160px] items-center gap-1 sm:w-[240px] sm:gap-2 md:w-[420px] md:gap-2">
            <div className="w-5 sm:w-6 md:w-8 flex items-center justify-center shrink-0">
              {!isCurrentUser && (
                <button
                  onClick={() => handleOtherMemberMute(member.id)}

                  aria-label={isLocallyMuted ? 'Unmute user locally' : 'Mute user locally'}
                  className="relative cursor-pointer transition-transform duration-200 hover:scale-105"
                  title={isLocallyMuted ? 'Unmute user locally' : 'Mute user locally'}
                >
                  <VoiceStatusIcon
                    className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8"
                    isOtherUser={true}
                    status={effectiveStatus}
                  />
                </button>
              )}
              {isCurrentUser && (
                <div
                  className="relative cursor-not-allowed"
                  title="Use the mute button below to control your microphone"
                >
                  <VoiceStatusIcon
                    className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8"
                    isOtherUser={false}
                    status={effectiveStatus}
                  />
                </div>
              )}
            </div>

            {/* Avatar */}
            <div
              aria-label={`${member.name}'s avatar`}
              className="w-5 sm:w-6 md:w-8 flex items-center justify-center shrink-0"
              role="img"
            >
              <Image
                alt={member.name ?? 'Member'}
                className="transition-opacity duration-200"
                height={32}
                src={member.avatar ?? AVATARS[0]!}
                width={32}
              />
            </div>

            {/* Name */}
            <span className="flex-1 truncate text-sm font-semibold text-[#282b2f] [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset] sm:text-base md:text-2xl transition-colors duration-200">
              {member.name ?? 'Unknown'}
            </span>
          </div>

          {/* Game status */}
          <div className="flex items-center min-w-0">
            {/* Game status icon */}
            <div
              aria-label="Game status icon"
              className="w-5 sm:w-6 md:w-8 flex items-center justify-center shrink-0"
              role="img"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 transition-colors duration-200"
                fill="#acd43b"
                viewBox="0 0 3000 3000"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M1215.59,42.59c404.31-17.99,672.29,420,455.24,769.24-193.36,311.12-655.35,315.58-851.66,6-204.49-322.48,12.81-758.17,396.42-775.24Z" />
                <path d="M2165.59,956.59c183.48-9.01,184.83,221.64,190.49,350.33,17.79,404.09,2.4,809.43,12,1214,2.5,105.19,10.31,288.29-94.24,349.92-38.25,22.55-102.62,29.46-146.86,35.14-99.53,12.79-200.19,23.62-300,34-69.02,7.18-145.2,17.33-213.9,20.1-171.11,6.89-271.76-164.73-351.91-290.25-218.29-341.85-406.95-701.94-617.53-1048.47-50.4-111.32,94.65-228.8,179.02-275.71,29.83-16.58,60.03-23.16,88-42,391.63-108.17,781.28-229.69,1174.92-331.08,26.43-6.81,52.47-14.63,80.02-15.98Z" />
              </svg>
            </div>
            <div className="flex items-center min-w-0 ml-1 sm:ml-6 md:ml-20 mr-2">
              <span className="truncate text-sm font-semibold text-[#282b2f] [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset] sm:text-base md:text-2xl transition-colors duration-200">
                {member.game}
              </span>
            </div>
          </div>
        </motion.div>
      );
    });
  }, [members, currentUserId, volumeLevels, localMutes, storeIsMuted, handleOtherMemberMute]);

  return (
    <div
      aria-label="Party members"
      className="flex h-full flex-col"
      role="list"
    >
      <div className="flex flex-1 flex-col">
        <AnimatePresence>
          {renderedMembers}
        </AnimatePresence>
      </div>
    </div>
  );
}
