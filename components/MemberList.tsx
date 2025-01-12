import { PartyMember } from '../types';
import Image from 'next/image';

interface MemberListProps {
  members: PartyMember[];
  toggleMute: (id: string) => void;
}

const MuteIcon = ({ muted }: { muted: boolean }) => (
  muted ? (
    <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-8 sm:h-8" fill="currentColor">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-8 sm:h-8" fill="currentColor">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
    </svg>
  )
);

const MemberList = ({ members, toggleMute }: MemberListProps) => (
  <div className="max-h-[381px] overflow-y-auto">
    {members.map((member, index) => {
      const isNonEmpty = !member.id.startsWith('empty');
      const shouldDisplayBorder = isNonEmpty && index !== 0;

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
            >
              {isNonEmpty && <MuteIcon muted={member.muted} />}
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
              <Image 
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/green%20icon-XjjUFdqXahFTv2EYOcDDsGu3PO5Ol6.png"
                alt="Online Status"
                width={18}
                height={18}
                className="sm:w-6 sm:h-6"
              />
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