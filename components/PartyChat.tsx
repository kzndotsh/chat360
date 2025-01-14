'use client';

import { useState, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import Image from 'next/image';
import { Clipboard } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { NewUserModal } from '@/components/NewUserModal';  // Adjust import path
import { EditProfileModal } from '@/components/EditProfileModal';  // Adjust import path
import MemberList from '@/components/MemberList';
import { PartyHeader } from '@/components/PartyHeader';
import { PartyControls } from '@/components/PartyControls';
import { usePartyState } from '@/lib/hooks/usePartyState';
import Clock from '@/components/Clock';
import { BACKGROUND_VIDEO_URL } from '@/lib/constants';
import { logWithContext } from '@/lib/logger';
import { AVATARS } from '@/lib/constants';
import { ModalPortal } from '@/components/ModalPortal';

export default function PartyChat() {
  const [showEditModal, setShowEditModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const {
    members,
    currentUser,
    storedAvatar,
    isMuted,
    toggleMute,
    joinParty,
    editProfile,
    leaveParty,
    isConnected,
    initialize,
    micPermissionDenied,
    requestMicrophonePermission,
  } = usePartyState();

  useEffect(() => {
    logWithContext('PartyChat', 'useEffect: init', 'Component mounting');
    const init = async () => {
      try {
        await initialize();
        logWithContext('PartyChat', 'init', 'Initialization complete');
      } catch (error) {
        setShowJoinModal(true);
        Sentry.captureException(error);
        logWithContext('PartyChat', 'init', `Initialization error: ${error}`);
      }
    };
    init();
    return () => {
      logWithContext('PartyChat', 'useEffect: cleanup', 'Component unmounting');
    };
  }, [initialize]);

  useEffect(() => {
    return () => {
      setShowEditModal(false);
      setShowJoinModal(false);
    };
  }, []);

  const handleJoinParty = async (username: string, avatar: string, status: string) => {
    logWithContext('PartyChat', 'handleJoinParty', `Attempt to join party as ${username}`);
    try {
      await joinParty(username, avatar, status);
      setShowJoinModal(false);
      logWithContext('PartyChat', 'handleJoinParty', `Joined party as ${username}`);
    } catch (error) {
      Sentry.captureException(error);
      logWithContext('PartyChat', 'handleJoinParty', `Join party error: ${error}`);
    }
  };

  const handleEditProfile = async (username: string, avatar: string, status: string) => {
    logWithContext('PartyChat', 'handleEditProfile', `Attempt to edit profile for ${username}`);
    try {
      await editProfile(username, avatar, status);
      setShowEditModal(false);
      logWithContext('PartyChat', 'handleEditProfile', `Profile edited for ${username}`);
    } catch (error) {
      Sentry.captureException(error);
      logWithContext('PartyChat', 'handleEditProfile', `Edit profile error: ${error}`);
    }
  };

  const handleLeaveParty = async () => {
    logWithContext('PartyChat', 'handleLeaveParty', 'Attempting to leave party');
    try {
      await leaveParty();
      logWithContext('PartyChat', 'handleLeaveParty', 'Left party');
    } catch (error) {
      Sentry.captureException(error);
      logWithContext('PartyChat', 'handleLeaveParty', `Leave party error: ${error}`);
    }
  };

  const handleToggleMute = async () => {
    logWithContext('PartyChat', 'handleToggleMute', 'Attempting to toggle mute');
    try {
      if (currentUser?.id) {
        await toggleMute();
        logWithContext('PartyChat', 'handleToggleMute', `Toggled mute for ${currentUser.name}`);
      }
    } catch (error) {
      Sentry.captureException(error);
      logWithContext('PartyChat', 'handleToggleMute', `Toggle mute error: ${error}`);
    }
  };

  return (
    <>
      <div className='min-h-screen relative flex items-center justify-center bg-black overflow-hidden'>
        <div className='absolute inset-0 z-0'>
          {videoError ? (
            <div className='absolute inset-0 bg-gradient-to-b from-gray-900 to-black' />
          ) : (
            <video
              autoPlay
              loop
              muted
              playsInline
              onError={() => {
                setVideoError(true);
                logWithContext('PartyChat', 'video', 'Video error encountered');
              }}
              className='absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full object-cover'
              style={{ filter: 'blur(6px)' }}>
              <source src={BACKGROUND_VIDEO_URL} type='video/mp4' />
            </video>
          )}
        </div>

        <div className='absolute inset-0 bg-black opacity-55 z-10' />

        <div className='relative z-20 w-full max-w-[825px] mx-auto p-4 sm:p-6'>
          <div className='flex items-end justify-between mb-2'>
            <h1 className='text-lg text-white pl-[30px]'>$360</h1>
            <button
              onClick={() => setShowEditModal(true)}
              className='flex flex-col items-center group'>
              <Image
                src={currentUser?.avatar ?? storedAvatar ?? AVATARS[0] ?? ''}
                alt='Profile'
                width={64}
                height={64}
                className='w-[47px] h-[47px] sm:w-[64px] sm:h-[64px] object-cover mb-1 transition-transform duration-200 ease-in-out group-hover:scale-110 group-hover:shadow-lg'
              />
              <div className='w-full h-1 bg-white scale-x-0 group-hover:scale-x-100 transition-transform duration-200 ease-in-out' />
            </button>
            <div className='text-right text-white pr-[30px]'>
              <span className='text-lg'>
                <Clock />
              </span>
            </div>
          </div>

          <Card className='bg-[#f0f0fa] border-0 mb-2 rounded-none relative overflow-hidden shadow-none text-[#161718] aspect-[16/9.75]'>
            <PartyHeader membersCount={members.length} />

            <div className='bg-gradient-to-b from-[#70cc00] to-[#409202] py-[6px] pl-[30px] cursor-pointer hover:brightness-110 transition-all flex items-center gap-2 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)]'>
              <span className='font-medium text-[1.15rem] text-white'>Copy CA</span>
              <Clipboard className='w-3.5 h-3.5 text-white' />
            </div>

            <div className='py-[6px] pl-[30px] text-[#282b2f] border-b border-gray-400 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.08)]'>
              <span className='font-medium text-[1.15rem]'>Party Options: Party Chat</span>
            </div>

            <MemberList
              members={members}
              toggleMute={toggleMute}
              volumeLevels={{}}
              currentUserId={currentUser?.id}
            />
          </Card>

          <PartyControls
            currentUser={
              currentUser
                ? { ...currentUser, isActive: currentUser.isActive ?? false }
                : null
            }
            storedAvatar={storedAvatar}
            onJoin={() => setShowJoinModal(true)}
            onLeave={handleLeaveParty}
            onToggleMute={handleToggleMute}
            onEdit={() => setShowEditModal(true)}
            micPermissionDenied={micPermissionDenied}
            onRequestMicrophonePermission={requestMicrophonePermission}
            isMuted={isMuted}
            isConnected={isConnected}
          />
        </div>
      </div>

      {showJoinModal && (
        <ModalPortal>
          <NewUserModal
            key={`join-modal-${Date.now()}`}
            onJoin={handleJoinParty}
            onCancel={() => setShowJoinModal(false)}
          />
        </ModalPortal>
      )}

      {showEditModal && (
        <EditProfileModal
          onSubmit={handleEditProfile}
          onCancel={() => setShowEditModal(false)}
          initialData={currentUser ? {
            name: currentUser.name,
            avatar: currentUser.avatar,
            status: currentUser.game,
          } : undefined}
        />
      )}
    </>
  );
}