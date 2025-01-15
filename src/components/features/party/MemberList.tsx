'use client';

import React, { memo } from 'react';
import { PartyMember } from '@/types';
import Image from 'next/image';

interface MemberListProps {
  members: PartyMember[];
  toggleMute: () => void;
  volumeLevels?: Record<string, number>;
  currentUserId?: string;
}

const MemberListItem = memo(function MemberListItem({
  member,
  volumeLevel,
  currentUserId,
  toggleMute,
  shouldDisplayBorder,
}: {
  member: PartyMember;
  volumeLevel: number;
  currentUserId?: string;
  toggleMute: () => void;
  shouldDisplayBorder: boolean;
}) {
  const getMicIcon = (member: PartyMember, volumeLevel: number) => {
    if (member.muted) {
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-[#282b2f]"
          fill="currentColor"
          data-testid="microphone-icon"
          data-volume="0"
        >
          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
        </svg>
      );
    }

    // No volume - much higher threshold for background noise (above your PC fan level of ~39)
    if (volumeLevel <= 45) {
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-[#282b2f]"
          fill="currentColor"
          data-testid="microphone-icon"
          data-volume="0"
        >
          <path d="M3 9v6h4l5 5V4L7 9H3z" />
        </svg>
      );
    }

    // Low volume - requires clear speech
    if (volumeLevel <= 65) {
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-[#282b2f]"
          fill="currentColor"
          data-testid="microphone-icon"
          data-volume="1"
        >
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
      );
    }

    // Medium volume - normal speaking voice
    if (volumeLevel <= 85) {
      return (
        <svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-[#282b2f]"
          fill="currentColor"
          data-testid="microphone-icon"
          data-volume="2"
        >
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM16 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
        </svg>
      );
    }

    // High volume (loud speaking/shouting)
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8 text-[#282b2f]"
        fill="currentColor"
        data-testid="microphone-icon"
        data-volume="3"
      >
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM16 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      </svg>
    );
  };

  return (
    <div
      className={`flex items-center px-2 py-0.5 ${
        shouldDisplayBorder ? 'border-t border-gray-400' : ''
      } shadow-[inset_0_-1px_2px_rgba(0,0,0,0.08),inset_0_1px_2px_rgba(255,255,255,0.08)]`}
    >
      <div className="-ml-7 flex w-[440px] items-center gap-1">
        <button
          onClick={toggleMute}
          className="ml-5 flex h-9 w-9 items-center justify-center text-[#161718] hover:text-gray-700"
          aria-label={member.muted ? 'Unmute' : 'Mute'}
          disabled={member.id !== currentUserId || !member.isActive}
        >
          {getMicIcon(member, volumeLevel)}
        </button>
        <div className="relative ml-1 h-8 w-8 overflow-hidden rounded-none bg-gray-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),_0_0_2px_rgba(255,255,255,0.5)]">
          <Image
            src={member.avatar || '/images/default-avatar.png'}
            alt={`${member.name || 'Anonymous'}'s avatar`}
            width={32}
            height={32}
            className="object-cover opacity-90 mix-blend-multiply"
          />
        </div>
        <span
          data-testid="member-name"
          className="flex-1 overflow-hidden truncate text-[1.35rem] font-medium leading-tight text-[#282b2f]"
        >
          {member.name || 'Anonymous'}
        </span>
      </div>
      <div className="ml-[-50px] flex w-[23px] items-center justify-center tracking-normal">
        <svg
          className="h-6 w-6"
          fill={member.isActive ? '#acd43b' : '#6B717D'}
          viewBox="0 0 3000 3000"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M1215.59,42.59c404.31-17.99,672.29,420,455.24,769.24-193.36,311.12-655.35,315.58-851.66,6-204.49-322.48,12.81-758.17,396.42-775.24Z" />
          <path d="M2165.59,956.59c183.48-9.01,184.83,221.64,190.49,350.33,17.79,404.09,2.4,809.43,12,1214,2.5,105.19,10.31,288.29-94.24,349.92-38.25,22.55-102.62,29.46-146.86,35.14-99.53,12.79-200.19,23.62-300,34-69.02,7.18-145.2,17.33-213.9,20.1-171.11,6.89-271.76-164.73-351.91-290.25-218.29-341.85-406.95-701.94-617.53-1048.47-50.4-111.32,94.65-228.8,179.02-275.71,29.83-16.58,60.03-23.16,88-42,391.63-108.17,781.28-229.69,1174.92-331.08,26.43-6.81,52.47-14.63,80.02-15.98Z" />
        </svg>
      </div>
      <div className="ml-[59px] flex flex-1 items-center">
        <span
          data-testid="member-game"
          className="truncate pl-2 text-left text-[1.35rem] font-medium leading-tight text-[#282b2f]"
        >
          {member.game || 'Not playing'}
        </span>
      </div>
    </div>
  );
});

MemberListItem.displayName = 'MemberListItem';

export const MemberList = memo(function MemberList({
  members,
  toggleMute,
  volumeLevels = {},
  currentUserId,
}: MemberListProps) {
  return (
    <div
      className="bubble-scrollbar max-h-[381px] overflow-y-auto"
      role="list"
      aria-label="Party members"
    >
      <div>
        {members.length === 0 ? (
          <div className="p-4 text-center text-[#282b2f]">No members in party</div>
        ) : (
          members.map((member, index) => (
            <div
              key={member.id}
              role="listitem"
              aria-label={`${member.name || 'Anonymous'} - ${member.game || 'Not playing'}`}
              tabIndex={0}
            >
              <MemberListItem
                member={member}
                volumeLevel={volumeLevels[member.id] || 0}
                currentUserId={currentUserId}
                toggleMute={toggleMute}
                shouldDisplayBorder={index !== 0}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
});

MemberList.displayName = 'MemberList';

export default MemberList;
