import type { VoiceStatus } from '@/lib/types/party/member';

import { useState, useEffect, useRef, useMemo } from 'react';

import { Subject } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';

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

export function useVolumeControl(options: UseVolumeControlOptions) {
  const { onVolumeChange, onVoiceStatusChange, isMuted = false } = options;
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('silent');
  const volumeSubject = useMemo(() => new Subject<number>(), []);
  const lastVolume = useRef<number>(0);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const subscription = volumeSubject
      .pipe(
        debounceTime(VOICE_CONSTANTS.UPDATE_DEBOUNCE),
        map((volume) => {
          // Use raw volume for immediate response
          lastVolume.current = volume;
          return volume;
        })
      )
      .subscribe((volume) => {
        const newStatus = determineVoiceStatus(volume, voiceStatus, isMuted);

        // Clear any existing timeout
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }

        // Set timeout to transition to silent if volume stays low
        if (newStatus === 'speaking' && volume < VOICE_CONSTANTS.SPEAKING_HOLD_THRESHOLD) {
          silenceTimeoutRef.current = setTimeout(() => {
            setVoiceStatus('silent');
            onVoiceStatusChange?.('silent');
          }, VOICE_CONSTANTS.SPEAKING_TIMEOUT);
        }

        if (newStatus !== voiceStatus) {
          setVoiceStatus(newStatus);
          onVoiceStatusChange?.(newStatus);
        }
        onVolumeChange?.(volume);
      });

    return () => {
      subscription.unsubscribe();
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
    };
  }, [isMuted, voiceStatus, onVoiceStatusChange, onVolumeChange, volumeSubject]);

  return {
    voiceStatus,
    updateVolume: (volume: number) => volumeSubject.next(volume),
  };
}
