'use client';

import Image from 'next/image';

import { useState, useEffect } from 'react';

import { Clipboard } from 'lucide-react';
import { Card } from '@/components/ui/card';

import { JoinPartyModal } from '@/components/JoinPartyModal';
import { XboxIntro } from '@/components/XboxIntro';

import MemberList from '@/components/MemberList';

import { PartyMember } from '@/types';

export default function PartyChat() {
  const [members, setMembers] = useState<PartyMember[]>([]);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [currentUser, setCurrentUser] = useState<PartyMember | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(true);
  const [storedAvatar, setStoredAvatar] = useState<string | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      setCurrentUser(user);
      setShowJoinModal(user.isActive === false);
      setStoredAvatar(user.avatar);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const toggleMute = (id: string) => {
    setMembers((prevMembers) =>
      prevMembers.map((member) =>
        member.id === id ? { ...member, muted: !member.muted } : member,
      ),
    );
    if (currentUser && currentUser.id === id) {
      setCurrentUser((prevUser) =>
        prevUser ? { ...prevUser, muted: !prevUser.muted } : null,
      );
    }
  };

  const handleJoinParty = (
    username: string,
    avatar: string,
    status: string,
  ) => {
    const storedUser = localStorage.getItem('currentUser');
    const newMember: PartyMember = storedUser
      ? { ...JSON.parse(storedUser), isActive: true }
      : {
          id: String(Date.now()),
          name: username,
          game: status,
          muted: false,
          avatar: avatar,
          isActive: true,
        };
    setCurrentUser(newMember);
    setMembers((prevMembers) => [
      newMember,
      ...prevMembers.filter((m) => m.id !== newMember.id),
    ]);
    localStorage.setItem('currentUser', JSON.stringify(newMember));
    setShowJoinModal(false);
  };

  const handleEditProfile = (
    username: string,
    avatar: string,
    status: string,
  ) => {
    if (currentUser) {
      const updatedUser = {
        ...currentUser,
        name: username,
        avatar,
        game: status,
      };
      setCurrentUser(updatedUser);
      setMembers((prevMembers) => [
        updatedUser,
        ...prevMembers.filter((m) => m.id !== updatedUser.id),
      ]);
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));
      setShowEditModal(false);
    }
  };

  const handleLeaveParty = () => {
    if (currentUser) {
      const userToStore = { ...currentUser, isActive: false };
      localStorage.setItem('currentUser', JSON.stringify(userToStore));
      setStoredAvatar(currentUser.avatar);
      setCurrentUser(null);
      setMembers([]);
    }
  };

  const handleToggleMute = () => {
    if (currentUser) {
      toggleMute(currentUser.id);
    }
  };

  const handleCancelEdit = () => {
    setShowEditModal(false);
  };

  const emptyRows = Array(Math.max(0, 7 - members.length))
    .fill(null)
    .map((_, index) => ({
      id: `empty-${index}`,
      name: '',
      game: '',
      muted: false,
      avatar: '',
    }));

  const allRows = [...members, ...emptyRows];

  if (showIntro) {
    return (
      <XboxIntro
        onIntroEnd={() => {
          setShowIntro(false);
        }}
      />
    );
  }

  return (
    <>
      <div className='min-h-screen relative flex items-center justify-center bg-black tracking-wide overflow-hidden'>
        {/* Video Background */}
        <div className='absolute inset-0 z-0'>
          <video
            autoPlay
            loop
            muted
            playsInline
            className='absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto object-cover'
            style={{ filter: 'blur(6px)' }}>
            <source
              src='https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bg%20vid-IrN6ZDtoQMHnThmO35MvmafQ4ccLAo.mp4'
              type='video/mp4'
            />
            Your browser does not support the video tag.
          </video>
        </div>

        {/* Overlay to darken the video */}
        <div className='absolute inset-0 bg-black opacity-55 z-10'></div>

        <div className='relative z-20 w-full max-w-[825px] mx-auto p-4 sm:p-6'>
          {/* Header */}
          <div className='flex items-end justify-between mb-2'>
            <h1 className='text-lg text-white pl-[30px]'>$360</h1>
            <button
              onClick={() => setShowEditModal(true)}
              className='flex flex-col items-center justify-center group'>
              <img
                src={currentUser?.avatar || storedAvatar || '/placeholder.svg'}
                alt='Profile'
                className='w-[47px] h-[47px] sm:w-[64px] sm:h-[64px] object-cover mb-1 transition-transform duration-200 ease-in-out group-hover:scale-110 group-hover:shadow-lg'
              />
              <div className='w-full h-1 bg-white scale-x-0 group-hover:scale-x-100 transition-transform duration-200 ease-in-out'></div>
            </button>
            <div className='text-right text-white pr-[30px]'>
              <span className='text-lg'>
                {currentTime.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>

          <Card className='bg-[#f0f0fa] border-0 mb-2 rounded-none relative overflow-hidden shadow-none text-[#161718] aspect-[16/9.75]'>
            {/* Party Header */}
            <div className='flex flex-col shadow-[0_2px_4px_rgba(0,0,0,0.05)]'>
              {/* Top section with Chat360 Party */}
              <div className='flex flex-col sm:flex-row'>
                <div className='flex h-[40px] sm:h-[40px] order-1 sm:order-2 sm:w-[423px]'>
                  <button
                    onClick={() => console.log('New tab clicked')}
                    className='flex items-center justify-center w-full sm:w-[141px] h-full bg-[#57606f] relative hover:bg-[#4a515f] transition-colors cursor-pointer'>
                    <div className='absolute inset-0 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.05)]'></div>
                    <div className='absolute left-0 top-0 bottom-0 w-[1px] bg-[#4a515f]/50'></div>
                    <div className='absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-black/5 to-transparent'></div>
                    <Image
                      src='https://hebbkx1anhila5yf.public.blob.vercel-storage.com/green%20icon-GhlPeEt8S3QFR39zGujrpQpHiz8JOa.png'
                      alt='i Icon'
                      width={20}
                      height={20}
                      className='brightness-0 invert'
                    />
                    <span className='text-white text-sm'>{members.length}</span>
                  </button>
                  <button
                    onClick={() => console.log('Pill button clicked')}
                    className='flex items-center justify-center w-full sm:w-[141px] h-full bg-[#57606f] relative hover:bg-[#4a515f] transition-colors cursor-pointer'>
                    <div className='absolute inset-0 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.05)]'></div>
                    <div className='absolute left-0 top-0 bottom-0 w-[1px] bg-[#4a515f]/50'></div>
                    <div className='absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-black/5 to-transparent'></div>
                    <Image
                      src='https://hebbkx1anhila5yf.public.blob.vercel-storage.com/bar-chart-Pmw7SVWQeYPUfOVRPVABZu4LM3MwsS.png'
                      alt='Bar Chart Icon'
                      width={23}
                      height={23}
                      className='opacity-100 flex items-center justify-center brightness-0 invert'
                    />
                  </button>
                  <button
                    onClick={() => console.log('X button clicked')}
                    className='flex items-center justify-center w-full sm:w-[141px] h-full bg-[#57606f] relative hover:bg-[#4a515f] transition-colors cursor-pointer'>
                    <div className='absolute inset-0 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.05)]'></div>
                    <div className='absolute left-0 top-0 bottom-0 w-[1px] bg-[#4a515f]/50'></div>
                    <div className='absolute left-0 top-0 bottom-0 w-5 bg-gradient-to-r from-black/5 to-transparent'></div>
                    <div className='absolute right-0 top-0 bottom-0 w-5 bg-gradient-to-l from-black/5 to-transparent'></div>
                    <Image
                      src='https://hebbkx1anhila5yf.public.blob.vercel-storage.com/x%20PNG-1wTavcIcgPwf8agzEo05eifKT89DHI.png'
                      alt='X Icon'
                      width={23}
                      height={23}
                      className='opacity-100 flex items-center justify-center'
                    />
                  </button>
                </div>
                <div className='flex-1 bg-[#f0f0fa] h-[40px] flex items-center justify-center sm:justify-start sm:items-end order-2 sm:order-1'>
                  <div className='flex items-center gap-2 mt-1 sm:mt-0 sm:mb-1 pl-[30px] w-full'>
                    <Image
                      src='https://hebbkx1anhila5yf.public.blob.vercel-storage.com/group%20icon-IXQUDYzJvGIdRD706igHFYwnayY9Qj.png'
                      alt='Group Icon'
                      width={28}
                      height={28}
                      className='opacity-100'
                    />
                    <span className='text-lg sm:text-xl font-medium text-[#282b2f]'>
                      Chat360 Party
                    </span>
                  </div>
                </div>
              </div>
              {/* Extended white section below */}
              <div className='h-[10px] bg-[#f0f0fa] border-b border-gray-200'></div>
            </div>

            {/* Invite Button */}
            <div className='bg-gradient-to-b from-[#70cc00] to-[#409202] py-[6px] pl-[30px] cursor-pointer hover:brightness-110 transition-all flex items-center gap-2 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)]'>
              <span className='font-medium text-[1.15rem] text-white'>
                Copy CA
              </span>
              <Clipboard className='w-3.5 h-3.5 text-white' />
            </div>

            {/* Party Options */}
            <div className='py-[6px] pl-[30px] text-[#282b2f] border-b border-gray-400 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.08)]'>
              <span className='font-medium text-[1.15rem]'>
                Party Options: Party Chat
              </span>
            </div>

            {/* Member List */}
            <MemberList
              members={allRows}
              toggleMute={toggleMute}
            />

          </Card>

          {/* Bottom Controls */}
          <div className='flex flex-wrap items-center gap-1 sm:gap-2 text-sm sm:text-base mt-1 px-[30px]'>
            <button
              onClick={() => setShowJoinModal(true)}
              className={`flex items-center gap-0 sm:gap-2 transition-opacity ${
                currentUser?.isActive
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:opacity-80'
              }`}
              disabled={currentUser?.isActive}>
              <div className='w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#55b611] flex items-center justify-center text-white font-bold text-[8px] sm:text-[10px]'>
                A
              </div>
              <span className='text-white ml-[-3px]'>Join Party</span>
            </button>
            <button
              onClick={handleLeaveParty}
              className={`flex items-center gap-0 sm:gap-2 transition-opacity ${
                !currentUser
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:opacity-80'
              }`}
              disabled={!currentUser}>
              <div className='w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#ae1228] flex items-center justify-center text-white font-bold text-[8px] sm:text-[10px]'>
                B
              </div>
              <span className='text-white ml-[-3px]'>Leave Party</span>
            </button>
            <button
              onClick={handleToggleMute}
              className={`flex items-center gap-0 sm:gap-2 transition-opacity ${
                !currentUser
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:opacity-80'
              }`}
              disabled={!currentUser}>
              <div className='w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#0c71ba] flex items-center justify-center text-white font-bold text-[8px] sm:text-[10px]'>
                X
              </div>
              <span className='text-white ml-[-3px]'>
                {currentUser?.muted ? 'Unmute Mic' : 'Mute Mic'}
              </span>
            </button>
            <button
              onClick={() => setShowEditModal(true)}
              className={`flex items-center gap-0 sm:gap-2 transition-opacity ${
                !currentUser && !storedAvatar
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:opacity-80'
              }`}
              disabled={!currentUser && !storedAvatar}>
              <div className='w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-[#e09a23] flex items-center justify-center text-white font-bold text-[8px] sm:text-[10px]'>
                Y
              </div>
              <span className='text-white ml-[-3px]'>Edit Profile</span>
            </button>
          </div>
        </div>
      </div>
      
      {showJoinModal && (
        <JoinPartyModal
          onJoin={handleJoinParty}
          initialData={
            currentUser
              ? {
                  username: currentUser.name,
                  avatar: currentUser.avatar,
                  status: currentUser.game,
                }
              : undefined
          }
        />
      )}
      {showEditModal && (
        <JoinPartyModal
          onJoin={handleEditProfile}
          onCancel={handleCancelEdit}
          initialData={
            currentUser
              ? {
                  username: currentUser.name,
                  avatar: currentUser.avatar,
                  status: currentUser.game,
                }
              : undefined
          }
          isEditMode={true}
        />
      )}
      <style
        jsx
        global>{`
        .bubble-scrollbar {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .bubble-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .bubble-scrollbar {
          position: relative;
        }
        .bubble-scrollbar {
          height: 381px;
        }
        ::selection {
          background-color: #3a7b10;
        }
        .group:hover .group-hover\:scale-110 {
          transform: scale(1.1);
        }
        .group:hover .group-hover\:scale-x-100 {
          transform: scaleX(1);
        }
      `}</style>
    </>
  );
}
