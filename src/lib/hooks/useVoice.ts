'use client';

/* eslint-disable @typescript-eslint/no-floating-promises */
import { useCallback, useEffect, useRef, useState } from 'react';
import { IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { useAgoraContext } from '@/components/providers/AgoraProvider';
import { PartyMember } from '@/lib/types/party';
import { logger } from '@/lib/utils/logger';
import { Mutex } from 'async-mutex';

const VOLUME_CHECK_INTERVAL = 100;
const VOICE_JOIN_TIMEOUT = navigator.userAgent.includes('Firefox') ? 45000 : 30000; // 45 seconds for Firefox, 30 for others
const VOICE_RETRY_DELAY = 2000; // 2 seconds between retries
const MAX_VOICE_JOIN_RETRIES = 3;

// Create a single mutex instance for all hook instances
const voiceMutex = new Mutex();

interface VoiceHookProps {
  currentUser?: PartyMember | null;
  partyState?: 'idle' | 'joining' | 'joined' | 'leaving';
}

export function useVoice({ currentUser, partyState }: VoiceHookProps) {
  const { getClient } = useAgoraContext();
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);
  const trackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<number | null>(null);
  const joinTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // Add refs for state values that need to be accessed in async contexts
  const stateRef = useRef({
    isMuted: false,
    isJoining: false,
    micPermissionDenied: false
  });

  // Update state refs when state changes
  useEffect(() => {
    stateRef.current.isMuted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    stateRef.current.isJoining = isJoining;
  }, [isJoining]);

  useEffect(() => {
    stateRef.current.micPermissionDenied = micPermissionDenied;
  }, [micPermissionDenied]);

  // Add track event handlers with better error handling
  const setupTrackListeners = useCallback((track: IMicrophoneAudioTrack) => {
    const handleTrackEnded = () => {
      logger.info('Track ended', {
        action: 'track-ended',
        metadata: {
          trackId: track.getTrackId(),
          reason: 'ended'
        }
      });
      if (mountedRef.current) {
        setIsSpeaking(false);
      }
    };

    const handleTrackUpdated = () => {
      logger.debug('Track updated', {
        action: 'track-updated',
        metadata: {
          trackId: track.getTrackId(),
          enabled: track.enabled,
          muted: track.muted
        }
      });
    };

    track.on('track-ended', handleTrackEnded);
    track.on('track-updated', handleTrackUpdated);

    return () => {
      track.off('track-ended', handleTrackEnded);
      track.off('track-updated', handleTrackUpdated);
    };
  }, []);

  // Enhanced track management with better cleanup
  const setTrack = useCallback(async (newTrack: IMicrophoneAudioTrack | null) => {
    const currentTrack = trackRef.current;
    if (currentTrack && currentTrack !== newTrack) {
      try {
        logger.debug('Cleaning up existing track', {
          action: 'setTrack',
          metadata: {
            trackId: currentTrack.getTrackId(),
            enabled: currentTrack.enabled
          }
        });
        currentTrack.removeAllListeners();
        await currentTrack.setEnabled(false);
        currentTrack.close();
      } catch (err) {
        logger.error('Error closing track', {
          action: 'setTrack',
          metadata: { 
            error: err,
            trackId: currentTrack.getTrackId()
          }
        });
      }
    }

    if (newTrack && mountedRef.current) {
      try {
        logger.debug('Initializing new track', {
          action: 'setTrack',
          metadata: {
            trackId: newTrack.getTrackId(),
            label: newTrack.getTrackLabel()
          }
        });
        const cleanup = setupTrackListeners(newTrack);
        // Use ref state instead of closure state
        await newTrack.setEnabled(!stateRef.current.isMuted);
        trackRef.current = newTrack;
        return cleanup;
      } catch (err) {
        logger.error('Error initializing track', {
          action: 'setTrack',
          metadata: { 
            error: err,
            trackId: newTrack.getTrackId()
          }
        });
        if (mountedRef.current) {
          setLastError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    } else {
      trackRef.current = null;
    }
  }, [setupTrackListeners]); // Remove isMuted from dependencies

  // Enhanced cleanup with timeouts
  const cleanup = useCallback(async () => {
    const release = await voiceMutex.acquire();
    try {
      // Check if already cleaning up
      if (!mountedRef.current) {
        logger.debug('Skipping cleanup - component unmounted', {
          action: 'cleanup'
        });
        return;
      }

      logger.debug('Starting voice cleanup', {
        action: 'cleanup',
        metadata: { 
          hasTrack: !!trackRef.current,
          isHotReload: !!(window as any).__NEXT_DATA__?.buildId
        }
      });

      // Clear all intervals/timeouts atomically
      const timeouts = [
        volumeIntervalRef,
        retryTimeoutRef,
        joinTimeoutRef
      ];
      
      timeouts.forEach(ref => {
        if (ref.current) {
          window.clearTimeout(ref.current);
          ref.current = null;
        }
      });

      // Ensure track cleanup happens before client cleanup
      await setTrack(null);

      try {
        const client = await getClient();
        const connectionState = client.connectionState;
        
        if (connectionState !== 'DISCONNECTED') {
          logger.debug('Leaving voice channel', {
            action: 'cleanup',
            metadata: { 
              connectionState,
              channelName: client.channelName 
            }
          });
          await client.leave();
        }
      } catch (err) {
        // Only log error if not during hot reload
        if (!((window as any).__NEXT_DATA__?.buildId)) {
          logger.error('Error leaving voice channel', {
            action: 'cleanup',
            metadata: { error: err }
          });
        }
      }

      if (mountedRef.current) {
        setIsMuted(false);
        setVolume(0);
        setIsSpeaking(false);
        setIsJoining(false);
        setLastError(null);
        retryCountRef.current = 0;
      }
    } catch (err) {
      logger.error('Error during cleanup', {
        action: 'cleanup',
        metadata: { error: err }
      });
    } finally {
      release();
    }
  }, [getClient, setTrack]);

  // Enhanced microphone permission request with better error handling
  const requestMicrophonePermission = useCallback(async () => {
    const release = await voiceMutex.acquire();
    try {
      logger.debug('Starting microphone permission request', {
        action: 'requestMicrophonePermission',
        metadata: {
          userAgent: navigator.userAgent,
          timeout: VOICE_JOIN_TIMEOUT
        }
      });

      // Check permissions API first to determine if blocked
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (result.state === 'denied') {
            logger.info('Microphone permission is blocked in browser settings', {
              action: 'requestMicrophonePermission',
              metadata: { state: result.state }
            });
            if (mountedRef.current) {
              setMicPermissionDenied(true);
            }
            // Show Firefox-specific instructions
            window.alert(
              'Microphone access is blocked. You must change browser settings to enable it:\n\n' +
              '1. Click the lock icon in the address bar\n' +
              '2. Click "Connection Secure"\n' +
              '3. Click "More Information"\n' +
              '4. Go to "Permissions" tab\n' +
              '5. Find "Use the Microphone" and remove the setting or change to "Allow"\n' +
              '6. Return to this page and click "Re-request Mic" again\n\n' +
              'Note: Simply refreshing the page will not work until you change this setting.'
            );
            return false;
          }
        } catch (permErr) {
          logger.warn('Failed to query microphone permission state', {
            action: 'requestMicrophonePermission',
            metadata: { error: permErr }
          });
        }
      }

      // Try to get microphone access
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        
        logger.debug('Successfully got microphone stream', {
          action: 'requestMicrophonePermission',
          metadata: { 
            tracks: stream.getAudioTracks().length,
            trackSettings: stream.getAudioTracks()[0]?.getSettings(),
            trackLabels: stream.getAudioTracks().map(t => t.label)
          }
        });

        // Clean up test stream
        stream.getTracks().forEach(track => {
          track.stop();
          logger.debug('Stopped test track', {
            action: 'requestMicrophonePermission',
            metadata: { 
              trackId: track.id,
              trackLabel: track.label,
              trackEnabled: track.enabled
            }
          });
        });
        
        if (mountedRef.current) {
          setMicPermissionDenied(false);
        }
        return true;
      } catch (err) {
        const error = err as Error;
        const isPermissionDenied = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError';
        
        if (isPermissionDenied) {
          logger.info('User denied microphone permission', {
            action: 'requestMicrophonePermission',
            metadata: { 
              name: error.name,
              message: error.message
            }
          });
          
          if (mountedRef.current) {
            setMicPermissionDenied(true);
          }
          return false;
        }

        logger.error('Failed to get microphone stream', {
          action: 'requestMicrophonePermission',
          metadata: { 
            name: error.name,
            message: error.message,
            stack: error.stack
          }
        });
        throw error;
      }
    } finally {
      release();
    }
  }, []);

  // Enhanced voice join with timeouts and better error handling
  const joinVoice = useCallback(async () => {
    // Capture current state values before starting
    const userId = currentUser?.id;
    const currentPartyState = partyState;

    // Verify app ID is available first
    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
    if (!appId) {
      logger.error('Voice join failed - Agora App ID not configured', {
        action: 'joinVoice'
      });
      if (mountedRef.current) {
        setLastError(new Error('Agora App ID not configured'));
      }
      return;
    }

    // Set join timeout
    if (joinTimeoutRef.current) {
      window.clearTimeout(joinTimeoutRef.current);
    }
    
    let joinPromiseResolve: () => void = () => {}; // Initialize with no-op
    const joinTimeout = new Promise<void>((resolve, reject) => {
      joinPromiseResolve = resolve;
      joinTimeoutRef.current = window.setTimeout(() => {
        reject(new Error('Voice join timed out'));
      }, VOICE_JOIN_TIMEOUT);
    });

    // Acquire mutex for voice join
    logger.debug('Attempting to acquire voice mutex', {
      action: 'joinVoice',
      metadata: { 
        userId, 
        partyState: currentPartyState,
        isJoining: stateRef.current.isJoining 
      }
    });

    const release = await voiceMutex.acquire();
    try {
      // Double check state hasn't changed while waiting for mutex
      if (!mountedRef.current || partyState !== currentPartyState) {
        logger.debug('State changed while waiting for mutex', {
          action: 'joinVoice',
          metadata: {
            mounted: mountedRef.current,
            expectedState: currentPartyState,
            actualState: partyState
          }
        });
        return;
      }

      if (mountedRef.current) {
        setIsJoining(true);
      }

      // Check requirements using captured values first
      if (!userId) {
        logger.debug('Voice join failed - no user ID', {
          action: 'joinVoice',
          metadata: { userId }
        });
        if (mountedRef.current) {
          setIsJoining(false);
        }
        return;
      }

      if (currentPartyState !== 'joined') {
        logger.debug('Voice join failed - party not joined', {
          action: 'joinVoice',
          metadata: { partyState: currentPartyState }
        });
        if (mountedRef.current) {
          setIsJoining(false);
        }
        return;
      }

      // Skip microphone permission check if already granted
      if (stateRef.current.micPermissionDenied) {
        logger.debug('Voice join failed - microphone permission denied', {
          action: 'joinVoice'
        });
        if (mountedRef.current) {
          setIsJoining(false);
        }
        return;
      }

      // Reset retry count since requirements are met
      retryCountRef.current = 0;
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // Clean up any existing resources
      logger.debug('Cleaning up existing resources', {
        action: 'joinVoice'
      });
      await cleanup();
      
      // Get initialized client
      logger.debug('Getting Agora client', {
        action: 'joinVoice'
      });
      const client = await getClient();
      logger.debug('Got Agora client', {
        action: 'joinVoice',
        metadata: { 
          clientState: client.connectionState,
          clientId: client.uid,
          hasAppId: !!appId
        }
      });

      // Convert string UUID to numeric UID for Agora
      const numericUid = parseInt(userId.replace(/[^0-9]/g, '').slice(0, 10));
      
      // Generate token
      logger.debug('Starting token generation request', {
        action: 'joinVoice',
        metadata: { 
          url: '/api/agora/token',
          channelName: 'main',
          numericUid,
          hasAppId: !!appId,
          clientState: client.connectionState
        }
      });

      const tokenResponse = await fetch('/api/agora/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelName: 'main',
          uid: numericUid,
        }),
      }).catch(err => {
        logger.error('Token request network error', {
          action: 'joinVoice',
          metadata: { error: err }
        });
        throw err;
      });

      logger.debug('Token response received', {
        action: 'joinVoice',
        metadata: { 
          status: tokenResponse.status,
          ok: tokenResponse.ok,
          statusText: tokenResponse.statusText,
          headers: Object.fromEntries(tokenResponse.headers.entries())
        }
      });

      if (!tokenResponse.ok) {
        const responseText = await tokenResponse.text().catch(() => 'Failed to get response text');
        logger.error('Failed to generate token', {
          action: 'joinVoice',
          metadata: { 
            status: tokenResponse.status,
            numericUid,
            responseText,
            headers: Object.fromEntries(tokenResponse.headers.entries())
          }
        });
        throw new Error(`Failed to generate token: ${responseText}`);
      }

      const { token } = await tokenResponse.json().catch(err => {
        logger.error('Failed to parse token response', {
          action: 'joinVoice',
          metadata: { error: err }
        });
        throw err;
      });
      
      // Join channel with token and numeric UID
      logger.debug('Joining Agora channel', {
        action: 'joinVoice',
        metadata: { 
          userId, 
          numericUid, 
          appId,
          clientState: client.connectionState,
          tokenLength: token.length
        }
      });

      // Race the join operation against the timeout
      await Promise.race([
        client.join(appId, 'main', token, numericUid),
        joinTimeout
      ]).catch(err => {
        logger.error('Failed to join channel', {
          action: 'joinVoice',
          metadata: { error: err }
        });
        throw err;
      });

      logger.debug('Joined Agora channel', {
        action: 'joinVoice',
        metadata: { 
          userId, 
          numericUid,
          clientState: client.connectionState
        }
      });

      // Create and publish track
      logger.debug('Creating microphone track', {
        action: 'joinVoice'
      });
      const track = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: {
          sampleRate: 48000,
          stereo: false,
          bitrate: 128
        }
      }).catch(err => {
        logger.error('Failed to create microphone track', {
          action: 'joinVoice',
          metadata: { error: err }
        });
        throw err;
      });

      logger.debug('Created microphone track', {
        action: 'joinVoice',
        metadata: { 
          trackId: track.getTrackId(),
          trackLabel: track.getTrackLabel(),
          enabled: track.enabled
        }
      });

      if (!mountedRef.current) {
        track.close();
        throw new Error('Component unmounted during join');
      }

      logger.debug('Setting track', {
        action: 'joinVoice'
      });
      await setTrack(track);

      logger.debug('Publishing track', {
        action: 'joinVoice'
      });
      await client.publish([track]).catch(err => {
        logger.error('Failed to publish track', {
          action: 'joinVoice',
          metadata: { error: err }
        });
        throw err;
      });

      logger.debug('Published audio track', {
        action: 'joinVoice',
        metadata: { trackId: track.getTrackId() }
      });

      // Start volume monitoring
      if (volumeIntervalRef.current) {
        window.clearInterval(volumeIntervalRef.current);
      }

      volumeIntervalRef.current = window.setInterval(() => {
        if (trackRef.current && mountedRef.current) {
          const currentVolume = trackRef.current.getVolumeLevel() * 100;
          setVolume(prev => {
            // Only update if changed significantly to reduce renders
            return Math.abs(prev - currentVolume) > 5 ? currentVolume : prev;
          });
          setIsSpeaking(currentVolume > 20);
        }
      }, VOLUME_CHECK_INTERVAL);

      logger.info('Successfully joined voice', {
        action: 'joinVoice',
        metadata: { userId },
      });
      
      if (mountedRef.current) {
        setIsJoining(false);
      }

      // Resolve join timeout if successful
      joinPromiseResolve();
    } catch (err) {
      logger.error('Failed to join voice', {
        action: 'joinVoice',
        metadata: { 
          message: err instanceof Error ? err.message : String(err),
          retryCount: retryCountRef.current,
          stack: err instanceof Error ? err.stack : undefined
        }
      });

      // Always clean up on error
      await cleanup();
      
      if (mountedRef.current) {
        setIsJoining(false);
        setLastError(err instanceof Error ? err : new Error(String(err)));

        // Schedule retry if appropriate
        if (retryCountRef.current < MAX_VOICE_JOIN_RETRIES) {
          retryCountRef.current++;
          retryTimeoutRef.current = window.setTimeout(() => {
            void joinVoice();
          }, VOICE_RETRY_DELAY * Math.pow(2, retryCountRef.current - 1));
        }
      }
    } finally {
      release();
      if (joinTimeoutRef.current) {
        window.clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
    }
  }, [currentUser, partyState, cleanup, getClient, setTrack]);

  const toggleMute = useCallback(async () => {
    const release = await voiceMutex.acquire();
    try {
      if (trackRef.current) {
        const newMutedState = !isMuted;
        await trackRef.current.setEnabled(!newMutedState);
        if (mountedRef.current) {
          setIsMuted(newMutedState);
        }
        logger.debug('Toggled mute state', {
          action: 'toggleMute',
          metadata: { 
            newState: newMutedState,
            trackId: trackRef.current.getTrackId()
          }
        });
      }
    } catch (err) {
      logger.error('Failed to toggle mute', {
        action: 'toggleMute',
        metadata: { error: err }
      });
    } finally {
      release();
    }
  }, [isMuted]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let timeoutId: number | null = null;
    let cleanupTimeoutId: number | null = null;
    
    // Skip initial join if this is a hot reload
    const isHotReload = !!(window as any).__NEXT_DATA__?.buildId;
    
    if (partyState === 'joined' && currentUser?.id && !isHotReload) {
      // Clear any pending cleanup
      if (cleanupTimeoutId) {
        window.clearTimeout(cleanupTimeoutId);
        cleanupTimeoutId = null;
      }
      // Add delay before join to allow presence sync
      timeoutId = window.setTimeout(() => {
        void joinVoice();
      }, 3000); // Increased from 2000ms to 3000ms to ensure presence is fully synced
    } else if (partyState === 'leaving') {
      // Immediate cleanup when leaving
      void cleanup();
    } else if (partyState === 'idle' && !isJoining) {
      // Add longer delay before cleanup to allow join to complete if in progress
      cleanupTimeoutId = window.setTimeout(() => {
        if (!isJoining) { // Double check we're not joining before cleanup
          void cleanup();
        }
      }, 3000); // Increased from 2000ms to 3000ms to ensure join has time to complete
    }

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (cleanupTimeoutId) {
        window.clearTimeout(cleanupTimeoutId);
      }
      // Only cleanup on unmount if we're not in the middle of joining and not a hot reload
      if (!isJoining && !isHotReload) {
        void cleanup();
      }
    };
  }, [currentUser, partyState, cleanup, joinVoice, isJoining]);

  return {
    micPermissionDenied,
    requestMicrophonePermission,
    joinVoice,
    toggleMute,
    volume,
    isSpeaking,
    isMuted,
    isJoining,
    lastError,
    track: trackRef.current,
    setTrack,
    cleanup
  };
}

// Add default export with default props
export default function useVoiceWithDefaults(props: Partial<VoiceHookProps> = {}) {
  return useVoice({
    currentUser: props.currentUser || null,
    partyState: props.partyState || 'idle'
  });
}
