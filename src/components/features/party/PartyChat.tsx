'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Card } from '@/components/ui/card';
import { ModalManager } from '@/components/features/modals/ModalManager';
import { MemberList } from '@/components/features/party/MemberList';
import { PartyHeader } from '@/components/features/party/PartyHeader';
import { PartyControls } from '@/components/features/party/PartyControls';
import { usePartyState } from '@/lib/hooks/usePartyState';
import { useVoiceChat } from '@/lib/hooks/useVoiceChat';
import Clock from '@/components/features/party/Clock';
import { BACKGROUND_VIDEO_URL } from '@/lib/config/constants';
import { useModalStore } from '@/lib/stores/useModalStore';
import { logger } from '@/lib/utils/logger';
import { usePresence } from '@/lib/hooks/usePresence';

export function PartyChat() {
  // 1. External store hooks
  const showModal = useModalStore((state) => state.showModal);
  const { volumeLevels, toggleMute: onToggleMute, disconnect } = useVoiceChat();
  const {
    currentUser,
    members,
    partyState,
    leaveParty,
    joinParty: joinPartyState,
    isInitializing,
    modalLocked,
    editProfile,
  } = usePartyState();
  const { initialize: initializePresence } = usePresence();
  const isLeaving = partyState === 'leaving';

  // 2. State hooks
  const [videoError, setVideoError] = useState(false);
  const [justLeft, setJustLeft] = useState(false);
  const [joinInProgress, setJoinInProgress] = useState(false);

  // 3. Refs
  const loggerRef = useRef(logger);
  const joinStateRef = useRef({
    isJoining: false,
    hasJoined: false,
  });

  // 4. Effects
  useEffect(() => {
    // Only show join modal on initial load, not after leaving
    if (
      !currentUser &&
      !isInitializing &&
      !modalLocked &&
      !justLeft &&
      !joinInProgress &&
      !joinStateRef.current.isJoining &&
      !joinStateRef.current.hasJoined &&
      partyState !== 'leaving' &&
      partyState !== 'joined' &&
      partyState !== 'joining'
    ) {
      const timeoutId = setTimeout(() => {
        // Double check state before showing modal
        if (joinStateRef.current.hasJoined || joinStateRef.current.isJoining) return;

        loggerRef.current.debug('Showing join modal', {
          component: 'PartyChat',
          action: 'showJoinModal',
          metadata: {
            isInitializing,
            partyState,
            modalLocked,
            justLeft,
            joinInProgress,
            joinState: joinStateRef.current,
          },
        });
        showModal('join');
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [currentUser, showModal, isInitializing, partyState, modalLocked, justLeft, joinInProgress]);

  // Reset states when currentUser changes
  useEffect(() => {
    if (currentUser) {
      loggerRef.current.debug('Resetting join states', {
        component: 'PartyChat',
        action: 'resetStates',
        metadata: { currentUser },
      });
      setJustLeft(false);
      joinStateRef.current = {
        isJoining: false,
        hasJoined: true,
      };
    }
  }, [currentUser]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      joinStateRef.current = {
        isJoining: false,
        hasJoined: false,
      };
    };
  }, []);

  // 5. Callbacks
  const handleJoinParty = useCallback(
    async (username: string, avatar: string, game: string) => {
      if (joinInProgress || joinStateRef.current.isJoining) return;

      setJoinInProgress(true);
      joinStateRef.current.isJoining = true;

      loggerRef.current.info('Attempting to join party', {
        component: 'PartyChat',
        action: 'joinParty',
        metadata: { username, avatar, game },
      });

      try {
        await joinPartyState(username, avatar, game);
        joinStateRef.current.hasJoined = true;
        loggerRef.current.info('Successfully joined party', {
          component: 'PartyChat',
          action: 'joinParty',
          metadata: { username },
        });
      } catch (error) {
        loggerRef.current.error('Failed to join party', {
          component: 'PartyChat',
          action: 'joinParty',
          metadata: { error: error instanceof Error ? error : new Error(String(error)) },
        });
        throw error;
      } finally {
        setJoinInProgress(false);
        joinStateRef.current.isJoining = false;
      }
    },
    [joinPartyState, joinInProgress]
  );

  const handleEditProfile = useCallback(
    async (username: string, avatar: string, game: string) => {
      loggerRef.current.info('Attempting to edit profile', {
        action: 'editProfile',
        metadata: { username, avatar, game },
      });

      try {
        // Ensure avatar is not empty
        const validAvatar = avatar || 'https://i.imgur.com/LCycgcq.png'; // Default avatar

        // First update the profile in the database
        await editProfile(username, validAvatar, game);

        // Then update presence state if we're in a party
        if (currentUser && partyState === 'joined') {
          try {
            await initializePresence({
              ...currentUser,
              name: username,
              avatar: validAvatar,
              game: game,
              last_seen: new Date().toISOString(),
            });
          } catch (presenceError) {
            loggerRef.current.error('Failed to update presence after profile edit', {
              action: 'editProfile',
              metadata: {
                error:
                  presenceError instanceof Error ? presenceError : new Error(String(presenceError)),
              },
            });
            // Don't throw here, as the profile update was successful
          }
        }

        loggerRef.current.info('Successfully edited profile', {
          action: 'editProfile',
          metadata: { username, avatar: validAvatar },
        });
      } catch (error) {
        loggerRef.current.error('Failed to edit profile', {
          action: 'editProfile',
          metadata: { error: error instanceof Error ? error : new Error(String(error)) },
        });
        throw error;
      }
    },
    [editProfile, currentUser, partyState, initializePresence]
  );

  const handleLeaveParty = useCallback(async () => {
    if (isLeaving) {
      loggerRef.current.warn('Leave already in progress, ignoring request', {
        component: 'PartyChat',
        action: 'leaveParty',
      });
      return;
    }

    try {
      loggerRef.current.info('Starting party leave sequence', {
        component: 'PartyChat',
        action: 'leaveParty',
      });

      // Set justLeft to prevent auto-rejoin
      setJustLeft(true);

      // Reset join states
      joinStateRef.current = {
        isJoining: false,
        hasJoined: false,
      };

      // First disconnect from voice chat
      try {
        await disconnect();
      } catch (voiceError) {
        // Log but continue with party leave
        loggerRef.current.error('Failed to disconnect from voice chat', {
          component: 'PartyChat',
          action: 'disconnect',
          metadata: {
            error: voiceError instanceof Error ? voiceError : new Error(String(voiceError)),
          },
        });
      }

      // Then leave party
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
      // Reset justLeft on error
      setJustLeft(false);
      throw error;
    }
  }, [disconnect, leaveParty, isLeaving]);

  // Additional effects that depend on callbacks
  useEffect(() => {
    // Any effects that depend on callbacks should go here
  }, [handleJoinParty, handleEditProfile, handleLeaveParty]);

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
                showModal('edit');
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
              toggleMute={onToggleMute}
              volumeLevels={volumeLevels}
            />
          </div>
        </Card>

        <PartyControls
          currentUser={currentUser}
          isLeaving={isLeaving}
          onLeave={handleLeaveParty}
          partyState={partyState}
        />

        <ModalManager
          onJoinParty={handleJoinParty}
          onEditProfile={handleEditProfile}
        />
      </div>
    </div>
  );
}
