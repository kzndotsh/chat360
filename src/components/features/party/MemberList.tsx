'use client';

import type { MemberListProps } from '@/lib/types/components/props';

import { useMemo, useCallback } from 'react';

import Image from 'next/image';

import { VoiceStatusIcon } from '@/components/features/party/icons/VoiceStatusIcon';

import { AVATARS } from '@/lib/constants';
import { useToast } from '@/lib/hooks/use-toast';
import { VoiceService } from '@/lib/services/voiceService';
import { usePartyStore } from '@/lib/stores/partyStore';

export function MemberList({ members, currentUserId, volumeLevels = {} }: MemberListProps) {
  const {
    voice: { isMuted: storeIsMuted },
  } = usePartyStore();
  const { toast } = useToast();

  // Handle muting/unmuting other users
  const handleOtherMemberMute = useCallback(async (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    const volumeState = volumeLevels[memberId];
    const isMuted = volumeState?.muted ?? false;

    const voiceService = await VoiceService.createInstance();
    await voiceService.toggleMemberMute(memberId);

    toast({
      description: `${member?.name ?? 'User'} ${!isMuted ? 'muted' : 'unmuted'}`,
      duration: 1000,
    });
  }, [members, volumeLevels, toast]);

  // Handle self mute toggle - use store state as single source of truth
  const handleSelfMute = useCallback(async () => {
    const voiceService = await VoiceService.createInstance();
    await voiceService.toggleMute();
  }, []);

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

    // Sort members to ensure current user is first
    const sortedMembers = [...activeMembers].sort((a, b) => {
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;
      return 0;
    });

    return sortedMembers.map((member, index) => {
      const isCurrentUser = member.id === currentUserId;
      const volumeState = volumeLevels[member.id];

      // For current user: only use store state
      // For other users: use volume state with fallback
      const isMuted = isCurrentUser
        ? storeIsMuted
        : volumeState?.muted ?? false;

      // Use voice status directly from volume state, with fallback to silent
      const voice_status = volumeState?.voice_status ?? 'silent';

      return (
        <div
          style={{
            animationDelay: `${50 + index * 25}ms`,
            animationFillMode: 'forwards'
          }}

          aria-label={`${member.name} - ${member.game} - ${voice_status}`}
          className="flex h-[48px] items-center border-t border-[#e5e5e5] px-3 sm:px-6 transition-all duration-200 ease-out first:border-t-0 hover:bg-[#f5f5f5] opacity-0 animate-fadeIn"
          key={member.id}
          role="listitem"
        >
          <div className="flex w-[140px] items-center gap-1.5 sm:gap-2 md:w-[440px]">
            <button
              onClick={() => isCurrentUser ? handleSelfMute() : handleOtherMemberMute(member.id)}

              aria-label={isCurrentUser ? (isMuted ? 'Unmute yourself' : 'Mute yourself') : (isMuted ? 'Unmute user' : 'Mute user')}
              className="relative -ml-2 sm:-ml-5 cursor-pointer transition-transform duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              disabled={isCurrentUser}
              title={isCurrentUser ? (isMuted ? 'Can\'t unmute yourself' : 'Can\'t mute yourself') : (isMuted ? 'Unmute user' : 'Mute user')}
            >
              <VoiceStatusIcon
                className="h-6 w-6 md:h-8 md:w-8"
                isOtherUser={!isCurrentUser}
                status={voice_status}
              />
            </button>

            {/* Avatar */}
            <div
              aria-label={`${member.name}'s avatar`}
              className="h-6 w-6 rounded-none md:h-8 md:w-8 transition-transform duration-200"
              role="img"
            >
              <Image
                alt={member.name ?? 'Member'}
                className="transition-opacity duration-200"
                height={32}
                src={member.avatar ?? AVATARS[0]!}
                unoptimized={true}
                width={32}
              />
            </div>

            {/* Name */}
            <span className="flex-1 truncate text-base font-semibold text-[#282b2f] [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset] md:text-2xl transition-colors duration-200">
              {member.name ?? 'Unknown'}
            </span>
          </div>

          {/* Game status */}
          <div className="flex flex-1 items-center min-w-0 justify-start sm:ml-3 md:-ml-[35px] transition-transform duration-200">
            {/* Game status icon */}
            <div
              aria-label="Game status icon"
              className="flex-shrink-0 flex items-center mr-2 sm:mr-5 md:mr-2"
              role="img"
            >
              <svg
                aria-hidden="true"
                className="h-6 w-6 md:h-8 md:w-8 transition-colors duration-200"
                fill="#acd43b"
                viewBox="0 0 3000 3000"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M1215.59,42.59c404.31-17.99,672.29,420,455.24,769.24-193.36,311.12-655.35,315.58-851.66,6-204.49-322.48,12.81-758.17,396.42-775.24Z" />
                <path d="M2165.59,956.59c183.48-9.01,184.83,221.64,190.49,350.33,17.79,404.09,2.4,809.43,12,1214,2.5,105.19,10.31,288.29-94.24,349.92-38.25,22.55-102.62,29.46-146.86,35.14-99.53,12.79-200.19,23.62-300,34-69.02,7.18-145.2,17.33-213.9,20.1-171.11,6.89-271.76-164.73-351.91-290.25-218.29-341.85-406.95-701.94-617.53-1048.47-50.4-111.32,94.65-228.8,179.02-275.71,29.83-16.58,60.03-23.16,88-42,391.63-108.17,781.28-229.69,1174.92-331.08,26.43-6.81,52.47-14.63,80.02-15.98Z" />
              </svg>
            </div>
            <div className="flex items-center min-w-0 flex-1">
              <span className="truncate text-base font-semibold text-[#282b2f] [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset] md:ml-[75px] md:text-2xl transition-colors duration-200">
                {member.game}
              </span>
            </div>
          </div>
        </div>
      );
    });
  }, [currentUserId, members, volumeLevels, storeIsMuted, handleOtherMemberMute, handleSelfMute]);

  return (
    <div
      aria-label="Party members"
      className="flex h-full flex-col"
      role="list"
    >
      <div className="flex flex-1 flex-col">{renderedMembers}</div>
    </div>
  );
}
