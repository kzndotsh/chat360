import type { VoiceSlice } from '@/lib/types/party/middleware';
import type { VoiceConnectionStatus } from '@/lib/types/party/state';
import type { Store } from '@/lib/types/party/store';

import { StateCreator } from 'zustand';

const VOICE_MIN_VOLUME = 0.1;

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
    set((state: Store) => ({
      ...state,
      voice: {
        ...state.voice,
        isMuted,
        // When muting, also stop speaking
        isSpeaking: isMuted ? false : state.voice.isSpeaking,
      },
    })),

  // Volume actions
  setVolume: (volume) => {
    const normalizedVolume = Math.min(Math.max(volume, 0), 1);
    const isSpeaking = normalizedVolume >= VOICE_MIN_VOLUME;

    return set((state: Store) => ({
      ...state,
      voice: {
        ...state.voice,
        volume: normalizedVolume,
        // Only update speaking if not muted
        isSpeaking: state.voice.isMuted ? false : isSpeaking,
      },
    }));
  },

  // Speaking status actions
  setSpeaking: (isSpeaking) =>
    set((state: Store) => ({
      ...state,
      voice: {
        ...state.voice,
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
