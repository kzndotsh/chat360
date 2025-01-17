import { useCallback, useRef, useState } from 'react';
import type { IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { logger } from '@/lib/utils/logger';
import { useVoiceClient } from './useVoiceClient';
import { useVoiceStatus } from './useVoiceStatus';
import { useVoicePermissions } from './useVoicePermissions';

let AgoraRTC: typeof import('agora-rtc-sdk-ng').default | null = null;

if (typeof window !== 'undefined') {
  import('agora-rtc-sdk-ng').then((mod) => {
    AgoraRTC = mod.default;
  });
}

export function useVoiceTrack() {
  const { client, isConnected, joinVoice } = useVoiceClient();
  const { updateVoiceStatus } = useVoiceStatus();
  const { requestAudioPermission } = useVoicePermissions();
  const [isMuted, setIsMuted] = useState(false);
  const trackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const loggerRef = useRef(logger);

  // Create microphone track
  const createMicrophoneTrack = useCallback(async () => {
    loggerRef.current.debug('Creating microphone track', {
      component: 'useVoiceTrack',
      action: 'createMicrophoneTrack',
    });

    if (!AgoraRTC) {
      loggerRef.current.error('AgoraRTC not initialized', {
        component: 'useVoiceTrack',
        action: 'createMicrophoneTrack',
      });
      return null;
    }

    try {
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      loggerRef.current.debug('Microphone track created', {
        component: 'useVoiceTrack',
        action: 'createMicrophoneTrack',
        metadata: { hasTrack: !!audioTrack }
      });
      return audioTrack;
    } catch (error) {
      loggerRef.current.error('Failed to create microphone track', {
        component: 'useVoiceTrack',
        action: 'createMicrophoneTrack',
        metadata: { error },
      });
      return null;
    }
  }, []);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    loggerRef.current.debug('Attempting to toggle mute', {
      component: 'useVoiceTrack',
      action: 'toggleMute',
      metadata: {
        hasTrack: !!trackRef.current,
        isConnected,
        isMuted,
        clientState: client?.connectionState
      },
    });

    try {
      // First check permissions if we don't have a track
      if (!trackRef.current) {
        loggerRef.current.debug('No audio track, requesting microphone permission', {
          component: 'useVoiceTrack',
          action: 'toggleMute',
          metadata: {
            clientState: client?.connectionState
          },
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
              metadata: {
                clientState: client?.connectionState
              },
            });

            await joinVoice();

            // Wait for connection to establish (up to 10 seconds)
            let waitAttempts = 0;
            while (!isConnected && waitAttempts < 10) {
              loggerRef.current.debug('Waiting for connection', {
                component: 'useVoiceTrack',
                action: 'toggleMute',
                metadata: { 
                  attempt: waitAttempts + 1,
                  isConnected,
                  clientState: client?.connectionState
                },
              });
              await new Promise((resolve) => setTimeout(resolve, 1000));
              waitAttempts++;
            }

            if (!isConnected) {
              throw new Error('Failed to establish connection after 10 seconds');
            }
          } catch (error) {
            loggerRef.current.error('Failed to join voice chat during mute toggle', {
              component: 'useVoiceTrack',
              action: 'toggleMute',
              metadata: { error, clientState: client?.connectionState },
            });
            return;
          }
        }

        // Create track after joining
        loggerRef.current.debug('Creating new audio track for mute toggle', {
          component: 'useVoiceTrack',
          action: 'toggleMute',
          metadata: {
            isConnected,
            clientState: client?.connectionState
          },
        });

        const audioTrack = await createMicrophoneTrack();
        if (!audioTrack) {
          loggerRef.current.error('Failed to create audio track for mute toggle', {
            component: 'useVoiceTrack',
            action: 'toggleMute',
            metadata: {
              clientState: client?.connectionState
            },
          });
          return;
        }

        trackRef.current = audioTrack;

        // Double check client and connection before publishing
        if (!client) {
          throw new Error('Client not available for publishing');
        }

        if (!isConnected) {
          throw new Error('Lost connection before publishing');
        }

        // Publish track
        await client.publish(audioTrack);
        loggerRef.current.debug('Published new track during mute toggle', {
          component: 'useVoiceTrack',
          action: 'toggleMute',
          metadata: {
            isConnected,
            clientState: client?.connectionState
          },
        });
      }

      // Now toggle mute state
      const track = trackRef.current;
      if (track) {
        if (isMuted) {
          await track.setEnabled(true);
          setIsMuted(false);
          await updateVoiceStatus('speaking');
          loggerRef.current.debug('Unmuted audio track', {
            component: 'useVoiceTrack',
            action: 'toggleMute',
          });
        } else {
          await track.setEnabled(false);
          setIsMuted(true);
          await updateVoiceStatus('muted');
          loggerRef.current.debug('Muted audio track', {
            component: 'useVoiceTrack',
            action: 'toggleMute',
          });
        }
      }
    } catch (error) {
      loggerRef.current.error('Failed to toggle mute', {
        component: 'useVoiceTrack',
        action: 'toggleMute',
        metadata: { error, clientState: client?.connectionState },
      });
    }
  }, [client, isMuted, isConnected, joinVoice, createMicrophoneTrack, requestAudioPermission, updateVoiceStatus]);

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
    isMuted,
    createMicrophoneTrack,
    toggleMute,
    stopTrack,
  };
}
