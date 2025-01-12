import { PartyMember } from '../types';
import Image from 'next/image';
import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react';

interface MemberListProps {
  members: PartyMember[];
  toggleMute: (id: string) => void;
  volumeLevels?: Record<string, number>;
  currentUserId?: string;
}

const MuteIcon = ({ muted, volumeLevel = 0 }: { muted: boolean; volumeLevel?: number }) => {
  const iconClass = "w-6 h-6 sm:w-8 sm:h-8";
  
  if (muted) {
    return <VolumeX className={iconClass} />;
  }
  
  return (
    <div className="relative">
      {volumeLevel === 0 ? (
        <Volume className={`${iconClass} text-[#161718]`} />
      ) : volumeLevel < 50 ? (
        <Volume1 className={`${iconClass} text-[#161718]`} />
      ) : (
        <Volume2 className={`${iconClass} text-[#161718]`} />
      )}
    </div>
  );
};

const MemberList = ({ members, toggleMute, volumeLevels = {}, currentUserId }: MemberListProps) => (
  <div className="max-h-[381px] overflow-y-auto">
    {members.map((member, index) => {
      const isNonEmpty = !member.id.startsWith('empty');
      const shouldDisplayBorder = isNonEmpty && index !== 0;
      const isCurrentUser = member.id === currentUserId;
      const memberVolumeLevel = volumeLevels[member.id] || 0;

      return (
        <div 
          key={member.id} 
          className={`flex items-center py-0.5 px-2 ${
            shouldDisplayBorder ? 'border-t border-gray-400' : ''
          } ${isNonEmpty ? 'shadow-[inset_0_-1px_2px_rgba(0,0,0,0.08),inset_0_1px_2px_rgba(255,255,255,0.08)]' : ''} 
          hover:bg-[#e0e0e0]`}
        >
          {/* Column 1: Usernames */}
          <div className="flex items-center gap-1 w-[202px] sm:w-[440px] -ml-7">
            <button 
              onClick={() => isNonEmpty && toggleMute(member.id)}
              className="text-[#161718] hover:text-gray-700 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center ml-5"
              aria-label={member.muted ? "Unmute" : "Mute"}
              disabled={!isCurrentUser}
            >
              {isNonEmpty && <MuteIcon muted={member.muted} volumeLevel={memberVolumeLevel} />}
            </button>
            {isNonEmpty ? (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-none relative overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),_0_0_2px_rgba(255,255,255,0.5)] bg-gray-200 ml-1">
                <Image 
                  src={member.avatar} 
                  alt={`${member.name}'s avatar`} 
                  width={28}
                  height={28}
                  className="w-7 h-7 sm:w-8 sm:h-8 object-cover opacity-90 mix-blend-multiply"
                />
              </div>
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8"></div>
            )}
            <span className="flex-1 text-[#282b2f] text-[1.2rem] sm:text-[1.35rem] font-medium leading-tight overflow-hidden">{member.name}</span>
          </div>
          
          {/* Column 2: Icons */}
          <div className="flex items-center justify-center w-[23px] ml-[-55px] sm:ml-[-50px] tracking-normal">
            {isNonEmpty && (
              <div className="flex items-center gap-2">
                <Image 
                  src="https://i.imgur.com/LCycgcq.png"
                  alt="Online Status"
                  width={18}
                  height={18}
                  className="sm:w-6 sm:h-6"
                />
              </div>
            )}
          </div>
          
          {/* Column 3: Statuses */}
          <div className="flex items-center flex-1 ml-[-38px] sm:ml-[59px]">
            <span className="text-[#282b2f] text-[1.2rem] sm:text-[1.35rem] text-left pl-2 font-medium leading-tight">{member.game}</span>
          </div>
        </div>
      );
    })}
  </div>
);

export default MemberList;