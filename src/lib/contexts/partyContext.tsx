import type { VolumeState } from '@/lib/types/components/props';
import type { PartyMember } from '@/lib/types/party/member';
import type { PartyStatus } from '@/lib/types/party/state';

import { createContext, useCallback, useContext, useMemo } from 'react';

import { useAgoraContext } from '@/components/providers/AgoraProvider';

import { useVolumeControl } from '@/lib/hooks/useVolumeControl';
import { logger } from '@/lib/logger';
import { VoiceService } from '@/lib/services/voiceService';
import { usePartyStore } from '@/lib/stores/partyStore';

interface PartyContextType {
  currentMember: PartyMember | null;
  error: Error | null;
  isLeaving: boolean;
  isMuted: boolean;
  members: PartyMember[];
  micPermissionDenied: boolean;
  partyState: PartyStatus;
  volumeLevels: Record<string, VolumeState>;
  join: (member: PartyMember) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => void;
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
  toggleMute: () => {},
  updateProfile: async () => {},
});

export const useParty = () => useContext(PartyContext);

// Channel name for voice
const CHANNEL_NAME = 'party';

export function PartyProvider({ children }: { children: React.ReactNode }) {
  const volumeLevels = useVolumeControl();
  const { getClient } = useAgoraContext();
  const { initializePresence, cleanupPresence, updatePresence } = usePartyStore();

  const {
    presence: { currentMember, members, error: presenceError },
    party: { status: partyState, error: partyError },
    voice: { isMuted },
    setMuted,
  } = usePartyStore();

  const join = useCallback(
    async (member: PartyMember) => {
      try {
        // Initialize presence first
        await initializePresence(member);

        // Initialize voice client
        const voiceClient = await getClient();
        if (!voiceClient) {
          throw new Error('Voice client not initialized');
        }

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
      // Get voice client and cleanup voice connection first
      const client = await getClient();
      if (client) {
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
      const client = await getClient();
      if (!client) return;

      const voiceService = VoiceService.getInstance(client);
      const newMuted = await voiceService.toggleMute();
      setMuted(newMuted);
    } catch (error) {
      throw error;
    }
  }, [getClient, setMuted]);

  const value = useMemo(
    () => ({
      currentMember,
      error: presenceError || partyError,
      isLeaving: partyState === 'leaving',
      isMuted,
      join,
      leave,
      members: Array.from(members.values()),
      micPermissionDenied: false,
      partyState,
      toggleMute,
      updateProfile,
      volumeLevels,
    }),
    [
      currentMember,
      presenceError,
      partyError,
      partyState,
      isMuted,
      join,
      leave,
      members,
      toggleMute,
      updateProfile,
      volumeLevels,
    ]
  );

  return <PartyContext.Provider value={value}>{children}</PartyContext.Provider>;
}
