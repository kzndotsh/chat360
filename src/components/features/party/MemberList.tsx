'use client';

import type { MemberListProps } from '@/lib/types/components/props';
import type { VoiceStatus } from '@/lib/types/party/member';

import { useState, useEffect, useMemo } from 'react';

import Image from 'next/image';

import { VoiceStatusIcon } from '@/components/features/party/icons/VoiceStatusIcon';

import { AVATARS } from '@/lib/constants';
import { VOICE_CONSTANTS } from '@/lib/constants/voice';
import { logger } from '@/lib/logger';

export function MemberList({ members, currentUserId, volumeLevels = {} }: MemberListProps) {
  const [debouncedVolumeLevels, setDebouncedVolumeLevels] = useState(volumeLevels);

  // Debounce volume level updates with a longer delay for UI updates
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedVolumeLevels(volumeLevels);
    }, VOICE_CONSTANTS.UPDATE_DEBOUNCE * 2);

    return () => clearTimeout(timer);
  }, [volumeLevels]);

  // Memoize member rendering to prevent unnecessary recalculations
  const renderedMembers = useMemo(() => {
    if (!members.length) {
      return (
        <div className="flex h-full items-center justify-center">
          <span className="text-base text-[#282b2f] p-10">No members in party</span>
        </div>
      );
    }

    return members.map((member) => {
      const isCurrentUser = member.id === currentUserId;
      const volumeState = debouncedVolumeLevels[member.id];

      // Get mute state from volumeState
      const isMuted = volumeState?.muted ?? false;

      // Determine voice status with proper precedence
      let voice_status: VoiceStatus = 'silent';
      if (isMuted) {
        voice_status = 'muted';
      } else if (volumeState?.voice_status === 'speaking' || (volumeState?.level != null && volumeState.level >= VOICE_CONSTANTS.SPEAKING_THRESHOLD)) {
        voice_status = 'speaking';
      }

      // Log state changes for debugging
      logger.debug('Rendering member', {
        component: 'MemberList',
        action: 'renderMember',
        metadata: {
          memberId: member.id,
          name: member.name,
          isCurrentUser,
          volumeLevel: volumeState?.level ?? 0,
          voice_status,
          muted: isMuted,
          volumeState: volumeState ? JSON.stringify(volumeState) : 'none'
        },
      });

      return (
        <div
          className="flex h-[48px] items-center border-t border-[#e5e5e5] px-6 transition-colors first:border-t-0 hover:bg-[#f5f5f5]"
          key={member.id}
        >
          {/* Column 1: Username section */}
          <div className="flex w-[440px] items-center gap-2">
            {/* Voice status with volume indicator */}
            <div className="relative -ml-4">
              <VoiceStatusIcon
                className="h-8 w-8"
                status={voice_status}
              />
            </div>

            {/* Avatar */}
            <div className="h-8 w-8 rounded-none">
              <Image
                alt={member.name ?? 'Member'}
                height={32}
                src={member.avatar ?? AVATARS[0]!}
                width={32}
              />
            </div>

            {/* Name */}
            <span className="ml-2 flex-1 text-2xl font-semibold text-[#282b2f]">
              {member.name ?? 'Unknown'}
            </span>
          </div>

          {/* Game status */}
          <div className="-ml-[60px] flex flex-1 items-center">
            {/* Game status icon */}
            <div className="mr-2">
              <svg
                className="h-8 w-8"
                fill="#acd43b"
                viewBox="0 0 3000 3000"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M1215.59,42.59c404.31-17.99,672.29,420,455.24,769.24-193.36,311.12-655.35,315.58-851.66,6-204.49-322.48,12.81-758.17,396.42-775.24Z" />
                <path d="M2165.59,956.59c183.48-9.01,184.83,221.64,190.49,350.33,17.79,404.09,2.4,809.43,12,1214,2.5,105.19,10.31,288.29-94.24,349.92-38.25,22.55-102.62,29.46-146.86,35.14-99.53,12.79-200.19,23.62-300,34-69.02,7.18-145.2,17.33-213.9,20.1-171.11,6.89-271.76-164.73-351.91-290.25-218.29-341.85-406.95-701.94-617.53-1048.47-50.4-111.32,94.65-228.8,179.02-275.71,29.83-16.58,60.03-23.16,88-42,391.63-108.17,781.28-229.69,1174.92-331.08,26.43-6.81,52.47-14.63,80.02-15.98Z" />
              </svg>
            </div>
            <span className="ml-[75px] text-2xl font-semibold text-[#282b2f]">{member.game}</span>
          </div>
        </div>
      );
    });
  }, [members, currentUserId, debouncedVolumeLevels]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col overflow-y-auto">
        {renderedMembers}
      </div>
    </div>
  );
}
