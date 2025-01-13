import { memo } from 'react';
import { PartyMember } from '../types';
import Image from 'next/image';
import { Volume, Volume1, VolumeX } from 'lucide-react';
import MicIcon from './MicIcon';

interface MemberListProps {
  members: PartyMember[];
  toggleMute: (id: string) => void;
  volumeLevels?: Record<string, number>;
  currentUserId?: string;
}

const MemberList = memo(({ members, toggleMute, volumeLevels = {}, currentUserId }: MemberListProps) => {
  console.log('Rendering Members:', members); // Debug log for entire members array
  
  return (
    <div className="max-h-[381px] overflow-y-auto">
      {members.map((member) => {
        const isCurrentUser = member.id === currentUserId;
        const shouldDisplayBorder = member.id !== (members[0]?.id ?? '');
        const volumeLevel = volumeLevels[member.id] || 0;

        console.log(`Member: ${member.name}, Muted: ${member.muted}, Volume: ${volumeLevel}`); // Debug for each member

        return (
          <div 
            key={member.id} 
            className={`flex items-center py-0.5 px-2 ${
              shouldDisplayBorder ? 'border-t border-gray-400' : ''
            } hover:bg-[#e0e0e0]`}
          >
            {/* Column 1: Usernames */}
            <div className="flex items-center gap-1 w-[202px] sm:w-[440px] -ml-7">
              <button 
                onClick={() => {
                  console.log(`Toggling mute for: ${member.name}`); // Debug log before toggling
                  toggleMute(member.id);
                }}
                aria-label={member.muted ? "Unmute" : "Mute"}
                disabled={!isCurrentUser}
              >
                <MicIcon muted={member.muted} volumeLevel={volumeLevel} />
              </button>
              <div className="w-7 h-7 sm:w-8 sm:h-8 ml-1 relative overflow-hidden">
                <Image 
                  src={member.avatar} 
                  alt={`${member.name}'s avatar`} 
                  width={28}
                  height={28}
                  className="object-cover opacity-90"
                />
              </div>
              <span className="flex-1">{member.name}</span>
            </div>
            
            {/* Column 2: Icons */}
            <div className="flex items-center justify-center w-[23px] ml-[-55px] sm:ml-[-50px] tracking-normal">
              <div className="flex items-center gap-2">
                <Image
                  src="https://i.imgur.com/LCycgcq.png"
                  alt="Online Status"
                  width={18}
                  height={18}
                  className="sm:w-6 sm:h-6"
                />
              </div>
            </div>
            
            {/* Column 3: Statuses */}
            <div className="flex items-center flex-1 ml-[-38px] sm:ml-[59px]">
              <span className="text-[#282b2f] text-[1.2rem] sm:text-[1.35rem] text-left pl-2 font-medium leading-tight">
                {member.game}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

MemberList.displayName = 'MemberList';

export default MemberList;