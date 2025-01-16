'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
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

export function PartyChat() {
  // 1. External store hooks
  const showModal = useModalStore((state) => state.showModal);

  // 2. State hooks
  const [videoError, setVideoError] = useState(false);

  // 3. Refs
  const loggerRef = useRef(logger);

  // 4. Custom hooks
  const {
    members,
    currentUser,
    isInitializing,
    partyState,
    modalLocked,
    joinParty,
    leaveParty,
    editProfile,
  } = usePartyState();

  // Track if we just left the party to prevent auto-showing modal
  const [justLeft, setJustLeft] = useState(false);

  // 5. Callbacks
  const handleJoinParty = useCallback(
    async (username: string, avatar: string, game: string) => {
      loggerRef.current.info('Attempting to join party', {
        action: 'joinParty',
        metadata: { username, avatar, game },
      });

      try {
        await joinParty(username, avatar, game);
        loggerRef.current.info('Successfully joined party', {
          action: 'joinParty',
          metadata: { username },
        });
      } catch (error) {
        loggerRef.current.error('Failed to join party', {
          action: 'joinParty',
          metadata: { error: error instanceof Error ? error : new Error(String(error)) },
        });
        throw error;
      }
    },
    [joinParty]
  );

  const handleLeaveParty = useCallback(async () => {
    loggerRef.current.info('Attempting to leave party', { action: 'leaveParty' });

    try {
      setJustLeft(true);
      await leaveParty();
      loggerRef.current.info('Successfully left party', { action: 'leaveParty' });
    } catch (error) {
      loggerRef.current.error('Failed to leave party', {
        action: 'leaveParty',
        metadata: { error: error instanceof Error ? error : new Error(String(error)) },
      });
      throw error;
    }
  }, [leaveParty]);

  const handleToggleMute = useCallback(async () => {
    return Promise.resolve();
  }, []);

  const handleRequestMicrophonePermission = useCallback(async () => {
    return Promise.resolve(false);
  }, []);

  const handleEditProfile = useCallback(
    async (username: string, avatar: string, game: string) => {
      loggerRef.current.info('Attempting to edit profile', {
        action: 'editProfile',
        metadata: { username, avatar, game },
      });

      try {
        await editProfile(username, avatar, game);
        loggerRef.current.info('Successfully edited profile', {
          action: 'editProfile',
          metadata: { username },
        });
      } catch (error) {
        loggerRef.current.error('Failed to edit profile', {
          action: 'editProfile',
          metadata: { error: error instanceof Error ? error : new Error(String(error)) },
        });
        throw error;
      }
    },
    [editProfile]
  );

  useEffect(() => {
    // Only show join modal on initial load, not after leaving
    if (!currentUser && !isInitializing && partyState !== 'leaving' && !modalLocked && !justLeft) {
      showModal('join');
    }
  }, [currentUser, showModal, isInitializing, partyState, modalLocked, justLeft]);

  // Reset justLeft when currentUser changes to true
  useEffect(() => {
    if (currentUser) {
      setJustLeft(false);
    }
  }, [currentUser]);

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
                action: 'videoPlayback',
                metadata: { elementId: 'xbox-bg', url: BACKGROUND_VIDEO_URL },
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
                showModal('edit');
              }}
              className="group flex flex-col items-center"
            >
              <Image
                src={currentUser.avatar}
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
              toggleMute={handleToggleMute}
            />
          </div>
        </Card>

        <PartyControls
          currentUser={currentUser}
          isLeaving={partyState === 'leaving'}
          isMuted={false}
          onJoin={handleJoinParty}
          onLeave={handleLeaveParty}
          onToggleMute={handleToggleMute}
          onRequestMicrophonePermission={handleRequestMicrophonePermission}
        />

        <ModalManager
          onJoinParty={handleJoinParty}
          onEditProfile={handleEditProfile}
        />
      </div>
    </div>
  );
}
