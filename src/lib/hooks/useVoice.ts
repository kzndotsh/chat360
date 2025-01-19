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
const VOLUME_SMOOTHING_FACTOR = 0.3; // Lower = smoother, but more latency

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
  
  // Refs for intervals/cleanup
  const volumeIntervalRef = useRef<number | null>(null);
  const { getClient } = useAgoraContext();

  // Function refs for stable references
  const connectRef = useRef<() => Promise<void>>(null!);
  const handleDisconnectRef = useRef<(error?: Error) => Promise<void>>(null!);

  // Initialize stable function references
  connectRef.current = async () => {
    // Only attempt to connect if we're idle or disconnected
    if (state.status !== 'idle' && state.status !== 'disconnected') {
      return;
    }

    const attempt = state.status === 'disconnected' ? 1 : 0;
    setState({ status: 'connecting', attempt });

    try {
      // Get client
      const client = await getClient();
      
      // Create track
      const track = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: {
          sampleRate: 48000,
          stereo: false,
          bitrate: 64
        },
        AEC: true,
        ANS: true,
        AGC: true
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
      await client.join(
        process.env.NEXT_PUBLIC_AGORA_APP_ID!,
        'main-channel',
        token,
        numericUid
      );

      // Set up track
      await track.setEnabled(!isMuted);
      
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
            }
            return;
          }

          // If this doesn't throw, the track is still valid
          const currentLevel = track.getVolumeLevel() * 100;
          // Smooth the volume changes
          const smoothedLevel = lastVolumeRef.current + (currentLevel - lastVolumeRef.current) * VOLUME_SMOOTHING_FACTOR;
          lastVolumeRef.current = smoothedLevel;
          
          setVolume(smoothedLevel);
          const isSpeakingNow = smoothedLevel > 30; // Match VoiceStatusIcon threshold
          
          // Only update speaking state and presence if it would change
          if (isSpeaking !== isSpeakingNow) {
            setIsSpeaking(isSpeakingNow);
            
            // Only update presence if we have the required data and track is valid
            if (currentUser?.id && updatePresence) {
              const newVoiceStatus = isSpeakingNow ? ('speaking' as const) : ('silent' as const);
              // Only update if voice status would change
              if (currentUser.voice_status !== newVoiceStatus) {
                const presence = {
                  ...currentUser,
                  muted: false, // Ensure muted state is correct
                  voice_status: newVoiceStatus
                };
                void updatePresence(presence);
              }
            }
          }
        } catch {
          // Track is invalid, stop monitoring
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
          metadata: { error: String(err) }
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
        metadata: { error: String(err) }
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
          autoGainControl: true
        }
      });

      // Clean up test stream
      stream.getTracks().forEach(track => track.stop());
      
      setState({ status: 'idle' });
      return true;
    } catch (err) {
      const error = err as Error;
      const isPermissionDenied = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError';
      
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
        try {
          // If this doesn't throw, the track is still valid
          track.getVolumeLevel();
          const newMutedState = !isMuted;
          
          // Update state and track first
          setIsMuted(newMutedState);
          await track.setEnabled(!newMutedState);
          
          // Reset volume and speaking state when muting
          if (newMutedState) {
            lastVolumeRef.current = 0;
            setVolume(0);
            setIsSpeaking(false);
          }
          
          // Then update presence once with all changes
          if (currentUser?.id && updatePresence) {
            const presence = {
              ...currentUser,
              muted: newMutedState,
              // If muted, always show as muted. If unmuted, use current volume to determine status
              voice_status: newMutedState ? ('muted' as const) : (volume > 30 ? ('speaking' as const) : ('silent' as const))
            };
            await updatePresence(presence);
          }

        } catch {
          // Track is invalid, log warning
          logger.warn('Track is invalid, ignoring mute request', {
            action: 'toggleMute'
          });
        }
      } catch (err) {
        logger.error('Mute toggle failed', {
          action: 'toggleMute',
          metadata: { error: String(err) }
        });
      }
    }
  }, [state, isMuted, currentUser, updatePresence, volume]);

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
    requestMicrophonePermission,
    toggleMute,
    connect,
    disconnect: handleDisconnect
  };
}

// Default export with default props
export default function useVoiceWithDefaults(props: Partial<VoiceHookProps> = {}) {
  return useVoice({
    currentUser: props.currentUser || null,
    partyState: props.partyState || 'idle',
    updatePresence: props.updatePresence
  });
}
