import type { VoiceSlice } from '@/lib/types/party/middleware';
import type { VoiceConnectionStatus } from '@/lib/types/party/state';
import type { Store } from '@/lib/types/party/store';

import { StateCreator } from 'zustand';

import { VOICE_CONSTANTS } from '@/lib/constants/voice';

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
    set((state: Store) => ({
      ...state,
      voice: {
        ...state.voice,
        status,
        // Reset error when changing status
        error: null,
      },
    })),

  // Mute actions
  setMuted: (isMuted) =>
    set((state: Store) => {
      const newState = {
        ...state.voice,
        isMuted,
        // When muting, stop speaking and reset volume
        isSpeaking: isMuted ? false : state.voice.isSpeaking,
        volume: isMuted ? 0 : state.voice.volume,
      };

      return {
        ...state,
        voice: newState,
      };
    }),

  // Volume actions
  setVolume: (volume) => {
    const normalizedVolume = Math.min(Math.max(volume, 0), 1);
    const isSpeaking = normalizedVolume >= VOICE_CONSTANTS.SPEAKING_THRESHOLD;

    return set((state: Store) => {
      const newState = {
        ...state.voice,
        volume: normalizedVolume,
        // Only update speaking if not muted and volume crosses threshold
        isSpeaking: state.voice.isMuted ? false : isSpeaking,
      };

      return {
        ...state,
        voice: newState,
      };
    });
  },

  // Speaking status actions
  setSpeaking: (isSpeaking) =>
    set((state: Store) => ({
      ...state,
      voice: {
        ...state.voice,
        // Preserve muted state when updating speaking
        isSpeaking: state.voice.isMuted ? false : isSpeaking,
      },
    })),

  // Remote users actions
  updateRemoteUsers: (users) =>
    set((state: Store) => ({
      ...state,
      voice: {
        ...state.voice,
        remoteUsers: new Set(users),
      },
    })),

  // Error actions
  setVoiceError: (error) =>
    set((state: Store) => ({
      ...state,
      voice: {
        ...state.voice,
        error,
        // Set status to disconnected on error
        status: error ? 'disconnected' : state.voice.status,
      },
    })),
});
