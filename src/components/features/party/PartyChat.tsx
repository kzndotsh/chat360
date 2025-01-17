'use client';

import React, { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { ModalManager } from '@/components/features/modals/ModalManager';
import { MemberList } from '@/components/features/party/MemberList';
import { PartyHeader } from '@/components/features/party/PartyHeader';
import { PartyControls } from '@/components/features/party/PartyControls';
import { usePartyState } from '@/lib/hooks/usePartyState';
import Clock from '@/components/features/party/Clock';
import { BACKGROUND_VIDEO_URL } from '@/lib/config/constants';
import { useModalStore } from '@/lib/stores/useModalStore';
import { logger } from '@/lib/utils/logger';
import { useVoice } from '@/lib/hooks/useVoice';

export function PartyChat() {
  // 1. External store hooks
  const showModal = useModalStore((state) => state.showModal);
  const {
    currentUser,
    members,
    partyState,
    leaveParty,
    joinParty: joinPartyState,
    editProfile,
  } = usePartyState();
  const { isMuted, toggleMute, micPermissionDenied, requestMicrophonePermission } = useVoice();
  const isLeaving = partyState === 'leaving';

  // 2. State hooks
  const [videoError, setVideoError] = useState(false);

  // 3. Refs
  const loggerRef = useRef(logger);

  // 4. Callbacks
  const handleJoinParty = useCallback(
    async (username: string, avatar: string, game: string) => {
      // Only allow join if not already in party
      if (partyState !== 'idle') {
        loggerRef.current.debug('Join blocked - party state not idle', {
          component: 'PartyChat',
          action: 'joinParty',
          metadata: { partyState },
        });
        return;
      }

      // Request microphone permissions BEFORE joining
      try {
        await requestMicrophonePermission();
        logger.info('Microphone permission granted, proceeding with party join', {
          component: 'PartyChat',
          action: 'joinParty'
        });
      } catch (voiceError) {
        logger.error('Failed to get microphone permission', {
          component: 'PartyChat',
          action: 'joinParty',
          metadata: { error: voiceError },
        });
        // Continue with party join even if voice fails
      }

      await joinPartyState(username, avatar, game);
    },
    [partyState, joinPartyState, requestMicrophonePermission]
  );

  const handleEditProfile = useCallback(
    async (username: string, avatar: string, game: string) => {
      if (!currentUser) {
        loggerRef.current.error('Edit profile failed - no current user', {
          component: 'PartyChat',
          action: 'editProfile',
        });
        throw new Error('Please join the party before editing your profile');
      }

      try {
        loggerRef.current.info('Starting profile edit', {
          component: 'PartyChat',
          action: 'editProfile',
          metadata: { username, avatar, game },
        });

        await editProfile(username, avatar, game);

        loggerRef.current.info('Successfully edited profile', {
          component: 'PartyChat',
          action: 'editProfile',
        });
      } catch (error) {
        loggerRef.current.error('Failed to edit profile', {
          component: 'PartyChat',
          action: 'editProfile',
          metadata: { error: error instanceof Error ? error : new Error(String(error)) },
        });
        throw error;
      }
    },
    [currentUser, editProfile]
  );

  const handleLeaveParty = useCallback(async () => {
    if (isLeaving) return;

    try {
      loggerRef.current.info('Starting party leave sequence', {
        component: 'PartyChat',
        action: 'leaveParty',
      });

      await leaveParty();

      loggerRef.current.info('Successfully completed party leave sequence', {
        component: 'PartyChat',
        action: 'leaveParty',
      });
    } catch (error) {
      loggerRef.current.error('Failed to leave party', {
        component: 'PartyChat',
        action: 'leaveParty',
        metadata: { error: error instanceof Error ? error : new Error(String(error)) },
      });
      throw error;
    }
  }, [leaveParty, isLeaving]);

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black"
      data-testid="party-chat"
    >
      <div className="absolute inset-0 z-0">
        {videoError ? (
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black" />
        ) : (
          <video
            id="xbox-bg"
            autoPlay
            loop
            muted
            playsInline
            src={BACKGROUND_VIDEO_URL}
            className="absolute left-1/2 top-1/2 min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 transform object-cover"
            style={{ filter: 'blur(6px)' }}
            onError={() => {
              setVideoError(true);
              loggerRef.current.error('Video playback error', {
                component: 'PartyChat',
                action: 'videoPlayback',
                metadata: {
                  elementId: 'xbox-bg',
                  url: BACKGROUND_VIDEO_URL,
                  videoElement: document.getElementById('xbox-bg')?.outerHTML,
                },
              });
            }}
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
          {currentUser && (
            <button
              onClick={() => {
                loggerRef.current.info('Opening edit modal', {
                  action: 'openEditModal',
                  metadata: {
                    currentUser,
                  },
                });
                showModal('profile', {
                  name: currentUser.name,
                  avatar: currentUser.avatar || 'https://i.imgur.com/LCycgcq.png',
                  game: currentUser.game || 'Offline'
                });
              }}
              className="group flex flex-col items-center"
            >
              <Image
                src={currentUser.avatar || 'https://i.imgur.com/LCycgcq.png'}
                alt="Profile"
                width={64}
                height={64}
                className="mb-1 h-[47px] w-[47px] object-cover transition-transform duration-200 ease-in-out group-hover:scale-110 group-hover:shadow-lg sm:h-[64px] sm:w-[64px]"
              />
              <div className="h-1 w-full scale-x-0 bg-white transition-transform duration-200 ease-in-out group-hover:scale-x-100" />
            </button>
          )}
          <div className="pr-[30px] text-right text-white">
            <span className="text-lg">
              <Clock />
            </span>
          </div>
        </div>

        <Card className="relative mb-0 aspect-[16/9.75] overflow-hidden rounded-none border-0 bg-[#f0f0fa] text-[#161718] shadow-none">
          <PartyHeader membersCount={members.length} />

          <div className="flex-1">
            <MemberList
              members={members}
              currentUserId={currentUser?.id}
            />
          </div>
        </Card>

        <PartyControls
          currentUser={currentUser}
          isLeaving={isLeaving}
          onLeave={handleLeaveParty}
          partyState={partyState}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          micPermissionDenied={micPermissionDenied}
          onRequestMicrophonePermission={requestMicrophonePermission}
        />

        <ModalManager
          onJoinParty={handleJoinParty}
          onEditProfile={handleEditProfile}
        />
      </div>
    </div>
  );
}
