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
  tap,
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

  // RxJS Subjects
  const volumeSubject = useRef(new Subject<VoiceMemberState>());
  const cleanup$ = useRef(new Subject<void>());
  const stateCache = useRef(new Map<string, VoiceUpdate>());

  useEffect(() => {
    let voiceService: VoiceService | null = null;
    // Create local references to avoid closure issues
    const localCleanup = cleanup$.current;
    const localStateCache = stateCache.current;
    const localVolumeSubject = volumeSubject.current;

    if (client) {
      try {
        voiceService = VoiceService.getInstance(client);
        serviceRef.current = voiceService;

        // Create volume stream
        const volume$ = localVolumeSubject.pipe(
          // Group by member ID to handle each member separately
          groupBy((vol: VoiceMemberState) => vol.id),
          mergeMap((group: GroupedObservable<string, VoiceMemberState>) => group.pipe(
            // Map volume updates to state updates
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

              // Log volume changes for debugging
              logger.debug('[VolumeControl] Volume update', {
                metadata: {
                  memberId: vol.id,
                  level: vol.level,
                  muted: vol.muted,
                  currentStatus: currentState?.voice_status,
                  newStatus: newState.voice_status
                }
              });

              return newState;
            }),
            // Cache the state
            tap((state: VoiceUpdate) => {
              localStateCache.set(state.id, state);

              // Log state changes for debugging
              logger.debug('[VolumeControl] State cached', {
                metadata: {
                  memberId: state.id,
                  status: state.voice_status,
                  level: state.level
                }
              });
            }),
            // Use auditTime instead of debounceTime for more responsive updates
            auditTime(VOICE_CONSTANTS.UPDATE_DEBOUNCE / 2),
            // Only emit when voice status, mute state, or significant level changes occur
            distinctUntilChanged((prev: VoiceUpdate, curr: VoiceUpdate) =>
              prev.voice_status === curr.voice_status &&
              prev.muted === curr.muted &&
              prev.is_deafened === curr.is_deafened &&
              Math.abs(prev.level - curr.level) < VOICE_CONSTANTS.SPEAKING_THRESHOLD / 2
            ),
            // Filter out null states and very low volumes when not speaking
            filter((state: VoiceUpdate) =>
              !!state && (
                state.voice_status === 'speaking' ||
                state.muted ||
                state.level >= VOICE_CONSTANTS.SPEAKING_THRESHOLD / 4
              )
            )
          )),
          // Share the stream to prevent multiple subscriptions
          share(),
          // Stop the stream when cleanup is triggered
          takeUntil(localCleanup)
        );

        // Subscribe to volume updates
        volume$.subscribe({
          next: (newState: VoiceUpdate) => {
            setVolumeLevels(prev => {
              const updated = {
                ...prev,
                [newState.id]: newState
              };

              // Log state updates for debugging
              logger.debug('[VolumeControl] State updated', {
                metadata: {
                  memberId: newState.id,
                  status: newState.voice_status,
                  level: newState.level,
                  states: Object.values(updated).map(s => ({
                    id: s.id,
                    status: s.voice_status,
                    level: s.level
                  }))
                }
              });

              return updated;
            });
          },
          error: (error: Error) => {
            logger.error('Error in volume stream:', { metadata: { error } });
          }
        });

        // Handle incoming volume updates
        voiceService.onVolumeChange((volumes) => {
          volumes.forEach(vol => localVolumeSubject.next(vol));
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
