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
import { PartyMember } from '@/lib/types/party';

const LOG_CONTEXT = { component: 'PartyChat' };
const partyMutex = new Mutex(); // Single mutex instance for all critical operations

export function PartyChat() {
  const showModal = useModalStore((state) => state.showModal);
  const [isLeaving, setIsLeaving] = useState(false);
  const [unjoinedMembers, setUnjoinedMembers] = useState<PartyMember[]>([]);
  const [memberVolumes, setMemberVolumes] = useState<Record<string, number>>({});

  const {
    currentUser,
    partyState,
    leaveParty,
    joinParty,
    editProfile,
  } = usePartyState();

  const {
    members: presenceMembers,
    initialize: initializePresence,
    cleanup: cleanupPresence,
    getMembers
  } = usePresence();

  const {
    state,
    requestMicrophonePermission,
    toggleMute,
    volume,
    isMuted,
    isSpeaking,
  } = useVoice({ currentUser, partyState, updatePresence: initializePresence });

  const micPermissionDenied = state.status === 'permission_denied';

  // Effect to update remote users' volume levels
  useEffect(() => {
    const members = partyState === 'idle' ? unjoinedMembers : presenceMembers;
    const newVolumes: Record<string, number> = {};
    
    members?.forEach(member => {
      if (member.id === currentUser?.id) {
        // Current user's volume is handled separately
        return;
      }
      
      // For remote users who are muted or not in voice chat, set volume to 0
      if (member.muted || member.voice_status === 'muted') {
        newVolumes[member.id] = 0;
      }
      // For remote users who are speaking, set a default volume
      else if (member.voice_status === 'speaking') {
        newVolumes[member.id] = 50;
      }
      // For silent users
      else {
        newVolumes[member.id] = 0;
      }
    });

    setMemberVolumes(prev => {
      // Only update if values have changed
      const hasChanges = Object.entries(newVolumes).some(
        ([id, vol]) => prev[id] !== vol || 
        // Also check if any members were removed
        Object.keys(prev).some(prevId => !newVolumes[prevId])
      );
      return hasChanges ? newVolumes : prev;
    });
  }, [partyState, unjoinedMembers, presenceMembers, currentUser?.id]);

  // Update volume levels for all members including current user
  const volumeLevels = useMemo(() => {
    const volumes = { ...memberVolumes };
    // Add current user's volume
    if (currentUser?.id) {
      volumes[currentUser.id] = volume;
    }
    return volumes;
  }, [currentUser?.id, volume, memberVolumes]);

  // Add effect to get members when not joined with proper cleanup
  useEffect(() => {
    let mounted = true;
    let interval: number | null = null;

    const fetchMembers = async () => {
      if (partyState === 'idle') {
        const members = await getMembers();
        if (mounted) {
          setUnjoinedMembers(members);
        }
      }
    };

    void fetchMembers();

    if (partyState === 'idle') {
      interval = window.setInterval(fetchMembers, 5000);
    }

    return () => {
      mounted = false;
      if (interval) {
        window.clearInterval(interval);
      }
    };
  }, [partyState, getMembers]);

  // Log presence updates without causing remounts
  useEffect(() => {
    if (!presenceMembers) return;

    logger.info('Presence members updated in PartyChat', {
      component: 'PartyChat',
      action: 'presenceUpdate',
      metadata: {
        memberCount: presenceMembers?.length || 0,
        memberIds: presenceMembers?.map(m => m.id) || [],
        currentUserId: currentUser?.id,
      }
    });
  }, [presenceMembers, currentUser?.id]);

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
      metadata: { name, game, avatar }
    });

    try {
      // Request microphone permission first
      const micPermissionGranted = await requestMicrophonePermission();
      
      if (!micPermissionGranted) {
        logger.info('Proceeding without microphone access', {
          action: 'handleJoinParty'
        });
      }

      // Create member object first with initial voice state
      const member: PartyMember = {
        id: crypto.randomUUID(),
        name,
        avatar,
        game,
        is_active: true,
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        // Default to silent/muted until we confirm audio is working
        voice_status: micPermissionGranted ? 'silent' : 'muted',
        muted: !micPermissionGranted,
        deafened_users: [],
        _lastUpdate: Date.now(),
        _lastVoiceUpdate: Date.now()
      };

      // Join party with member info
      await joinParty(name, game, avatar);

      // Wait a short time for audio track to initialize
      if (micPermissionGranted) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Increased delay for better audio initialization
      }

      // Now check volume after audio is initialized
      // Use a higher threshold to reduce status flapping
      const initialVoiceStatus = micPermissionGranted ? 
        (volume > 45 ? 'speaking' : 'silent') :
        'muted';

      // Initialize presence with full member object including voice state
      await initializePresence({
        ...member,
        voice_status: initialVoiceStatus,
        muted: !micPermissionGranted,
        _lastVoiceUpdate: Date.now()
      });

      // Force an update of member volumes to trigger initial render
      setMemberVolumes(prev => ({
        ...prev,
        [member.id]: volume
      }));

      logger.debug('Successfully joined party', {
        action: 'handleJoinParty',
        metadata: { 
          name, 
          game, 
          avatar, 
          memberId: member.id,
          voiceState: {
            voice_status: initialVoiceStatus,
            muted: !micPermissionGranted,
            micPermissionGranted,
            volume
          }
        }
      });

      // Close modal
      const hideModal = useModalStore.getState().hideModal;
      hideModal();

    } catch (err) {
      logger.error('Failed to join party', {
        action: 'handleJoinParty',
        metadata: { error: err }
      });
      throw err;
    }
  }, [initializePresence, joinParty, requestMicrophonePermission, volume]);

  const handleEditProfile = useCallback(async (name: string, avatar: string, game: string) => {
    logger.info('Updating profile', {
      ...LOG_CONTEXT,
      action: 'editProfile',
      metadata: { userId: currentUser?.id, name, game }
    });

    await editProfile(name, avatar, game);
  }, [currentUser, editProfile]);

  const handleLeaveParty = useCallback(async () => {
    // Acquire mutex for leave operation
    const release = await partyMutex.acquire();
    try {
      setIsLeaving(true);
      
      // First cleanup presence to ensure proper state sync
      await cleanupPresence();
      
      // Then leave party and reset form
      await leaveParty();
      resetForm();
      
      // Clear any lingering states
      setUnjoinedMembers([]);
      setMemberVolumes({});
      
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
  }, [leaveParty, resetForm, cleanupPresence]);

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

  // Memoize the member list props to prevent unnecessary re-renders
  const memberListProps = useMemo(() => {
    const members = partyState === 'joined' ? presenceMembers : unjoinedMembers;
    const stableMembers = members?.map(member => {
      const isCurrentUser = member.id === currentUser?.id;
      
      // For current user, use the volume from useVoice hook
      const memberVolume = isCurrentUser ? volume : volumeLevels[member.id] || 0;
      
      // For current user, respect the voice status from presence
      // but update it based on volume for immediate feedback
      let voice_status = member.voice_status || 'silent';
      if (isCurrentUser) {
        if (isMuted) {
          voice_status = 'muted';
        } else {
          // Use isSpeaking state for immediate feedback
          voice_status = isSpeaking ? 'speaking' : 'silent';
        }
      }

      return {
        ...member,
        voice_status,
        volumeLevel: memberVolume,
        muted: isCurrentUser ? isMuted : member.muted
      };
    })
    // Sort members by join time (created_at) to maintain stable order
    ?.sort((a, b) => {
      // Current user always first
      if (a.id === currentUser?.id) return -1;
      if (b.id === currentUser?.id) return 1;
      // Then sort by created_at
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return {
      members: stableMembers || [],
      currentUserId: currentUser?.id,
      volumeLevels,
      onToggleMute: handleToggleMute
    };
  }, [partyState, presenceMembers, unjoinedMembers, currentUser, volume, volumeLevels, isMuted, isSpeaking, handleToggleMute]);

  return (
    <div className="z-20 mx-auto w-full max-w-[825px] overflow-hidden p-4 sm:p-6">
      <div className="mb-2 flex items-end justify-between">
        <h1 className="pl-[30px] text-lg text-white">$360</h1>
        {currentUser && (
          <button
            onClick={() => {
              logger.info('Opening edit modal', {
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
              src={currentUser?.avatar ?? AVATARS[0]!}
              alt="Profile"
              width={64}
              height={64}
              priority={true}
              unoptimized={true}
              loading="eager"
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
