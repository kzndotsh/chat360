'use client';

import { VoiceStatusIcon } from '@/components/features/party/icons/VoiceStatusIcon';
import { PartyMember } from '@/lib/types/party';
import Image from 'next/image';
import { logger } from '@/lib/utils/logger';

interface MemberListProps {
  members: PartyMember[];
  currentUserId?: string;
  volumeLevels?: Record<string, number>;
  onToggleMute?: (id: string) => void;
}

export function MemberList({ members, currentUserId, volumeLevels = {}, onToggleMute }: MemberListProps) {
  if (!members?.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground p-10">No members in party</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white/5">
      <div className="flex flex-col">
        {members.map((member, index) => {
          const isCurrentUser = member.id === currentUserId;
          const volumeLevel = volumeLevels[member.id] || 0;

          logger.debug('Rendering member', {
            component: 'MemberList',
            action: 'renderMember',
            metadata: {
              member,
              isCurrentUser,
              volumeLevel,
            },
          });

          return (
            <div
              key={member.id}
              className={`flex h-12 items-center px-4 hover:bg-white/5 transition-colors ${
                index !== 0 ? 'border-t border-white/20' : ''
              }`}
            >
              {/* Column 1: Username section */}
              <div className="flex w-[440px] items-center gap-1">
                {/* Voice status */}
                <div className="-ml-4">
                  <VoiceStatusIcon 
                    status={member.voice_status || 'silent'} 
                    volumeLevel={volumeLevels[member.id] || 0}
                    className="h-5 w-5"
                  />
                </div>

                {/* Avatar */}
                <div className="h-7 w-7 overflow-hidden">
                  <Image
                    src={member.avatar}
                    alt={member.name}
                    width={30}
                    height={30}
                    className="object-cover"
                  />
                </div>

                {/* Name */}
                <span className="ml-2 flex-1 font-mediumt text-xl text-[#282b2f]">
                  {member.name}
                </span>
              </div>

              {/* Game status */}
              <div className="flex flex-1 items-center -ml-[60px]">
                {/* Game status icon */}
                <div className="mr-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 3000 3000"
                    className="h-7 w-7"
                    fill="#acd43b"
                  >
                    <path d="M1215.59,42.59c404.31-17.99,672.29,420,455.24,769.24-193.36,311.12-655.35,315.58-851.66,6-204.49-322.48,12.81-758.17,396.42-775.24Z" />
                    <path d="M2165.59,956.59c183.48-9.01,184.83,221.64,190.49,350.33,17.79,404.09,2.4,809.43,12,1214,2.5,105.19,10.31,288.29-94.24,349.92-38.25,22.55-102.62,29.46-146.86,35.14-99.53,12.79-200.19,23.62-300,34-69.02,7.18-145.2,17.33-213.9,20.1-171.11,6.89-271.76-164.73-351.91-290.25-218.29-341.85-406.95-701.94-617.53-1048.47-50.4-111.32,94.65-228.8,179.02-275.71,29.83-16.58,60.03-23.16,88-42,391.63-108.17,781.28-229.69,1174.92-331.08,26.43-6.81,52.47-14.63,80.02-15.98Z" />
                  </svg>
                </div>
                <span className="ml-[75px] text-xl text-[#282b2f] font-[600]">
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
