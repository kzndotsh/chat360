'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Sentry from '@sentry/react';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { ModalManager } from '@/components/features/modals/ModalManager';
import { MemberList } from '@/components/features/party/MemberList';
import { PartyHeader } from '@/components/features/party/PartyHeader';
import { PartyControls } from '@/components/features/party/PartyControls';
import { usePartyState } from '@/lib/hooks/usePartyState';
import Clock from '@/components/features/party/Clock';
import { BACKGROUND_VIDEO_URL, AVATARS } from '@/lib/config/constants';
import { useModalStore } from '@/lib/stores/useModalStore';
import { logger } from '@/lib/utils/logger';
import { useFormStore } from '@/lib/stores/useFormStore';

export function PartyChat() {
  const showModal = useModalStore((state) => state.showModal);
  const [videoError, setVideoError] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const {
    members,
    currentUser,
    storedAvatar,
    isMuted,
    micPermissionDenied,
    volumeLevels,
    joinParty,
    leaveParty,
    editProfile,
    toggleMute,
    initialize,
    requestMicrophonePermission,
  } = usePartyState();

  const { resetForm } = useFormStore();

  const loggerRef = useRef(logger);

  useEffect(() => {
    let mounted = true;
    const abortController = new AbortController();
    const logger = loggerRef.current;

    const init = async () => {
      try {
        if (!mounted || !currentUser) return;

        if (logger) {
          logger.info('Initializing component', {
            action: 'init',
          });
        }

        await initialize();

        if (mounted && logger) {
          logger.info('Initialization complete', {
            action: 'init',
          });
        }
      } catch (error) {
        if (mounted && logger) {
          logger.error('Initialization error', {
            action: 'init',
            metadata: { error: error as Error },
          });
        }
        Sentry.captureException(error);
        showModal('join');
      }
    };

    init();

    return () => {
      mounted = false;
      abortController.abort();
      if (logger) {
        logger.info('Component unmounting', {
          action: 'useEffect: cleanup',
        });
      }
      resetForm();
    };
  }, [initialize, showModal, currentUser, resetForm]);

  const handleJoinParty = useCallback(
    async (username: string, avatar: string, game: string) => {
      logger.info('Attempting to join party', {
        action: 'joinParty',
        metadata: { username, avatar, game },
      });

      try {
        await joinParty(username, avatar, game);
        logger.info('Successfully joined party', {
          action: 'joinParty',
          metadata: { username },
        });
      } catch (error) {
        logger.error('Failed to join party', {
          action: 'joinParty',
          metadata: { error: error instanceof Error ? error : new Error(String(error)) },
        });
        throw error;
      }
    },
    [joinParty]
  );

  const handleEditProfile = useCallback(
    async (username: string, avatar: string, game: string) => {
      logger.info('Attempting to edit profile', {
        action: 'editProfile',
        metadata: { username, avatar, game },
      });

      try {
        await editProfile(username, avatar, game);
        logger.info('Successfully edited profile', {
          action: 'editProfile',
          metadata: { username },
        });
      } catch (error) {
        logger.error('Failed to edit profile', {
          action: 'editProfile',
          metadata: { error: error instanceof Error ? error : new Error(String(error)) },
        });
        throw error;
      }
    },
    [editProfile]
  );

  const handleLeaveParty = useCallback(async () => {
    logger.info('Attempting to leave party', { action: 'leaveParty' });

    try {
      setIsLeaving(true);
      await leaveParty();
      logger.info('Successfully left party', { action: 'leaveParty' });
    } catch (error) {
      logger.error('Failed to leave party', {
        action: 'leaveParty',
        metadata: { error: error instanceof Error ? error : new Error(String(error)) },
      });
      throw error;
    } finally {
      setIsLeaving(false);
    }
  }, [leaveParty]);

  const handleToggleMute = useCallback(async () => {
    logger.info('Toggling mute', {
      action: 'toggleMute',
      metadata: { currentUser },
    });
    try {
      await toggleMute();
      logger.info('Mute toggled successfully', {
        action: 'toggleMute',
        metadata: { currentUser },
      });
    } catch (error) {
      logger.error('Error toggling mute', {
        action: 'toggleMute',
        metadata: { error: error as Error },
      });
      Sentry.captureException(error);
    }
  }, [toggleMute, currentUser]);

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
              logger.error('Video playback error', {
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
          <button
            onClick={() => {
              logger.info('Opening edit modal', {
                action: 'openEditModal',
                metadata: {
                  currentUser,
                  storedAvatar,
                },
              });
              showModal('edit', {
                name: currentUser?.name || '',
                avatar: currentUser?.avatar || storedAvatar || AVATARS[0],
                game: currentUser?.game || '',
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

        <Card className="relative mb-0 aspect-[16/9.75] overflow-hidden rounded-none border-0 bg-[#f0f0fa] text-[#161718] shadow-none">
          <PartyHeader membersCount={members.length} />
          <div className="flex-1">
            <MemberList
              members={members}
              currentUserId={currentUser?.id}
              volumeLevels={volumeLevels}
              toggleMute={() => handleToggleMute()}
            />
          </div>
        </Card>

        <PartyControls
          currentUser={currentUser}
          isLeaving={isLeaving}
          isMuted={isMuted}
          micPermissionDenied={micPermissionDenied}
          onJoin={async (name, avatar, game) => {
            await handleJoinParty(name, avatar, game);
          }}
          onLeave={handleLeaveParty}
          onToggleMute={handleToggleMute}
          onRequestMicrophonePermission={requestMicrophonePermission}
        />
      </div>

      <ModalManager
        onJoinParty={handleJoinParty}
        onEditProfile={handleEditProfile}
      />
    </div>
  );
}
