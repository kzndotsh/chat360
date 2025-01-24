import type { VoiceSlice } from '@/lib/types/party/middleware';
import type { VoiceConnectionStatus } from '@/lib/types/party/state';
import type { Store } from '@/lib/types/party/store';

import { StateCreator } from 'zustand';

import { VOICE_CONSTANTS } from '@/lib/constants/voice';
import { logger } from '@/lib/logger';

export const createVoiceMiddleware = (): StateCreator<Store, [], [], VoiceSlice> => (set) => ({
  // Initial voice state
  voice: {
    status: 'idle',
    isMuted: false,
    volume: 0,
    isSpeaking: false,
    remoteUsers: new Set(),
    error: null,
  },

  // Voice status actions
  setVoiceStatus: (status: VoiceConnectionStatus) =>
    set((state: Store) => {
      if (state.voice.status === status) return state;

      logger.debug('Voice status changed', {
        component: 'voiceMiddleware',
        action: 'setVoiceStatus',
        metadata: {
          previousStatus: state.voice.status,
          newStatus: status
        }
      });

      return {
        ...state,
        voice: {
          ...state.voice,
          status,
          error: null,
        },
      };
    }),

  // Mute actions
  setMuted: (isMuted) =>
    set((state: Store) => {
      if (state.voice.isMuted === isMuted) return state;

      logger.debug('Mute state changed', {
        component: 'voiceMiddleware',
        action: 'setMuted',
        metadata: {
          wasMuted: state.voice.isMuted,
          isMuted
        }
      });

      return {
        ...state,
        voice: {
          ...state.voice,
          isMuted,
          isSpeaking: isMuted ? false : state.voice.isSpeaking,
          volume: isMuted ? 0 : state.voice.volume,
        },
      };
    }),

  // Volume actions
  setVolume: (volume) => {
    // Ensure volume is in 0-1 range
    const normalizedVolume = Math.min(Math.max(volume, 0), 1);

    return set((state: Store) => {
      if (state.voice.isMuted) {
        if (state.voice.volume === 0) return state;
        return {
          ...state,
          voice: { ...state.voice, volume: 0 },
        };
      }

      const isSpeaking = normalizedVolume >= VOICE_CONSTANTS.SPEAKING_THRESHOLD;
      const isHoldingSpeaking =
        state.voice.isSpeaking &&
        normalizedVolume >= VOICE_CONSTANTS.SPEAKING_HOLD_THRESHOLD;

      // More responsive volume change detection
      const hasSignificantVolumeChange =
        Math.abs(state.voice.volume - normalizedVolume) >= 0.02;

      // Update state if:
      // 1. Speaking state changed
      // 2. Significant volume change while speaking
      // 3. Initial volume update
      if (
        state.voice.isSpeaking !== (isSpeaking || isHoldingSpeaking) ||
        (state.voice.isSpeaking && hasSignificantVolumeChange) ||
        state.voice.volume === 0
      ) {
        logger.debug('Voice state updated', {
          component: 'voiceMiddleware',
          action: 'setVolume',
          metadata: {
            previousVolume: state.voice.volume,
            newVolume: normalizedVolume,
            wasSpeaking: state.voice.isSpeaking,
            isSpeaking: isSpeaking || isHoldingSpeaking,
            thresholds: {
              speaking: VOICE_CONSTANTS.SPEAKING_THRESHOLD,
              hold: VOICE_CONSTANTS.SPEAKING_HOLD_THRESHOLD
            }
          }
        });

        return {
          ...state,
          voice: {
            ...state.voice,
            volume: normalizedVolume,
            isSpeaking: isSpeaking || isHoldingSpeaking,
          },
        };
      }

      return state;
    });
  },

  // Remote users actions
  updateRemoteUsers: (users) =>
    set((state: Store) => ({
      ...state,
      voice: {
        ...state.voice,
        remoteUsers: users,
      },
    })),

  // Error actions
  setVoiceError: (error) =>
    set((state: Store) => ({
      ...state,
      voice: {
        ...state.voice,
        error,
        status: error ? 'idle' : state.voice.status,
      },
    })),

  // Speaking state actions
  setSpeaking: (isSpeaking) =>
    set((state: Store) => {
      if (state.voice.isSpeaking === isSpeaking || state.voice.isMuted) return state;

      logger.debug('Speaking state changed', {
        component: 'voiceMiddleware',
        action: 'setSpeaking',
        metadata: {
          wasSpeaking: state.voice.isSpeaking,
          isSpeaking
        }
      });

      return {
        ...state,
        voice: {
          ...state.voice,
          isSpeaking,
        },
      };
    }),
});
