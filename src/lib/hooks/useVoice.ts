'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { useAgoraContext } from '@/components/providers/AgoraProvider';
import { PartyMember } from '@/lib/types/party';
import { logger } from '@/lib/utils/logger';

const VOLUME_CHECK_INTERVAL = 100; // 100ms for volume updates
const _VOICE_JOIN_TIMEOUT = 30000; // 30 seconds
const VOICE_RETRY_DELAY = 2000; // 2 seconds between retries
const MAX_VOICE_JOIN_RETRIES = 3;
const SPEAKING_THRESHOLD = 0.45; // Start speaking above 45%
const SILENCE_THRESHOLD = 0.35; // Stop speaking below 35%

// Define our possible voice states
type VoiceState =
  | { status: 'idle' }
  | { status: 'requesting_permissions' }
  | { status: 'permission_denied' }
  | { status: 'connecting'; attempt: number }
  | { status: 'connected'; track: IMicrophoneAudioTrack }
  | { status: 'disconnected'; error?: Error };

interface VoiceHookProps {
  currentUser?: PartyMember | null;
  partyState?: 'idle' | 'joining' | 'joined' | 'leaving';
  updatePresence?: (presence: PartyMember) => Promise<void>;
}

export function useVoice({ currentUser, partyState, updatePresence }: VoiceHookProps) {
  // Core state machine
  const [state, setState] = useState<VoiceState>({ status: 'idle' });
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const lastVolumeRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const lastPresenceUpdateRef = useRef(0);

  // Refs for intervals/cleanup
  const volumeIntervalRef = useRef<number | null>(null);
  const { getClient } = useAgoraContext();

  // Function refs for stable references
  const connectRef = useRef<() => Promise<void>>(null!);
  const handleDisconnectRef = useRef<(error?: Error) => Promise<void>>(null!);

  // Add state for tracking remote users
  const [remoteUsers, setRemoteUsers] = useState<Set<string>>(new Set());

  // Initialize stable function references
  connectRef.current = async () => {
    // Only attempt to connect if we're idle or disconnected
    if (state.status !== 'idle' && state.status !== 'disconnected') {
      return;
    }

    const attempt = state.status === 'disconnected' ? 1 : 0;
    setState({ status: 'connecting', attempt });

    try {
      // Initialize AudioContext first to handle autoplay policy
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Get client
      const client = await getClient();

      // Create track with explicit audio processing settings
      const track = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: {
          sampleRate: 48000,
          stereo: false,
          bitrate: 192, // Increased for better quality
        },
        AEC: true, // Echo cancellation
        ANS: true, // Noise suppression
        AGC: true, // Auto gain control
      });

      // Verify track is created and getting input
      const initialVolume = track.getVolumeLevel();
      logger.info('Audio track created', {
        action: 'connect',
        metadata: {
          initialVolume,
          sampleRate: 48000,
          bitrate: 192,
        },
      });

      // Generate UID
      const numericUid = parseInt(currentUser!.id.replace(/[^0-9]/g, '').slice(-4)) % 10000;

      // Get token
      const response = await fetch('/api/agora/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName: 'main-channel',
          uid: numericUid,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get token');
      }

      const { token } = await response.json();

      // Join channel
      await client.join(process.env.NEXT_PUBLIC_AGORA_APP_ID!, 'main-channel', token, numericUid);

      // Set up track
      await track.setEnabled(!isMuted);
      await client.publish(track);

      // Set up remote user handlers
      client.on('user-published', async (user, mediaType) => {
        try {
          if (mediaType === 'audio') {
            logger.info('Remote user published audio', {
              action: 'user-published',
              metadata: { userId: user.uid },
            });

            // Subscribe to the remote user's audio track
            await client.subscribe(user, mediaType);

            // Verify we got the audio track
            if (!user.audioTrack) {
              throw new Error('No audio track after subscription');
            }

            // Play the remote audio track
            user.audioTrack.play();

            // Track the new user
            setRemoteUsers((prev) => new Set([...Array.from(prev), user.uid.toString()]));

            logger.info('Subscribed and playing remote audio track', {
              action: 'subscribe',
              metadata: {
                userId: user.uid,
                currentRemoteUsers: Array.from(remoteUsers),
                totalUsers: remoteUsers.size + 1,
                hasAudioTrack: !!user.audioTrack,
                trackState: user.audioTrack?.isPlaying,
              },
            });
          }
        } catch (err) {
          logger.error('Failed to subscribe to remote user', {
            action: 'subscribe',
            metadata: {
              error: String(err),
              userId: user.uid,
              mediaType,
              hasAudioTrack: !!user.audioTrack,
            },
          });
        }
      });

      client.on('user-unpublished', async (user, mediaType) => {
        try {
          if (mediaType === 'audio') {
            // Stop playing the remote audio track
            user.audioTrack?.stop();

            // Unsubscribe from the remote user's audio track
            await client.unsubscribe(user, mediaType);

            // Remove the user from tracking
            setRemoteUsers((prev) => {
              const next = new Set(prev);
              next.delete(user.uid.toString());
              return next;
            });

            logger.info('Stopped and unsubscribed from remote audio track', {
              action: 'unsubscribe',
              metadata: {
                userId: user.uid,
                remainingUsers: Array.from(remoteUsers),
                totalUsers: remoteUsers.size - 1,
              },
            });
          }
        } catch (err) {
          logger.error('Failed to unsubscribe from remote user', {
            action: 'unsubscribe',
            metadata: { error: String(err), userId: user.uid },
          });
        }
      });

      // Add user-left handler
      client.on('user-left', async (user) => {
        logger.info('User left channel', {
          action: 'user-left',
          metadata: {
            userId: user.uid,
            remainingUsers: Array.from(remoteUsers),
            totalUsers: remoteUsers.size,
          },
        });
      });

      // Handle audio level warnings and errors
      const handleException = (event: any) => {
        // Audio device errors (1005-1013)
        if (event.code >= 1005 && event.code <= 1013) {
          logger.error('Audio device error', {
            action: 'audio-error',
            metadata: {
              code: event.code,
              msg: event.msg,
              isMuted,
              volume: track.getVolumeLevel() * 100,
              deviceState: {
                enabled: track.enabled,
                muted: track.muted,
              },
            },
          });

          // Handle specific audio device errors
          switch (event.code) {
            case 1005: // Unspecified audio device error
            case 1011: // Recording device initialization error
            case 1012: // Recording device start error
              void handleDisconnectRef.current?.(new Error(`Audio device error: ${event.msg}`));
              break;
          }
          return;
        }

        // Audio level warnings (2001, 2003)
        if (event.code === 2001 || event.code === 2003) {
          logger.warn('Audio level warning', {
            action: 'audio-warning',
            metadata: {
              code: event.code,
              msg: event.msg,
              isMuted,
              volume: track.getVolumeLevel() * 100,
              audioSettings: {
                bitrate: 192,
                sampleRate: 48000,
              },
            },
          });

          // Only attempt recovery if not muted
          if (!isMuted) {
            try {
              // Try to recover audio
              track.setVolume(150);

              // Check audio context
              const audioContext = new (window.AudioContext ||
                (window as any).webkitAudioContext)();
              if (audioContext.state === 'suspended') {
                void audioContext.resume();
              }

              // Try to reinitialize track if issues persist
              if (event.code === 2001) {
                // AUDIO_INPUT_LEVEL_TOO_LOW
                setTimeout(async () => {
                  const level = track.getVolumeLevel() * 100;
                  if (level < 1) {
                    logger.warn('Audio level still too low, attempting recovery', {
                      action: 'audio-recovery',
                      metadata: { currentLevel: level },
                    });
                    void handleDisconnectRef.current?.(new Error('Audio input level too low'));
                  }
                }, 5000);
              }
            } catch (err) {
              logger.error('Failed to recover from audio warning', {
                action: 'audio-recovery',
                metadata: { error: String(err) },
              });
            }
          }
        }

        // Connection/Network errors
        if ([111, 112].includes(event.code)) {
          logger.error('Network connection error', {
            action: 'connection-error',
            metadata: {
              code: event.code,
              msg: event.msg,
            },
          });
          void handleDisconnectRef.current?.(new Error(`Network error: ${event.msg}`));
        }
      };

      // Add event listeners with proper cleanup
      client.on('exception', handleException);

      // Add track-ended handler
      const handleTrackEnded = () => {
        logger.warn('Audio track ended unexpectedly', {
          action: 'track-ended',
          metadata: {
            isMuted,
            volume,
            lastKnownState: state.status,
          },
        });
        void handleDisconnectRef.current?.(new Error('Audio track ended unexpectedly'));
      };

      track.on('track-ended', handleTrackEnded);

      // Start volume monitoring
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
      }

      // Update volume monitoring interval
      volumeIntervalRef.current = window.setInterval(() => {
        try {
          // Skip volume monitoring entirely when muted
          if (isMuted) {
            if (volume !== 0 || isSpeaking) {
              setVolume(0);
              setIsSpeaking(false);
              isSpeakingRef.current = false;

              // Update presence with muted state immediately
              if (currentUser?.id && updatePresence) {
                void (async () => {
                  await updatePresence({
                    ...currentUser,
                    muted: true,
                    voice_status: 'muted',
                    _lastUpdate: Date.now(),
                  });
                  lastPresenceUpdateRef.current = Date.now();
                  logger.info('Voice state presence updated', {
                    action: 'presence-update',
                    metadata: {
                      newState: 'muted',
                      volume: 0,
                    },
                  });
                })();
              }
            }
            return;
          }

          // Get current volume level
          const currentLevel = track.getVolumeLevel();

          // Debug log volume levels
          logger.info('Volume level check', {
            action: 'volume-check',
            metadata: {
              currentLevel,
              isSpeaking: isSpeakingRef.current,
              lastUpdate: Date.now() - lastPresenceUpdateRef.current,
            },
          });

          // Always update volume state
          setVolume(currentLevel);
          lastVolumeRef.current = currentLevel;

          // Simple state machine with hysteresis
          const shouldBeginSpeaking = !isSpeakingRef.current && currentLevel > SPEAKING_THRESHOLD;
          const shouldStopSpeaking = isSpeakingRef.current && currentLevel < SILENCE_THRESHOLD;

          // Debug log state changes
          if (shouldBeginSpeaking || shouldStopSpeaking) {
            logger.info('Voice state change detected', {
              action: 'voice-state-change',
              metadata: {
                shouldBeginSpeaking,
                shouldStopSpeaking,
                currentLevel,
              },
            });
          }

          // Update state and presence if needed
          if (shouldBeginSpeaking || shouldStopSpeaking) {
            const newSpeakingState = shouldBeginSpeaking;
            setIsSpeaking(newSpeakingState);
            isSpeakingRef.current = newSpeakingState;

            // Create a complete presence object
            const presence: PartyMember = {
              id: currentUser!.id,
              name: currentUser!.name,
              avatar: currentUser!.avatar,
              game: currentUser!.game,
              is_active: currentUser!.is_active,
              created_at: currentUser!.created_at,
              last_seen: currentUser!.last_seen,
              voice_status: newSpeakingState ? 'speaking' : 'silent',
              muted: false,
              deafened_users: currentUser!.deafened_users,
              agora_uid: currentUser!.agora_uid,
              _lastUpdate: Date.now(),
              _lastVoiceUpdate: Date.now(),
            };

            // Force presence update
            if (currentUser?.id && updatePresence) {
              void (async () => {
                await updatePresence(presence);
                lastPresenceUpdateRef.current = Date.now();
                logger.info('Voice state presence updated', {
                  action: 'presence-update',
                  metadata: {
                    newState: presence.voice_status,
                    volume: currentLevel,
                  },
                });
              })();
            }
          }
        } catch (err) {
          // Track is invalid, stop monitoring
          logger.error('Volume monitoring failed', {
            action: 'volume-monitor',
            metadata: { error: String(err) },
          });

          if (volumeIntervalRef.current) {
            clearInterval(volumeIntervalRef.current);
            volumeIntervalRef.current = null;
          }
        }
      }, VOLUME_CHECK_INTERVAL);

      // Update state
      setState({ status: 'connected', track });

      // Set up disconnect handler
      client.on('connection-state-change', (curState, prevState) => {
        if (curState === 'DISCONNECTED' && prevState === 'CONNECTED') {
          void handleDisconnectRef.current?.();
        }
      });
    } catch (error) {
      void handleDisconnectRef.current?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  handleDisconnectRef.current = async (error?: Error) => {
    // Clean up volume monitoring
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }

    // Clean up track if we have one
    if (state.status === 'connected') {
      const { track } = state;
      try {
        track.removeAllListeners();
        // Check if track is still valid before operations
        try {
          // If this doesn't throw, the track is still valid
          track.getVolumeLevel();
          await track.setEnabled(false);
          track.close();
        } catch {
          // Track is already cleaned up, ignore
        }
      } catch (err) {
        logger.error('Track cleanup failed', {
          action: 'handleDisconnect',
          metadata: { error: String(err) },
        });
      }
    }

    // Clean up client
    try {
      const client = await getClient();
      client.removeAllListeners();
      await client.leave();
    } catch (err) {
      logger.error('Client cleanup failed', {
        action: 'handleDisconnect',
        metadata: { error: String(err) },
      });
    }

    // If we were connecting and hit max retries, go to disconnected
    if (state.status === 'connecting' && state.attempt >= MAX_VOICE_JOIN_RETRIES) {
      setState({ status: 'disconnected', error });
      return;
    }

    // If we were connected or hit an error while connecting, try to reconnect
    if (state.status === 'connected' || (state.status === 'connecting' && error)) {
      const nextAttempt = (state.status === 'connecting' ? state.attempt : 0) + 1;
      const delayMs = VOICE_RETRY_DELAY * Math.pow(2, nextAttempt - 1);

      setTimeout(() => {
        setState({ status: 'connecting', attempt: nextAttempt });
        void connectRef.current?.();
      }, delayMs);
    }
  };

  // Expose stable function references via useCallback
  const connect = useCallback(() => connectRef.current?.(), []);
  const handleDisconnect = useCallback((error?: Error) => handleDisconnectRef.current?.(error), []);

  // Handle microphone permissions
  const requestMicrophonePermission = useCallback(async () => {
    setState({ status: 'requesting_permissions' });

    try {
      // Check permissions API first
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (result.state === 'denied') {
          setState({ status: 'permission_denied' });
          return false;
        }
      }

      // Try to get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Clean up test stream
      stream.getTracks().forEach((track) => track.stop());

      setState({ status: 'idle' });
      return true;
    } catch (err) {
      const error = err as Error;
      const isPermissionDenied =
        error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError';

      if (isPermissionDenied) {
        setState({ status: 'permission_denied' });
        return false;
      }

      setState({ status: 'disconnected', error });
      return false;
    }
  }, []);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    if (state.status === 'connected') {
      try {
        const { track } = state;
        const newMutedState = !isMuted;

        // First update local state
        setIsMuted(newMutedState);

        // Then update track
        await track.setEnabled(!newMutedState);

        // Reset volume and speaking state when muting
        if (newMutedState) {
          lastVolumeRef.current = 0;
          setVolume(0);
          setIsSpeaking(false);
        }

        // Finally update presence with complete state
        if (currentUser?.id && updatePresence) {
          // Create a complete presence update that preserves all fields
          const presence: PartyMember = {
            id: currentUser.id,
            name: currentUser.name,
            avatar: currentUser.avatar,
            game: currentUser.game,
            is_active: currentUser.is_active,
            created_at: currentUser.created_at,
            last_seen: currentUser.last_seen,
            voice_status: newMutedState ? ('muted' as const) : ('silent' as const),
            muted: newMutedState,
            deafened_users: currentUser.deafened_users,
            agora_uid: currentUser.agora_uid,
            _lastUpdate: Date.now(),
          };

          await updatePresence(presence);

          logger.info('Voice state updated after mute toggle', {
            action: 'toggleMute',
            metadata: {
              newState: presence.voice_status,
              muted: presence.muted,
              volume: 0,
              isSpeaking: false,
            },
          });
        }
      } catch (err) {
        // Revert local state on error
        setIsMuted(isMuted);
        logger.error('Failed to toggle mute', {
          action: 'toggleMute',
          metadata: { error: String(err) },
        });
      }
    }
  }, [state, isMuted, currentUser, updatePresence]);

  // Handle party state changes
  useEffect(() => {
    if (partyState === 'joined' && currentUser?.id) {
      void connect();
    } else if (partyState === 'leaving' || partyState === 'idle') {
      void handleDisconnect();
    }
  }, [partyState, currentUser, connect, handleDisconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
      }
      void handleDisconnect();
    };
  }, [handleDisconnect]);

  return {
    state,
    isMuted,
    volume,
    isSpeaking,
    remoteUsers: Array.from(remoteUsers),
    remoteUserCount: remoteUsers.size,
    requestMicrophonePermission,
    toggleMute,
    connect,
    disconnect: handleDisconnect,
  };
}

// Default export with default props
export default function useVoiceWithDefaults(props: Partial<VoiceHookProps> = {}) {
  return useVoice({
    currentUser: props.currentUser || null,
    partyState: props.partyState || 'idle',
    updatePresence: props.updatePresence,
  });
}
