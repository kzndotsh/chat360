'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as Sentry from '@sentry/react';
import Image from 'next/image';
import { Mutex } from 'async-mutex';
import { Card } from '@/components/ui/card';
import { ModalManager } from '@/components/features/modals/ModalManager';
import { MemberList } from '@/components/features/party/MemberList';
import { PartyHeader } from '@/components/features/party/PartyHeader';
import { PartyControls } from '@/components/features/party/PartyControls';
import { usePartyState } from '@/lib/hooks/usePartyState';
import { useVoice } from '@/lib/hooks/useVoice';
import Clock from '@/components/features/party/Clock';
import { AVATARS, STATUSES } from '@/lib/config/constants';
import { useModalStore } from '@/lib/stores/useModalStore';
import { logger } from '@/lib/utils/logger';
import { useFormStore } from '@/lib/stores/useFormStore';
import { usePresence } from '@/lib/hooks/usePresence';

const LOG_CONTEXT = { component: 'PartyChat' };
const partyMutex = new Mutex(); // Single mutex instance for all critical operations

export function PartyChat() {
  const showModal = useModalStore((state) => state.showModal);
  const [isLeaving, setIsLeaving] = useState(false);
  const {
    currentUser,
    partyState,
    leaveParty,
    joinParty,
    editProfile,
  } = usePartyState();

  const { members: presenceMembers, initialize: initializePresence, cleanup: cleanupPresence } = usePresence();

  const {
    state,
    requestMicrophonePermission,
    toggleMute,
    volume,
    isMuted,
  } = useVoice({ currentUser, partyState, updatePresence: initializePresence });

  const micPermissionDenied = state.status === 'permission_denied';

  const volumeLevels = useMemo(() => ({ [currentUser?.id || '']: volume }), [currentUser?.id, volume]);

  // Create stable member list props to avoid unnecessary re-renders
  const memberListProps = useMemo(() => ({
    members: presenceMembers || [],
    currentUserId: currentUser?.id,
    volumeLevels,
    onToggleMute: toggleMute,
  }), [presenceMembers, currentUser?.id, volumeLevels, toggleMute]);

  const { resetForm } = useFormStore();
  const loggerRef = useRef(logger);

  useEffect(() => {
    let mounted = true;
    const abortController = new AbortController();
    const logger = loggerRef.current;

    // Add cleanup handler for page refresh/unload
    const handleBeforeUnload = () => {
      logger.info('Page unloading', {
        component: 'PartyChat',
        action: 'beforeunload'
      });
      localStorage.removeItem('lastUsedFormData');
      void cleanupPresence();
      resetForm();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    const init = async () => {
      // Acquire mutex for initialization
      const release = await partyMutex.acquire();
      try {
        if (!mounted) {
          release();
          return;
        }
        
        logger.info('Initializing component', {
          ...LOG_CONTEXT,
          action: 'init',
          metadata: { partyState, currentUser: !!currentUser }
        });

        // Show join modal for new sessions
        if (partyState === 'idle' && !currentUser) {
          showModal('join', {
            name: '',
            avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? AVATARS[0]!,
            game: STATUSES[0]!
          });
        }
        
        logger.info('Initialization complete', {
          ...LOG_CONTEXT,
          action: 'init'
        });
      } catch (error) {
        if (mounted) {
          logger.error('Initialization error', {
            ...LOG_CONTEXT,
            action: 'init',
            metadata: { error: error instanceof Error ? error.message : String(error) }
          });
          Sentry.captureException(error);
        }
      } finally {
        release();
      }
    };
    
    void init();
    
    return () => {
      mounted = false;
      abortController.abort();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      logger.info('Component unmounting', {
        action: 'useEffect: cleanup'
      });
      resetForm();
    };
  }, [showModal, currentUser, partyState, resetForm, cleanupPresence]);

  const handleJoinParty = useCallback(async (name: string, avatar: string, game: string) => {
    logger.debug('Starting party join', {
      action: 'handleJoinParty',
      metadata: { name, game }
    });

    try {
      // Request microphone permission first
      const micPermissionGranted = await requestMicrophonePermission();
      
      if (!micPermissionGranted) {
        logger.info('Proceeding without microphone access', {
          action: 'handleJoinParty'
        });
      }

      // Create new member
      const newMember = await joinParty(name, avatar, game);
      logger.debug('Created new member', {
        action: 'handleJoinParty',
        metadata: { memberId: newMember.id }
      });

      // Initialize presence
      await initializePresence(newMember);
      logger.debug('Initialized presence', {
        action: 'handleJoinParty',
        metadata: { memberId: newMember.id }
      });

      // Close modal
      const hideModal = useModalStore.getState().hideModal;
      hideModal();

      logger.debug('Successfully joined party', {
        action: 'handleJoinParty',
        metadata: { name, game, memberId: newMember.id }
      });
    } catch (err) {
      logger.error('Failed to join party', {
        action: 'handleJoinParty',
        metadata: { error: err }
      });
      throw err;
    }
  }, [initializePresence, joinParty, requestMicrophonePermission]);

  const handleEditProfile = useCallback(async (name: string, avatar: string, game: string) => {
    if (!currentUser?.id) {
      logger.error('Cannot edit profile - no current user', {
        ...LOG_CONTEXT,
        action: 'handleEditProfile',
        metadata: { currentUser },
      });
      return;
    }
    
    // Acquire mutex for profile edit
    const release = await partyMutex.acquire();
    try {
      logger.info('Updating profile', {
        ...LOG_CONTEXT,
        action: 'editProfile',
        metadata: {
          userId: currentUser.id,
          name,
          game,
        },
      });
      await editProfile(name, avatar, game);
    } catch (error) {
      logger.error('Failed to edit profile', {
        ...LOG_CONTEXT,
        action: 'handleEditProfile',
        metadata: { error },
      });
      throw error;
    } finally {
      release(); // Always release the mutex
    }
  }, [currentUser, editProfile]);

  const handleLeaveParty = useCallback(async () => {
    // Acquire mutex for leave operation
    const release = await partyMutex.acquire();
    try {
      setIsLeaving(true);
      await leaveParty();
      resetForm();
    } catch (error) {
      logger.error('Failed to leave party', {
        ...LOG_CONTEXT,
        action: 'handleLeaveParty',
        metadata: { error },
      });
    } finally {
      setIsLeaving(false);
      release(); // Always release the mutex
    }
  }, [leaveParty, resetForm]);

  const handleToggleMute = useCallback(async () => {
    logger.info('Toggling mute', {
      action: 'toggleMute',
      metadata: { currentUser }
    });
    try {
      await toggleMute();
      logger.info('Mute toggled successfully', {
        action: 'toggleMute',
        metadata: { currentUser }
      });
    } catch (error) {
      logger.error('Error toggling mute', {
        action: 'toggleMute',
        metadata: { error: error instanceof Error ? error.message : String(error) }
      });
      Sentry.captureException(error);
    }
  }, [toggleMute, currentUser]);

  // Force re-render when members change
  const memberListKey = useMemo(() => {
    if (!presenceMembers?.length) return 'empty';
    return presenceMembers
      .map(m => `${m.id}:${m._lastUpdate}:${m.voice_status}:${m.muted}:${m.game}`)
      .join('|');
  }, [presenceMembers]);

  // Log presence updates
  useEffect(() => {
    logger.info('Presence members updated in PartyChat', {
      component: 'PartyChat',
      action: 'presenceUpdate',
      metadata: {
        memberCount: presenceMembers?.length || 0,
        memberIds: presenceMembers?.map(m => m.id) || [],
        currentUserId: currentUser?.id,
        memberListKey
      }
    });
  }, [presenceMembers, currentUser?.id, memberListKey]);

  // Remove the presence initialization effect since we handle it in handleJoinParty
  useEffect(() => {
    if (!currentUser) return;

    // Only cleanup presence when leaving
    return () => {
      if (partyState === 'leaving' || partyState === 'idle') {
        // Acquire mutex for cleanup
        void partyMutex.runExclusive(async () => {
          try {
            await cleanupPresence();
          } catch (error) {
            logger.error('Failed to cleanup presence', {
              component: 'PartyChat',
              action: 'cleanupPresence',
              metadata: { error }
            });
          }
        });
      }
    };
  }, [currentUser, partyState, cleanupPresence]);

  return (
    <div className="z-20 mx-auto w-full max-w-[825px] overflow-hidden p-4 sm:p-6">
      <div className="mb-2 flex items-end justify-between">
        <h1 className="pl-[30px] text-lg text-white">$360</h1>
        {currentUser && (
          <button
            onClick={() => {
              logger.info('Opening edit modal', {
                action: 'openEditModal',
                metadata: {
                  currentUser
                }
              });
              showModal('profile', {
                name: currentUser?.name || '',
                avatar: currentUser?.avatar || AVATARS[0]!,
                game: currentUser?.game || ''
              });
            }}
            className="group flex flex-col items-center"
          >
            <Image
              src={currentUser?.avatar ?? AVATARS[0] ?? ''}
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

      <Card className="relative mb-0 h-[500px] overflow-hidden rounded-none border-0 bg-[#f0f0fa] text-[#161718] shadow-none">
        <PartyHeader membersCount={presenceMembers.length} />

        <div className="flex">
          <MemberList
            key={memberListKey}
            {...memberListProps}
          />
        </div>
      </Card>

      <PartyControls
        currentUser={currentUser}
        isLeaving={isLeaving}
        onLeave={handleLeaveParty}
        partyState={partyState}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        micPermissionDenied={micPermissionDenied}
        onRequestMicrophonePermission={requestMicrophonePermission}
      />

      <ModalManager
        onJoinParty={handleJoinParty}
        onEditProfile={handleEditProfile}
      />
    </div>
  );
}
