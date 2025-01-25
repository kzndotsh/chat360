import type { PartyMember, VoiceMemberState } from '@/lib/types/party/member';
import type { PartyStatus } from '@/lib/types/party/state';

import { createContext, useCallback, useContext, useMemo, useEffect, useState } from 'react';

import { useAgoraContext } from '@/components/providers/AgoraProvider';

import { useVolumeControl } from '@/lib/hooks/useVolumeControl';
import { logger } from '@/lib/logger';
import { usePartyStore } from '@/lib/stores/partyStore';

interface PartyContextType {
  currentMember: PartyMember | null;
  error: Error | null;
  isLeaving: boolean;
  isMuted: boolean;
  members: PartyMember[];
  micPermissionDenied: boolean;
  partyState: PartyStatus;
  volumeLevels: Record<string, VoiceMemberState>;
  join: (member: PartyMember) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => Promise<void>;
  updateProfile: (updates: Partial<PartyMember>) => Promise<void>;
}

const initialPartyState: PartyStatus = 'idle';

const PartyContext = createContext<PartyContextType>({
  currentMember: null,
  error: null,
  isLeaving: false,
  isMuted: false,
  members: [],
  micPermissionDenied: false,
  partyState: initialPartyState,
  volumeLevels: {},
  join: async () => {},
  leave: async () => {},
  toggleMute: async () => {},
  updateProfile: async () => {},
});

export const useParty = () => useContext(PartyContext);

// Channel name for voice
const CHANNEL_NAME = 'party';

export function PartyProvider({ children }: { children: React.ReactNode }) {
  const {
    presence: { currentMember, members, error: presenceError },
    party: { status: partyState, error: partyError },
    voice: { isMuted },
    setMuted,
  } = usePartyStore();

  const [volumeLevels, setVolumeLevels] = useState<Record<string, VoiceMemberState>>({});
  const [isSubscribed, setIsSubscribed] = useState(false);

  const { getClient } = useAgoraContext();

  const { updateVolume } = useVolumeControl({
    isMuted,
    onVoiceStatusChange: (status) => {
      logger.debug('Voice status changed', {
        component: 'PartyContext',
        action: 'onVoiceStatusChange',
        metadata: { status, isMuted },
      });
    },
    onVolumeChange: (volume) => {
      logger.debug('Volume changed', {
        component: 'PartyContext',
        action: 'onVolumeChange',
        metadata: { volume, isMuted },
      });
    },
  });

  const handleVolumeChange = useCallback(
    (volumes: VoiceMemberState[]) => {
      setVolumeLevels((prevLevels) => {
        const newLevels = { ...prevLevels };

        volumes.forEach((vol) => {
          // Always update volume levels for all users
          newLevels[vol.id] = vol;

          // Only update local volume for current user
          if (vol.id === currentMember?.id) {
            updateVolume(vol.level);
          }
        });

        logger.debug('Volume levels updated', {
          component: 'PartyContext',
          action: 'handleVolumeChange',
          metadata: { volumes, newLevels },
        });

        return newLevels;
      });
    },
    [currentMember, updateVolume]
  );

  // Set up volume update handler
  useEffect(() => {
    const setupVoiceService = async () => {
      // Skip in non-browser environment
      if (typeof window === 'undefined' || typeof self === 'undefined') {
        return () => {}; // Return no-op cleanup function
      }

      const client = await getClient();
      if (!client) return () => {}; // Return no-op cleanup function

      try {
        // Dynamically import VoiceService
        const { VoiceService } = await import('@/lib/services/voiceService');
        const voiceService = VoiceService.getInstance(client);
        if (!voiceService) return () => {}; // Return no-op cleanup function

        // Set up voice update handler
        voiceService.onVolumeChange(handleVolumeChange);

        return () => {
          voiceService.onVolumeChange(null);
        };
      } catch (error) {
        logger.error('Failed to setup voice service', {
          component: 'PartyContext',
          action: 'setupVoiceService',
          metadata: { error },
        });
        return () => {}; // Return no-op cleanup function on error
      }
    };

    void setupVoiceService();
  }, [handleVolumeChange, getClient]);

  // Subscribe as visitor if not joined
  useEffect(() => {
    const subscribeVisitor = async () => {
      if (!currentMember && !isSubscribed) {
        try {
          const { subscribeAsVisitor } = usePartyStore.getState();
          await subscribeAsVisitor();
          setIsSubscribed(true);

          logger.debug('Subscribed as visitor', {
            component: 'PartyContext',
            action: 'subscribeVisitor',
          });
        } catch (error) {
          logger.error('Failed to subscribe as visitor', {
            component: 'PartyContext',
            action: 'subscribeVisitor',
            metadata: { error },
          });
        }
      }
    };

    void subscribeVisitor();
  }, [currentMember, isSubscribed]);

  const { initializePresence, cleanupPresence, updatePresence } = usePartyStore();

  const join = useCallback(
    async (member: PartyMember) => {
      try {
        // Initialize presence first
        await initializePresence(member);

        // Skip voice initialization in non-browser environment
        if (typeof window === 'undefined' || typeof self === 'undefined') {
          return;
        }

        // Initialize voice client
        const voiceClient = await getClient();
        if (!voiceClient) {
          throw new Error('Voice client not initialized');
        }

        // Dynamically import VoiceService
        const { VoiceService } = await import('@/lib/services/voiceService');

        // Create voice service instance
        const voiceService = VoiceService.getInstance(voiceClient);
        if (!voiceService) {
          throw new Error('Voice service not initialized');
        }

        // Join voice channel
        await voiceService.join(CHANNEL_NAME, member.id);

        logger.debug('[PartyChat][handleJoinParty] Join completed');
      } catch (error) {
        logger.error('Join error', { metadata: { error } });
        throw error;
      }
    },
    [initializePresence, getClient]
  );

  const leave = useCallback(async () => {
    try {
      // Skip in non-browser environment
      if (typeof window === 'undefined' || typeof self === 'undefined') {
        return;
      }

      // Get voice client and cleanup voice connection first
      const client = await getClient();
      if (client) {
        const { VoiceService } = await import('@/lib/services/voiceService');
        const voiceService = VoiceService.getInstance(client);
        await voiceService.leave();
      }

      // Then cleanup presence
      await cleanupPresence();
    } catch (error) {
      throw error;
    }
  }, [cleanupPresence, getClient]);

  const updateProfile = useCallback(
    async (profile: Partial<PartyMember>) => {
      try {
        await updatePresence(profile);
      } catch (error) {
        throw error;
      }
    },
    [updatePresence]
  );

  const toggleMute = useCallback(async () => {
    try {
      // Skip in non-browser environment
      if (typeof window === 'undefined' || typeof self === 'undefined') {
        return;
      }

      const client = await getClient();
      if (!client) {
        logger.error('Voice client not initialized');
        return;
      }

      const { VoiceService } = await import('@/lib/services/voiceService');
      const voiceService = VoiceService.getInstance(client);
      const newMuteState = await voiceService.toggleMute();

      // Update the store with the new mute state
      setMuted(newMuteState);

      // Log state change for debugging
      logger.debug('Mute state updated in context', {
        component: 'PartyContext',
        action: 'toggleMute',
        metadata: {
          newMuteState,
          voiceServiceMuted: voiceService.isMuted,
          currentMemberId: currentMember?.id,
        },
      });
    } catch (error) {
      logger.error('Toggle mute error', { metadata: { error } });
    }
  }, [getClient, setMuted, currentMember]);

  // Force re-render when isMuted changes
  useEffect(() => {
    logger.debug('Mute state changed in store', {
      component: 'PartyContext',
      action: 'muteStateEffect',
      metadata: { isMuted },
    });
  }, [isMuted]);

  const contextValue = useMemo<PartyContextType>(
    () => ({
      currentMember,
      error: presenceError || partyError,
      isLeaving: false,
      isMuted,
      members: Array.from(members.values()),
      micPermissionDenied: false,
      partyState,
      volumeLevels,
      join,
      leave,
      toggleMute,
      updateProfile,
    }),
    [
      currentMember,
      presenceError,
      partyError,
      isMuted,
      members,
      partyState,
      volumeLevels,
      join,
      leave,
      toggleMute,
      updateProfile,
    ]
  );

  return <PartyContext.Provider value={contextValue}>{children}</PartyContext.Provider>;
}
