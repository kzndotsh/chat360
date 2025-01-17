'use client';

import { memo, useRef } from 'react';
import Image from 'next/image';
import type { PartyMember } from '@/lib/types/party';
import { UserGroupIcon } from '@/components/features/party/icons/UserGroupIcon';
import {
  IoVolumeMuteSharp,
  IoVolumeLowSharp,
  IoVolumeMediumSharp,
  IoVolumeHighSharp,
} from 'react-icons/io5';
import { logger } from '@/lib/utils/logger';

export interface MemberListProps {
  members: PartyMember[];
  toggleMute: (id: string) => void;
  volumeLevels: Record<string, number>;
  currentUserId?: string;
}

function MemberListComponent({
  members,
  toggleMute,
  volumeLevels,
  currentUserId,
}: MemberListProps) {
  const loggerRef = useRef(logger);

  const getMicIcon = (member: PartyMember, volumeLevel: number) => {
    if (member.voice_status === 'muted') {
      return <IoVolumeMuteSharp className="h-8 w-8 text-[#282b2f]" />;
    }

    // No volume - much higher threshold for background noise
    if (volumeLevel <= 45) {
      return <IoVolumeLowSharp className="h-8 w-8 text-[#282b2f]" />;
    }

    // Low volume - requires clear speech
    if (volumeLevel <= 65) {
      return <IoVolumeMediumSharp className="h-8 w-8 text-[#282b2f]" />;
    }

    // Medium/High volume
    return <IoVolumeHighSharp className="h-8 w-8 text-[#282b2f]" />;
  };

  if (members.length === 0) {
    loggerRef.current.debug('No members in party', {
      component: 'MemberList',
      action: 'render',
      metadata: { membersCount: 0 },
    });
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No members in party</p>
      </div>
    );
  }

  const handleMuteToggle = (memberId: string) => {
    const member = members.find((m) => m.id === memberId);
    loggerRef.current.info('Toggling member mute', {
      component: 'MemberList',
      action: 'toggleMute',
      metadata: {
        memberId,
        memberName: member?.name,
        currentVoiceStatus: member?.voice_status,
        isCurrentUser: memberId === currentUserId,
      },
    });
    toggleMute(memberId);
  };

  return (
    <div className="bubble-scrollbar max-h-[381px] overflow-y-auto">
      <div>
        {members.map((member, index) => {
          const isCurrentUser = member.id === currentUserId;
          const volumeLevel = volumeLevels[member.id] || 0;
          const shouldDisplayBorder = index !== 0;

          return (
            <div
              key={member.id}
              className={`flex items-center px-2 py-0.5 ${
                shouldDisplayBorder ? 'border-t border-gray-400' : ''
              } shadow-[inset_0_-1px_2px_rgba(0,0,0,0.08),inset_0_1px_2px_rgba(255,255,255,0.08)]`}
            >
              {/* Column 1: Username section */}
              <div className="-ml-7 flex w-[440px] items-center gap-1">
                <button
                  onClick={() => handleMuteToggle(member.id)}
                  className="ml-5 flex h-9 w-9 items-center justify-center text-[#161718] hover:text-gray-700"
                  aria-label={member.voice_status === 'muted' ? 'Unmute' : 'Mute'}
                  disabled={!isCurrentUser}
                >
                  {getMicIcon(member, volumeLevel)}
                </button>
                <div className="relative ml-1 h-8 w-8 overflow-hidden rounded-none bg-gray-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),_0_0_2px_rgba(255,255,255,0.5)]">
                  <Image
                    src={member.avatar || 'https://i.imgur.com/LCycgcq.png'}
                    alt={`${member.name}'s avatar`}
                    width={32}
                    height={32}
                    className="object-cover opacity-90 mix-blend-multiply"
                    unoptimized
                  />
                </div>
                <span className="flex-1 overflow-hidden text-[1.35rem] font-medium leading-tight text-[#282b2f]">
                  {member.name}
                </span>
              </div>

              {/* Column 2: Status icon */}
              <div className="ml-[-50px] flex w-[23px] items-center justify-center tracking-normal">
                <UserGroupIcon className="h-6 w-6" />
              </div>

              {/* Column 3: Game status */}
              <div className="ml-[59px] flex flex-1 items-center">
                <span className="pl-2 text-left text-[1.35rem] font-medium leading-tight text-[#282b2f]">
                  {member.game}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const MemberList = memo(MemberListComponent);
MemberList.displayName = 'MemberList';
