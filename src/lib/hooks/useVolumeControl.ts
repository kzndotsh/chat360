import type { VolumeState } from '@/lib/types/components/props';
import type { VoiceMemberState } from '@/lib/types/party/member';

import { useState, useEffect, useRef } from 'react';

import { Subject, GroupedObservable } from 'rxjs';
import {
  groupBy,
  mergeMap,
  map,
  distinctUntilChanged,
  takeUntil,
  filter,
  share,
  auditTime
} from 'rxjs/operators';

import { useAgoraContext } from '@/components/providers/AgoraProvider';

import { VOICE_CONSTANTS } from '@/lib/constants/voice';
import { logger } from '@/lib/logger';

import { VoiceService } from '../services/voiceService';

interface VoiceUpdate {
  agora_uid: string;
  id: string;
  is_deafened: boolean;
  level: number;
  muted: boolean;
  voice_status: VolumeState['voice_status'];
}

export function useVolumeControl() {
  const [volumeLevels, setVolumeLevels] = useState<Record<string, VolumeState>>({});
  const { client } = useAgoraContext();
  const serviceRef = useRef<VoiceService | null>(null);

  // RxJS Subjects with improved memory management
  const volumeSubject = useRef(new Subject<VoiceMemberState>());
  const cleanup$ = useRef(new Subject<void>());
  const stateCache = useRef(new Map<string, VoiceUpdate>());

  useEffect(() => {
    let voiceService: VoiceService | null = null;
    const localCleanup = cleanup$.current;
    const localStateCache = stateCache.current;
    const localVolumeSubject = volumeSubject.current;

    if (client) {
      try {
        voiceService = VoiceService.getInstance(client);
        serviceRef.current = voiceService;

        // Optimized volume stream with better performance
        const volume$ = localVolumeSubject.pipe(
          groupBy((vol: VoiceMemberState) => vol.id),
          mergeMap((group$: GroupedObservable<string, VoiceMemberState>) =>
            group$.pipe(
              map((vol: VoiceMemberState): VoiceUpdate => {
                const currentState = localStateCache.get(vol.id);
                const newState = {
                  id: vol.id,
                  level: vol.level,
                  voice_status: determineVoiceStatus(vol, currentState),
                  muted: vol.muted,
                  is_deafened: vol.is_deafened,
                  agora_uid: (vol.agora_uid || '').toString()
                };
                localStateCache.set(vol.id, newState);
                return newState;
              }),
              // Faster updates for mute/unmute
              auditTime(VOICE_CONSTANTS.UPDATE_DEBOUNCE / 4),
              distinctUntilChanged((prev, curr) => {
                if (prev.muted !== curr.muted) return false;
                if (prev.voice_status !== curr.voice_status) return false;
                if (prev.is_deafened !== curr.is_deafened) return false;
                return Math.abs(prev.level - curr.level) <
                  (curr.voice_status === 'speaking' ? 0.05 : VOICE_CONSTANTS.SPEAKING_THRESHOLD / 2);
              }),
              filter((state: VoiceUpdate) =>
                state.muted ||
                state.voice_status === 'speaking' ||
                state.level >= VOICE_CONSTANTS.SPEAKING_THRESHOLD / 4
              )
            )
          ),
          share(),
          takeUntil(localCleanup)
        );

        // Optimized state updates with batching
        volume$.subscribe({
          next: (newState: VoiceUpdate) => {
            setVolumeLevels(prev => {
              const prevState = prev[newState.id];
              if (prevState?.muted === newState.muted &&
                  prevState?.voice_status === newState.voice_status &&
                  prevState?.is_deafened === newState.is_deafened &&
                  Math.abs(prevState.level - newState.level) < 0.05) {
                return prev;
              }
              return { ...prev, [newState.id]: newState };
            });
          },
          error: (error: Error) => {
            logger.error('Error in volume stream:', { metadata: { error } });
          }
        });

        // Optimized volume change handler
        voiceService.onVolumeChange((volumes) => {
          volumes.forEach(vol => {
            if (vol.muted || vol.level >= VOICE_CONSTANTS.SPEAKING_THRESHOLD / 4) {
              localVolumeSubject.next(vol);
            }
          });
        });
      } catch (error) {
        logger.error('Failed to initialize VoiceService:', { metadata: { error } });
      }
    }

    return () => {
      localCleanup.next();
      localCleanup.complete();
      if (voiceService) {
        voiceService.onVolumeChange(null);
        setVolumeLevels({});
        serviceRef.current = null;
        localStateCache.clear();
      }
    };
  }, [client]);

  return volumeLevels;
}

function determineVoiceStatus(
  vol: VoiceMemberState,
  currentState?: VoiceUpdate
): VolumeState['voice_status'] {
  // If muted, always return muted state
  if (vol.muted) {
    return 'muted';
  }

  // If volume is above threshold, user is speaking
  if (vol.level >= VOICE_CONSTANTS.SPEAKING_THRESHOLD) {
    return 'speaking';
  }

  // Keep speaking state for a short while to prevent flickering
  if (currentState?.voice_status === 'speaking' &&
      vol.level >= VOICE_CONSTANTS.SPEAKING_THRESHOLD / 2) {
    return 'speaking';
  }

  // Otherwise user is silent
  return 'silent';
}
