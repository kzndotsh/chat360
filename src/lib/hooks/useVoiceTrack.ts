import { useCallback, useEffect, useRef, useState } from 'react';
import type { IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { logger } from '@/lib/utils/logger';
import { useVoiceClient } from './useVoiceClient';
import { useVoiceStatus } from './useVoiceStatus';
import { useVoicePermissions } from './useVoicePermissions';
import { usePartyState } from './usePartyState';

let AgoraRTC: typeof import('agora-rtc-sdk-ng').default | null = null;
let agoraPromise: Promise<void> | null = null;

if (typeof window !== 'undefined') {
  agoraPromise = import('agora-rtc-sdk-ng').then((mod) => {
    AgoraRTC = mod.default;
  });
}

export function useVoiceTrack() {
  const { client, isConnected, joinVoice } = useVoiceClient();
  const { updateVoiceStatus } = useVoiceStatus();
  const { requestAudioPermission } = useVoicePermissions();
  const { currentUser } = usePartyState();
  const [isLoadingMic, setIsLoadingMic] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const trackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const loggerRef = useRef(logger);
  const autoJoinAttemptedRef = useRef(false);

  // Create microphone track
  const createMicrophoneTrack = useCallback(async () => {
    loggerRef.current.debug('Creating microphone track', {
      component: 'useVoiceTrack',
      action: 'createMicrophoneTrack',
    });

    try {
      setIsLoadingMic(true);

      if (!AgoraRTC) {
        throw new Error('AgoraRTC not initialized');
      }

      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      loggerRef.current.debug('Microphone track created successfully', {
        component: 'useVoiceTrack',
        action: 'createMicrophoneTrack',
      });
      return audioTrack;
    } catch (error) {
      loggerRef.current.error('Failed to create microphone track', {
        component: 'useVoiceTrack',
        action: 'createMicrophoneTrack',
        metadata: { error },
      });
      return null;
    } finally {
      setIsLoadingMic(false);
    }
  }, []);

  // Auto-join voice chat when user joins party
  useEffect(() => {
    if (currentUser?.id && !autoJoinAttemptedRef.current) {
      loggerRef.current.debug('Auto-joining voice chat', {
        component: 'useVoiceTrack',
        action: 'autoJoin',
        metadata: { userId: currentUser.id },
      });

      const autoJoin = async () => {
        try {
          // Wait for AgoraRTC to be ready
          if (agoraPromise) {
            await agoraPromise;
          }

          if (!AgoraRTC) {
            throw new Error('AgoraRTC not initialized');
          }

          // Set flag before attempting join to prevent concurrent attempts
          autoJoinAttemptedRef.current = true;

          // Join voice chat first
          loggerRef.current.debug('Joining voice chat', {
            component: 'useVoiceTrack',
            action: 'autoJoin',
            metadata: { userId: currentUser.id },
          });

          await joinVoice();

          // Wait for connection to establish
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Create microphone track after joining
          const track = await createMicrophoneTrack();
          if (!track) {
            throw new Error('Failed to create microphone track');
          }

          trackRef.current = track;

          // Publish track if we successfully joined
          if (client && isConnected) {
            await client.publish(track);
            loggerRef.current.debug('Published track after auto-join', {
              component: 'useVoiceTrack',
              action: 'autoJoin',
              metadata: { userId: currentUser.id },
            });
          }
        } catch (error) {
          loggerRef.current.error('Failed to auto-join voice chat', {
            component: 'useVoiceTrack',
            action: 'autoJoin',
            metadata: { error, userId: currentUser.id },
          });
          // Reset attempt flag so we can try again
          autoJoinAttemptedRef.current = false;
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      };

      // Start auto-join process with a small delay
      setTimeout(autoJoin, 2000);
    }
  }, [currentUser?.id, isConnected, joinVoice, createMicrophoneTrack, client]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    loggerRef.current.debug('Attempting to toggle mute', {
      component: 'useVoiceTrack',
      action: 'toggleMute',
      metadata: {
        hasTrack: !!trackRef.current,
        isConnected,
        isMuted,
      },
    });

    try {
      // First check permissions if we don't have a track
      if (!trackRef.current) {
        loggerRef.current.debug('No audio track, requesting microphone permission', {
          component: 'useVoiceTrack',
          action: 'toggleMute',
        });

        const hasPermission = await requestAudioPermission();
        if (!hasPermission) {
          loggerRef.current.warn('No microphone permission', {
            component: 'useVoiceTrack',
            action: 'toggleMute',
          });
          return;
        }

        // Join voice chat first if not connected
        if (!isConnected) {
          try {
            loggerRef.current.debug('Joining voice chat during mute toggle', {
              component: 'useVoiceTrack',
              action: 'toggleMute',
            });

            await joinVoice();

            // Wait for connection to establish
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (error) {
            loggerRef.current.error('Failed to join voice chat during mute toggle', {
              component: 'useVoiceTrack',
              action: 'toggleMute',
              metadata: { error },
            });
            return;
          }
        }

        // Create track after joining
        loggerRef.current.debug('Creating new audio track for mute toggle', {
          component: 'useVoiceTrack',
          action: 'toggleMute',
        });

        const audioTrack = await createMicrophoneTrack();
        if (!audioTrack) {
          loggerRef.current.error('Failed to create audio track for mute toggle', {
            component: 'useVoiceTrack',
            action: 'toggleMute',
          });
          return;
        }

        trackRef.current = audioTrack;

        // If we have a client and we're connected, publish the track
        if (client && isConnected) {
          try {
            await client.publish(audioTrack);
            loggerRef.current.debug('Published new audio track', {
              component: 'useVoiceTrack',
              action: 'toggleMute',
            });
          } catch (error) {
            loggerRef.current.error('Failed to publish audio track', {
              component: 'useVoiceTrack',
              action: 'toggleMute',
              metadata: { error },
            });
            return;
          }
        }
      }

      // Update mute state using functional update to avoid race conditions
      setIsMuted((currentMuted) => {
        const newMuteState = !currentMuted;

        // Update track state
        if (trackRef.current) {
          trackRef.current.setEnabled(!newMuteState);
        }

        // Update voice status
        updateVoiceStatus(newMuteState ? 'muted' : 'silent');

        loggerRef.current.debug('Successfully toggled mute', {
          component: 'useVoiceTrack',
          action: 'toggleMute',
          metadata: { newState: newMuteState },
        });

        return newMuteState;
      });
    } catch (error) {
      loggerRef.current.error('Failed to toggle mute', {
        component: 'useVoiceTrack',
        action: 'toggleMute',
        metadata: { error },
      });
    }
  }, [
    isConnected,
    isMuted,
    updateVoiceStatus,
    createMicrophoneTrack,
    client,
    joinVoice,
    requestAudioPermission,
  ]);

  // Stop track
  const stopTrack = useCallback(() => {
    if (trackRef.current) {
      trackRef.current.stop();
      trackRef.current = null;
      loggerRef.current.debug('Stopped audio track', {
        component: 'useVoiceTrack',
        action: 'stopTrack',
      });
    }
  }, []);

  return {
    track: trackRef.current,
    isLoadingMic,
    isMuted,
    createMicrophoneTrack,
    toggleMute,
    stopTrack,
  };
}
