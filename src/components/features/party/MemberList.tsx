'use client';

import type { MemberListProps } from '@/lib/types/components/props';
import type { VoiceStatus } from '@/lib/types/party/member';

import { useMemo, useCallback } from 'react';

import Image from 'next/image';

import { VoiceStatusIcon } from '@/components/features/party/icons/VoiceStatusIcon';

import { AVATARS } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { VoiceService } from '@/lib/services/voiceService';
import { usePartyStore } from '@/lib/stores/partyStore';

export function MemberList({ members, currentUserId, volumeLevels = {} }: MemberListProps) {
  const {
    voice: { isMuted: storeIsMuted },
  } = usePartyStore();

  const handleVolumeClick = useCallback(
    async (memberId: string) => {
      const voiceService = VoiceService.getInstance();
      if (!voiceService) return;

      const isMuted = volumeLevels[memberId]?.muted ?? false;
      await voiceService.toggleMemberMute(memberId, !isMuted);
    },
    [volumeLevels]
  );

  // Memoize member rendering to prevent unnecessary recalculations
  const renderedMembers = useMemo(() => {
    // Filter out inactive or left members
    const activeMembers = members.filter(member =>
      member.is_active && member.status !== 'left'
    );

    if (!activeMembers.length) {
      return (
        <div className="flex h-full items-center justify-center">
          <span className="p-10 text-base text-[#282b2f]">nostalgia, onchain.</span>
        </div>
      );
    }

    // Sort members to ensure current user is first
    const sortedMembers = [...activeMembers].sort((a, b) => {
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;
      return 0;
    });

    logger.debug('Rendering member list', {
      component: 'MemberList',
      action: 'render',
      metadata: {
        totalMembers: members.length,
        activeMembers: activeMembers.length,
        sortedMembers,
      },
    });

    return sortedMembers.map((member) => {
      const isCurrentUser = member.id === currentUserId;
      const volumeState = volumeLevels[member.id];
      const isMuted = isCurrentUser ? storeIsMuted : (volumeState?.muted ?? false);
      const volumeLevel = volumeState?.level ?? 0;

      // Log member state for debugging
      logger.debug('Processing member state', {
        component: 'MemberList',
        action: 'processMemberState',
        metadata: {
          memberId: member.id,
          isCurrentUser,
          volumeLevel,
          isMuted,
          volumeState,
          memberStatus: member.status,
          isActive: member.is_active,
        },
      });

      // Start with the volume state's voice status or default to silent
      let voice_status: VoiceStatus = volumeState?.voice_status ?? 'silent';

      // Override voice status only for mute state
      if (isMuted) {
        voice_status = 'muted';
      }

      return (
        <div
          className="flex h-[48px] items-center border-t border-[#e5e5e5] px-6 transition-colors first:border-t-0 hover:bg-[#f5f5f5]"
          key={member.id}
        >
          {/* Column 1: Username section */}
          <div className="flex w-[140px] items-center gap-2 md:w-[440px]">
            {/* Voice status with volume indicator */}
            <div
              onClick={() => !isCurrentUser && handleVolumeClick(member.id)}

              className="relative -ml-5 cursor-pointer"
              title={isCurrentUser ? "Can't mute yourself" : isMuted ? 'Unmute user' : 'Mute user'}
            >
              <VoiceStatusIcon
                className="h-6 w-6 md:h-8 md:w-8"
                status={voice_status}
              />
            </div>

            {/* Avatar */}
            <div className="-ml-1 h-6 w-6 rounded-none md:h-8 md:w-8">
              <Image
                alt={member.name ?? 'Member'}
                height={32}
                src={member.avatar ?? AVATARS[0]!}
                unoptimized={true}
                width={32}
              />
            </div>

            {/* Name */}
            <span className="ml-1 flex-1 truncate text-base font-semibold text-[#282b2f] [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset] md:text-2xl">
              {member.name ?? 'Unknown'}
            </span>
          </div>

          {/* Game status */}
          <div className="ml-3 flex flex-1 items-center md:-ml-[35px]">
            {/* Game status icon */}
            <div className="-ml-2 mr-5 md:mr-2">
              <svg
                className="h-6 w-6 md:h-8 md:w-8"
                fill="#acd43b"
                viewBox="0 0 3000 3000"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M1215.59,42.59c404.31-17.99,672.29,420,455.24,769.24-193.36,311.12-655.35,315.58-851.66,6-204.49-322.48,12.81-758.17,396.42-775.24Z" />
                <path d="M2165.59,956.59c183.48-9.01,184.83,221.64,190.49,350.33,17.79,404.09,2.4,809.43,12,1214,2.5,105.19,10.31,288.29-94.24,349.92-38.25,22.55-102.62,29.46-146.86,35.14-99.53,12.79-200.19,23.62-300,34-69.02,7.18-145.2,17.33-213.9,20.1-171.11,6.89-271.76-164.73-351.91-290.25-218.29-341.85-406.95-701.94-617.53-1048.47-50.4-111.32,94.65-228.8,179.02-275.71,29.83-16.58,60.03-23.16,88-42,391.63-108.17,781.28-229.69,1174.92-331.08,26.43-6.81,52.47-14.63,80.02-15.98Z" />
              </svg>
            </div>
            <span className="ml-[4px] text-base font-semibold text-[#282b2f] [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset] md:ml-[75px] md:text-2xl">
              {member.game}
            </span>
          </div>
        </div>
      );
    });
  }, [members, currentUserId, volumeLevels, storeIsMuted, handleVolumeClick]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col">{renderedMembers}</div>
    </div>
  );
}
