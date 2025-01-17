'use client';

import { create } from 'zustand';
import type { ILocalAudioTrack } from 'agora-rtc-sdk-ng';
import { logger } from '@/lib/utils/logger';

const LOG_CONTEXT = { component: 'useVoiceStore' };

interface VoiceState {
  track: ILocalAudioTrack | null;
  isMuted: boolean;
  isConnected: boolean;
  isSpeaking: boolean;
  volume: number;
  lastError: Error | null;
  setTrack: (track: ILocalAudioTrack | null) => void;
  setMuted: (muted: boolean) => void;
  setConnected: (connected: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  setVolume: (volume: number) => void;
  setError: (error: Error | null) => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  track: null,
  isMuted: false,
  isConnected: false,
  isSpeaking: false,
  volume: 100,
  lastError: null,

  setTrack: (track) => {
    const currentTrack = get().track;
    if (currentTrack && currentTrack !== track) {
      // Clean up existing track
      try {
        logger.debug('Cleaning up existing track', LOG_CONTEXT);
        currentTrack.stop();
        currentTrack.close();
      } catch (error) {
        logger.error('Failed to cleanup existing track', {
          ...LOG_CONTEXT,
          action: 'setTrack',
          metadata: { error }
        });
      }
    }

    // Set new track and apply current states
    if (track) {
      const { isMuted, volume } = get();
      track.setEnabled(!isMuted);
      track.setVolume(volume);
      
      logger.debug('New track initialized with states', {
        ...LOG_CONTEXT,
        action: 'setTrack',
        metadata: { isMuted, volume }
      });
    }

    set({ track, lastError: null });
  },

  setMuted: (muted) => {
    const { track } = get();
    if (track) {
      try {
        track.setEnabled(!muted);
        set({ isMuted: muted, lastError: null });
        
        logger.debug('Track mute state updated', {
          ...LOG_CONTEXT,
          action: 'setMuted',
          metadata: { muted }
        });
      } catch (error) {
        logger.error('Failed to set track mute state', {
          ...LOG_CONTEXT,
          action: 'setMuted',
          metadata: { error }
        });
        set({ lastError: error instanceof Error ? error : new Error(String(error)) });
      }
    } else {
      set({ isMuted: muted });
    }
  },

  setConnected: (connected) => {
    set({ isConnected: connected });
    if (!connected) {
      // Reset speaking state when disconnected
      set({ isSpeaking: false });
    }
  },

  setSpeaking: (speaking) => {
    const { isConnected } = get();
    // Only update speaking state if connected
    if (isConnected) {
      set({ isSpeaking: speaking });
    }
  },

  setVolume: (volume) => {
    const { track } = get();
    if (track) {
      try {
        track.setVolume(volume);
        set({ volume, lastError: null });
        
        logger.debug('Track volume updated', {
          ...LOG_CONTEXT,
          action: 'setVolume',
          metadata: { volume }
        });
      } catch (error) {
        logger.error('Failed to set track volume', {
          ...LOG_CONTEXT,
          action: 'setVolume',
          metadata: { error }
        });
        set({ lastError: error instanceof Error ? error : new Error(String(error)) });
      }
    } else {
      set({ volume });
    }
  },

  setError: (error) => {
    set({ lastError: error });
  }
})); 