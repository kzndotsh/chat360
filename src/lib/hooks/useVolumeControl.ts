import type { VoiceStatus } from '@/lib/types/party/member';

import { useState, useEffect, useRef, useCallback } from 'react';

import { VOICE_CONSTANTS } from '../constants/voice';

interface UseVolumeControlOptions {
  isMuted?: boolean;
  onVoiceStatusChange?: (status: VoiceStatus) => void;
  onVolumeChange?: (volume: number) => void;
}

export function determineVoiceStatus(
  volume: number,
  currentStatus: VoiceStatus,
  isMuted: boolean
): VoiceStatus {
  if (isMuted) return 'muted';

  const isSpeaking = volume >= VOICE_CONSTANTS.SPEAKING_THRESHOLD;
  const isHoldingSpeaking =
    currentStatus === 'speaking' && volume >= VOICE_CONSTANTS.SPEAKING_HOLD_THRESHOLD;

  // Immediate transition to speaking state when threshold is met
  if (isSpeaking || isHoldingSpeaking) {
    return 'speaking';
  }

  // Quick transition to silent state when volume is very low
  if (volume < VOICE_CONSTANTS.SPEAKING_HOLD_THRESHOLD) {
    return 'silent';
  }

  // Keep current state if in transition
  return currentStatus;
}

export function useVolumeControl({
  isMuted = false,
  onVoiceStatusChange,
  onVolumeChange,
}: UseVolumeControlOptions) {
  const [volume, setVolume] = useState<number>(0);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('silent');
  const mountedRef = useRef<boolean>(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const updateVolume = useCallback((newVolume: number) => {
    if (!mountedRef.current) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce volume updates
    timeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;

      const roundedVolume = Math.round(newVolume * 100);
      setVolume(roundedVolume);
      onVolumeChange?.(roundedVolume);

      // Update voice status
      const newStatus = determineVoiceStatus(roundedVolume, voiceStatus, isMuted);
      if (newStatus !== voiceStatus) {
        setVoiceStatus(newStatus);
        onVoiceStatusChange?.(newStatus);
      }
    }, VOICE_CONSTANTS.UPDATE_DEBOUNCE);
  }, [voiceStatus, isMuted, onVolumeChange, onVoiceStatusChange]);

  return { updateVolume, volume, voiceStatus };
}
