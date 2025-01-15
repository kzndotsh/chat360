'use client';

import { useState, useEffect } from 'react';
import * as Sentry from '@sentry/react';
import Image from 'next/image';
import { Clipboard } from 'lucide-react';
import { Card } from '@/components/ui/card';
import MemberList from '@/components/MemberList';
import { PartyHeader } from '@/components/PartyHeader';
import { PartyControls } from '@/components/PartyControls';
import { usePartyState } from '@/lib/hooks/usePartyState';
import Clock from '@/components/Clock';
import { BACKGROUND_VIDEO_URL } from '@/lib/constants';
import { logWithContext } from '@/lib/logger';
import { AVATARS } from '@/lib/constants';
import { useModalStore } from '@/lib/stores/useModalStore';
import { ModalManager } from '@/components/ModalManager';

export default function PartyChat() {
  const { showModal } = useModalStore();
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
    volumeLevels,
  } = usePartyState();

  useEffect(() => {
    logWithContext('PartyChat', 'useEffect: init', 'Component mounting');
    const init = async () => {
      try {
        await initialize();
        logWithContext('PartyChat', 'init', 'Initialization complete');
      } catch (error) {
        showModal('join');
        Sentry.captureException(error);
        logWithContext('PartyChat', 'init', `Initialization error: ${error}`);
      }
    };
    init();
    return () => {
      logWithContext('PartyChat', 'useEffect: cleanup', 'Component unmounting');
    };
  }, [initialize, showModal]);

  const handleJoinParty = async (username: string, avatar: string, status: string) => {
    logWithContext('PartyChat', 'handleJoinParty', `Attempt to join party as ${username}`);
    try {
      await joinParty(username, avatar, status);
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
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black">
        <div className="absolute inset-0 z-0">
          {videoError ? (
            <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black" />
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
              className="absolute left-1/2 top-1/2 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 transform object-cover"
              style={{ filter: 'blur(6px)' }}
            >
              <source
                src={BACKGROUND_VIDEO_URL}
                type="video/mp4"
              />
            </video>
          )}
        </div>

        <div className="absolute inset-0 z-10 bg-black opacity-55" />

        <div className="relative z-20 mx-auto w-full max-w-[825px] p-4 sm:p-6">
          <div className="mb-2 flex items-end justify-between">
            <h1 className="pl-[30px] text-lg text-white">$360</h1>
            <button
              onClick={() => {
                logWithContext(
                  'PartyChat',
                  'editProfile',
                  `Opening edit modal with data: ${JSON.stringify({
                    name: currentUser?.name || '',
                    avatar: currentUser?.avatar || storedAvatar || '',
                    status: currentUser?.game || '',
                  })}`
                );
                showModal('edit', {
                  name: currentUser?.name || '',
                  avatar: currentUser?.avatar || storedAvatar || '',
                  status: currentUser?.game || '',
                });
              }}
              className="group flex flex-col items-center"
            >
              <Image
                src={currentUser?.avatar ?? storedAvatar ?? AVATARS[0] ?? ''}
                alt="Profile"
                width={64}
                height={64}
                className="mb-1 h-[47px] w-[47px] object-cover transition-transform duration-200 ease-in-out group-hover:scale-110 group-hover:shadow-lg sm:h-[64px] sm:w-[64px]"
              />
              <div className="h-1 w-full scale-x-0 bg-white transition-transform duration-200 ease-in-out group-hover:scale-x-100" />
            </button>
            <div className="pr-[30px] text-right text-white">
              <span className="text-lg">
                <Clock />
              </span>
            </div>
          </div>

          <Card className="relative mb-2 aspect-[16/9.75] overflow-hidden rounded-none border-0 bg-[#f0f0fa] text-[#161718] shadow-none">
            <PartyHeader membersCount={members.length} />

            <div className="flex cursor-pointer items-center gap-2 bg-gradient-to-b from-[#70cc00] to-[#409202] py-[6px] pl-[30px] shadow-[inset_0_-2px_4px_rgba(0,0,0,0.1)] transition-all hover:brightness-110">
              <span className="text-[1.15rem] font-medium text-white">Copy CA</span>
              <Clipboard className="h-3.5 w-3.5 text-white" />
            </div>

            <div className="border-b border-gray-400 py-[6px] pl-[30px] text-[#282b2f] shadow-[inset_0_-2px_4px_rgba(0,0,0,0.08)]">
              <span className="text-[1.15rem] font-medium">Party Options: Party Chat</span>
            </div>

            <MemberList
              members={members}
              toggleMute={toggleMute}
              volumeLevels={volumeLevels}
              currentUserId={currentUser?.id}
            />
          </Card>

          <PartyControls
            currentUser={
              currentUser ? { ...currentUser, isActive: currentUser.isActive ?? false } : null
            }
            storedAvatar={storedAvatar}
            onJoin={() => showModal('join')}
            onLeave={handleLeaveParty}
            onToggleMute={handleToggleMute}
            onEdit={() =>
              showModal('edit', {
                name: currentUser?.name || '',
                avatar: currentUser?.avatar || storedAvatar || '',
                status: currentUser?.game || '',
              })
            }
            micPermissionDenied={micPermissionDenied}
            onRequestMicrophonePermission={requestMicrophonePermission}
            isMuted={isMuted}
            isConnected={isConnected}
          />
        </div>
      </div>

      <ModalManager
        onJoinParty={handleJoinParty}
        onEditProfile={handleEditProfile}
      />
    </>
  );
}
