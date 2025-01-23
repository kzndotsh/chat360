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
    set((state: Store) => {
      if (state.voice.status === status) return state;
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
      if (
        Math.abs(state.voice.volume - normalizedVolume) < 0.05 &&
        state.voice.isSpeaking === isSpeaking
      ) {
        return state;
      }

      return {
        ...state,
        voice: {
          ...state.voice,
          volume: normalizedVolume,
          isSpeaking,
        },
      };
    });
  },

  // Speaking status actions
  setSpeaking: (isSpeaking) =>
    set((state: Store) => {
      if (state.voice.isMuted || state.voice.isSpeaking === isSpeaking) return state;
      return {
        ...state,
        voice: {
          ...state.voice,
          isSpeaking,
        },
      };
    }),

  // Remote users actions
  updateRemoteUsers: (users) =>
    set((state: Store) => {
      const newUsers = new Set(users);
      if (setsAreEqual(state.voice.remoteUsers, newUsers)) return state;
      return {
        ...state,
        voice: {
          ...state.voice,
          remoteUsers: newUsers,
        },
      };
    }),

  // Error actions
  setVoiceError: (error) =>
    set((state: Store) => {
      if (state.voice.error === error) return state;
      return {
        ...state,
        voice: {
          ...state.voice,
          error,
          status: error ? 'disconnected' : state.voice.status,
        },
      };
    }),
});

// Helper function to compare sets
function setsAreEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  return Array.from(a).every((item) => b.has(item));
}
