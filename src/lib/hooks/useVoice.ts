'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useVoiceStore } from '@/lib/stores/useVoiceStore';
import { logger } from '@/lib/utils/logger';
import { usePartyState } from './usePartyState';
import { useAgoraContext } from '@/components/providers/AgoraProvider';
import AgoraRTC, { IAgoraRTCClient, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

if (!process.env.NEXT_PUBLIC_AGORA_APP_ID) {
  throw new Error('NEXT_PUBLIC_AGORA_APP_ID is required');
}

const LOG_CONTEXT = { component: 'useVoice' };

const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;

// Helper function to handle client subscription
function subscribeToConnectionState(
  client: IAgoraRTCClient,
  onStateChange: (curState: string, prevState: string) => void
) {
  // Log initial state
  logger.info('Current Agora connection state', {
    ...LOG_CONTEXT,
    action: 'connectionState',
    metadata: { 
      state: client.connectionState,
      uid: client.uid,
      channelName: client.channelName
    }
  });

  // Define event handlers with proper types from Agora SDK
  const handlePublishedUsers = (users: IAgoraRTCRemoteUser[]) => {
    logger.debug('Published users in channel', {
      ...LOG_CONTEXT,
      action: 'publishedUsers',
      metadata: { users }
    });
  };

  const handleUserJoined = (user: IAgoraRTCRemoteUser) => {
    logger.debug('User joined channel', {
      ...LOG_CONTEXT,
      action: 'userJoined',
      metadata: { user }
    });
  };

  const handleUserLeft = (user: IAgoraRTCRemoteUser) => {
    logger.debug('User left channel', {
      ...LOG_CONTEXT,
      action: 'userLeft',
      metadata: { user }
    });
  };

  // Subscribe to events
  client.on('connection-state-change', onStateChange);
  client.on('user-published', handlePublishedUsers);
  client.on('user-joined', handleUserJoined);
  client.on('user-left', handleUserLeft);
  
  // Return cleanup function
  return () => {
    client.off('connection-state-change', onStateChange);
    client.off('user-published', handlePublishedUsers);
    client.off('user-joined', handleUserJoined);
    client.off('user-left', handleUserLeft);
  };
}

// Separate hook for handling connection state changes
function useConnectionState(
  client: IAgoraRTCClient | null,
  isReconnecting: boolean,
  onDisconnect: () => void
): boolean {
  const [isConnected, setIsConnected] = useState(false);
  const lastStateRef = useRef<string | null>(null);

  useEffect(() => {
    if (!client) {
      setIsConnected(false);
      return;
    }

    function handleConnectionStateChange(curState: string, prevState: string) {
      lastStateRef.current = curState;
      
      // Safe access to client properties
      const metadata = client ? {
        curState, 
        prevState,
        uid: client.uid,
        channelName: client.channelName,
        localTracks: client.localTracks.length,
        remoteUsers: client.remoteUsers.length
      } : {
        curState,
        prevState
      };
      
      logger.info('Agora connection state changed', {
        ...LOG_CONTEXT,
        action: 'connectionStateChange',
        metadata
      });

      setIsConnected(curState === 'CONNECTED');

      // Handle disconnection scenarios
      if (curState === 'DISCONNECTED' && prevState === 'CONNECTED') {
        logger.warn('Agora connection disconnected', {
          ...LOG_CONTEXT,
          action: 'disconnect',
          metadata: { 
            isReconnecting,
            lastState: lastStateRef.current,
            uid: client?.uid
          }
        });
        
        if (!isReconnecting) {
          onDisconnect();
        }
      }
    }

    // Set initial state and log it
    const initialState = client.connectionState;
    setIsConnected(initialState === 'CONNECTED');
    
    logger.info('Initializing Agora connection state monitoring', {
      ...LOG_CONTEXT,
      action: 'initConnectionState',
      metadata: { 
        initialState,
        uid: client.uid,
        channelName: client.channelName
      }
    });

    // Subscribe to state changes and get cleanup function
    const cleanup = subscribeToConnectionState(client, handleConnectionStateChange);
    
    // Return cleanup function
    return () => {
      cleanup();
      setIsConnected(false);
      logger.debug('Cleaned up Agora connection state monitoring', LOG_CONTEXT);
    };
  }, [client, isReconnecting, onDisconnect]);

  return isConnected;
}

export function useVoice() {
  const { currentUser, partyState } = usePartyState();
  const { client, getClient, cleanupClient } = useAgoraContext();
  const { track, setTrack } = useVoiceStore();
  const [isMuted, setIsMuted] = useState(false);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [voiceToken, setVoiceToken] = useState<string | null>(null);
  const joinAttemptedRef = useRef(false);
  const permissionRequestInProgressRef = useRef(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttemptRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY = 1000;

  // Memoize createAudioTrack to avoid recreating it on every render
  const createAudioTrack = useCallback(async () => {
    try {
      // Request permissions first to handle denials gracefully
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        // Optimize for voice chat
        encoderConfig: {
          sampleRate: 48000,
          stereo: false,
          bitrate: 64, // Lower bitrate optimized for voice
        },
        // Enable echo cancellation and noise suppression
        AEC: true,
        ANS: true,
        // Automatically manage audio routing
        bypassWebAudio: false
      });

      // Monitor track state
      audioTrack.on("track-ended", () => {
        logger.warn('Audio track ended unexpectedly', {
          ...LOG_CONTEXT,
          action: 'trackEnded',
          metadata: {
            trackId: audioTrack.getTrackId(),
            muted: audioTrack.muted
          }
        });
      });

      logger.debug('Audio track created successfully', {
        ...LOG_CONTEXT,
        action: 'createAudioTrack',
        metadata: {
          trackId: audioTrack.getTrackId(),
          muted: audioTrack.muted
        }
      });

      return audioTrack;
    } catch (error) {
      logger.error('Failed to create audio track', {
        ...LOG_CONTEXT,
        action: 'createAudioTrackError',
        metadata: { 
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : error
        }
      });
      throw error;
    }
  }, []); // No dependencies needed as it doesn't use any external values

  // Update cleanup to include all dependencies
  const cleanup = useCallback(async () => {
    const startTime = new Date().toISOString();
    logger.info('Starting voice cleanup', {
      ...LOG_CONTEXT,
      action: 'cleanup',
      metadata: {
        startTime,
        hasTrack: !!track,
        hasClient: !!client,
        clientState: client?.connectionState,
        joinAttempted: joinAttemptedRef.current
      }
    });

    try {
      // Stop and close track first
      if (track) {
        logger.debug('Stopping and closing audio track', {
          ...LOG_CONTEXT,
          action: 'cleanup_track',
          metadata: {
            trackId: track.getTrackId(),
            timestamp: startTime
          }
        });
        track.stop();
        track.close();
        setTrack(null);
      }
      
      // Leave channel if connected
      if (client && client.connectionState !== 'DISCONNECTED') {
        logger.debug('Leaving voice channel', {
          ...LOG_CONTEXT,
          action: 'cleanup_leave',
          metadata: {
            connectionState: client.connectionState,
            channelName: client.channelName,
            timestamp: startTime
          }
        });
        await client.leave();
      }
      
      // Clean up client
      await cleanupClient();
      joinAttemptedRef.current = false;
      setMicPermissionDenied(false);
      reconnectAttemptRef.current = 0;
      
      logger.info('Successfully cleaned up voice connection', {
        ...LOG_CONTEXT,
        action: 'cleanup_success',
        metadata: {
          hadTrack: !!track,
          hadClient: !!client,
          duration: new Date().getTime() - new Date(startTime).getTime(),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to cleanup voice connection', {
        ...LOG_CONTEXT,
        action: 'cleanup_error',
        metadata: { 
          error,
          hadTrack: !!track,
          hadClient: !!client,
          duration: new Date().getTime() - new Date(startTime).getTime(),
          timestamp: new Date().toISOString()
        }
      });
    }
  }, [track, client, setTrack, cleanupClient]);

  // Update leaveVoice to include client dependency
  const leaveVoice = useCallback(async () => {
    try {
      if (client) {
        await client.leave();
      }
      setTrack(null);
      logger.info('Successfully left voice', LOG_CONTEXT);
    } catch (error) {
      logger.error('Failed to leave voice', {
        ...LOG_CONTEXT,
        action: 'leaveVoice',
        metadata: { error }
      });
      throw error;
    }
  }, [client, setTrack]);

  // Memoize joinVoice to include all its dependencies
  const joinVoice = useCallback(async () => {
    // Don't throw if no user ID, just return
    if (!currentUser?.id) {
      logger.debug('Cannot join voice - no user ID', {
        ...LOG_CONTEXT,
        action: 'joinVoiceNoUser',
        metadata: { currentUser }
      });
      return;
    }

    if (!voiceToken) {
      logger.debug('Cannot join voice - no token', {
        ...LOG_CONTEXT,
        action: 'joinVoiceNoToken'
      });
      return;
    }

    logger.info('Attempting to join voice', {
      ...LOG_CONTEXT,
      action: 'joinVoiceAttempt',
      metadata: {
        userId: currentUser.id,
        hasPermission,
        micPermissionDenied,
        hasToken: !!voiceToken
      }
    });

    try {
      const agoraClient = await getClient();
      if (!agoraClient) {
        throw new Error('Failed to initialize Agora client');
      }

      logger.info('Joining Agora channel', {
        ...LOG_CONTEXT,
        action: 'joiningChannel',
        metadata: {
          appId: AGORA_APP_ID,
          channel: 'main',
          uid: currentUser.id
        }
      });

      await agoraClient.join(AGORA_APP_ID, 'main', voiceToken, currentUser.id.toString());

      const audioTrack = await createAudioTrack();
      
      logger.info('Publishing audio track', {
        ...LOG_CONTEXT,
        action: 'publishTrack',
        metadata: {
          trackId: audioTrack.getTrackId()
        }
      });

      await agoraClient.publish(audioTrack);

      logger.info('Successfully joined voice', {
        ...LOG_CONTEXT, 
        action: 'joinVoiceSuccess',
        metadata: {
          userId: currentUser.id,
          channelName: 'main',
          trackId: audioTrack.getTrackId()
        }
      });

      return audioTrack;
    } catch (error) {
      logger.error('Failed to join voice', {
        ...LOG_CONTEXT,
        action: 'joinVoiceError',
        metadata: {
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : error,
          userId: currentUser.id
        }
      });
      // Clear token on join error to force re-fetch
      setVoiceToken(null);
      throw error;
    }
  }, [currentUser, voiceToken, hasPermission, micPermissionDenied, getClient, createAudioTrack, setVoiceToken]);

  // Enhanced reconnection logic
  const attemptReconnect = useCallback(async () => {
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      logger.error('Max reconnection attempts reached', {
        ...LOG_CONTEXT,
        action: 'reconnect',
        metadata: { attempts: reconnectAttemptRef.current }
      });
      setIsReconnecting(false);
      return;
    }

    try {
      setIsReconnecting(true);
      reconnectAttemptRef.current++;

      // Clean up existing connection
      await cleanup();

      // Wait before attempting reconnect
      await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));

      // Attempt to rejoin
      await joinVoice();
      
      setIsReconnecting(false);
      reconnectAttemptRef.current = 0;
      
      logger.info('Successfully reconnected to voice', {
        ...LOG_CONTEXT,
        action: 'reconnect',
        metadata: { attempts: reconnectAttemptRef.current }
      });
    } catch (error) {
      logger.error('Failed to reconnect', {
        ...LOG_CONTEXT,
        action: 'reconnect',
        metadata: { error, attempts: reconnectAttemptRef.current }
      });
      
      if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
        attemptReconnect();
      } else {
        setIsReconnecting(false);
      }
    }
  }, [cleanup, joinVoice]);

  // Use the connection state hook
  const isConnected = useConnectionState(client, isReconnecting, attemptReconnect);

  // Wrap fetchVoiceToken in useCallback
  const fetchVoiceToken = useCallback(async () => {
    logger.info('Fetching voice token', {
      ...LOG_CONTEXT,
      action: 'fetchToken',
      metadata: { 
        currentUser,
        channelName: 'main',
        conditions: {
          hasUser: !!currentUser?.id,
          partyState,
          hasPermission,
          isConnected
        }
      }
    });

    try {
      const response = await fetch('/api/agora/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          channelName: 'main',
          uid: currentUser?.id
        })
      });

      logger.debug('Token fetch response received', {
        ...LOG_CONTEXT,
        action: 'fetchTokenResponse',
        metadata: {
          status: response.status,
          ok: response.ok,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Failed to fetch token', {
          ...LOG_CONTEXT,
          action: 'fetchTokenError',
          metadata: {
            status: response.status,
            statusText: response.statusText,
            errorText,
            currentUser,
            conditions: {
              hasUser: !!currentUser?.id,
              partyState,
              hasPermission,
              isConnected
            }
          }
        });
        throw new Error(`Failed to fetch token: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const { token } = await response.json();
      logger.info('Successfully fetched token', {
        ...LOG_CONTEXT,
        action: 'fetchTokenSuccess',
        metadata: {
          currentUser,
          channelName: 'main',
          tokenPreview: token.slice(0, 8) + '...',
          conditions: {
            hasUser: !!currentUser?.id,
            partyState,
            hasPermission,
            isConnected
          }
        }
      });
      return token;
    } catch (error) {
      logger.error('Token fetch failed', {
        ...LOG_CONTEXT,
        action: 'fetchTokenFailed',
        metadata: {
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack
          } : error,
          currentUser,
          conditions: {
            hasUser: !!currentUser?.id,
            partyState,
            hasPermission,
            isConnected
          }
        }
      });
      throw error;
    }
  }, [currentUser, partyState, hasPermission, isConnected]);

  // Update the token fetch effect to use the memoized function
  useEffect(() => {
    if (currentUser?.id && hasPermission && !voiceToken) {
      logger.info('Pre-fetching voice token', {
        ...LOG_CONTEXT,
        action: 'preFetchToken',
        metadata: { 
          userId: currentUser.id,
          hasPermission,
          partyState,
          isConnected,
          micPermissionDenied,
          conditions: {
            hasUser: !!currentUser?.id,
            hasPermission,
            noToken: !voiceToken,
            notDenied: !micPermissionDenied,
            notConnected: !isConnected,
            isJoinedOrJoining: partyState === 'joined' || partyState === 'joining'
          }
        }
      });

      void fetchVoiceToken().then(token => {
        logger.info('Successfully pre-fetched voice token', {
          ...LOG_CONTEXT,
          action: 'tokenFetched',
          metadata: {
            token: token.slice(0, 8) + '...',
            partyState,
            isConnected,
            micPermissionDenied,
            conditions: {
              hasUser: !!currentUser?.id,
              hasPermission,
              notDenied: !micPermissionDenied,
              notConnected: !isConnected,
              isJoinedOrJoining: partyState === 'joined' || partyState === 'joining'
            }
          }
        });
        setVoiceToken(token);
      }).catch(error => {
        logger.error('Failed to pre-fetch voice token', {
          ...LOG_CONTEXT,
          action: 'tokenFetchError',
          metadata: { 
            error,
            conditions: {
              hasUser: !!currentUser?.id,
              hasPermission,
              noToken: !voiceToken,
              notDenied: !micPermissionDenied,
              notConnected: !isConnected,
              isJoinedOrJoining: partyState === 'joined' || partyState === 'joining'
            }
          }
        });
      });
    } else {
      logger.debug('Skipping token fetch', {
        ...LOG_CONTEXT,
        action: 'skipTokenFetch',
        metadata: {
          hasUser: !!currentUser?.id,
          hasPermission,
          hasToken: !!voiceToken,
          partyState,
          conditions: {
            hasUser: !!currentUser?.id,
            hasPermission,
            noToken: !voiceToken,
            notDenied: !micPermissionDenied,
            notConnected: !isConnected,
            isJoinedOrJoining: partyState === 'joined' || partyState === 'joining'
          }
        }
      });
    }
  }, [currentUser?.id, hasPermission, voiceToken, fetchVoiceToken, partyState, isConnected, micPermissionDenied]);

  // Check initial microphone permission state
  useEffect(() => {
    async function checkInitialPermissionState() {
      try {
        // Query the browser's permission state
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        
        logger.info('Checking initial microphone permission state', {
          ...LOG_CONTEXT,
          action: 'checkInitialPermission',
          metadata: { 
            state: permissionStatus.state,
            partyState,
            userId: currentUser?.id
          }
        });

        // Update our state based on browser's state
        if (permissionStatus.state === 'granted') {
          setHasPermission(true);
          setMicPermissionDenied(false);
        } else if (permissionStatus.state === 'denied') {
          setHasPermission(false);
          setMicPermissionDenied(true);
        }

        // Listen for permission changes
        permissionStatus.addEventListener('change', () => {
          logger.info('Microphone permission state changed', {
            ...LOG_CONTEXT,
            action: 'permissionStateChange',
            metadata: { 
              newState: permissionStatus.state,
              partyState,
              userId: currentUser?.id
            }
          });

          if (permissionStatus.state === 'granted') {
            setHasPermission(true);
            setMicPermissionDenied(false);
          } else if (permissionStatus.state === 'denied') {
            setHasPermission(false);
            setMicPermissionDenied(true);
          }
        });
      } catch (error) {
        logger.error('Failed to check initial microphone permission', {
          ...LOG_CONTEXT,
          action: 'checkInitialPermissionError',
          metadata: { error }
        });
      }
    }

    void checkInitialPermissionState();
  }, [currentUser?.id, partyState]);

  // Handle microphone permission separately from join
  const requestMicrophonePermission = useCallback(async () => {
    if (hasPermission) {
      logger.debug('Already have microphone permission', {
        ...LOG_CONTEXT,
        action: 'requestPermission',
        metadata: { 
          hasPermission, 
          micPermissionDenied,
          currentUser
        }
      });
      return;
    }

    // Prevent multiple simultaneous requests
    if (permissionRequestInProgressRef.current) {
      logger.debug('Permission request already in progress', {
        ...LOG_CONTEXT,
        action: 'requestPermission',
        metadata: { 
          hasPermission, 
          micPermissionDenied,
          currentUser
        }
      });
      return;
    }

    try {
      permissionRequestInProgressRef.current = true;
      logger.info('Requesting microphone permission', {
        ...LOG_CONTEXT,
        action: 'requestPermission',
        metadata: { 
          hasPermission, 
          micPermissionDenied,
          partyState,
          currentUser
        }
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      
      // Update permission states
      setMicPermissionDenied(false);
      setHasPermission(true);
      
      logger.info('Microphone permission granted', {
        ...LOG_CONTEXT,
        action: 'permissionGranted',
        metadata: { 
          partyState,
          currentUser,
          isConnected
        }
      });
    } catch (error) {
      logger.error('Failed to get microphone permission', {
        ...LOG_CONTEXT,
        action: 'permissionDenied',
        metadata: { 
          error,
          partyState,
          currentUser
        }
      });
      setMicPermissionDenied(true);
      throw error;
    } finally {
      permissionRequestInProgressRef.current = false;
    }
  }, [hasPermission, micPermissionDenied, partyState, currentUser, isConnected]);

  // Handle token expiration
  useEffect(() => {
    if (!client) return;

    const handleTokenExpiring = async () => {
      try {
        logger.debug('Token expiring, requesting new token', LOG_CONTEXT);

        // Request new token from your server
        const response = await fetch('/api/agora/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            channelName: 'main',
            uid: currentUser?.id ? parseInt(currentUser.id.replace(/-/g, '').slice(-8), 16) % 1000000 : undefined
          })
        });

        if (!response.ok) {
          throw new Error('Failed to fetch token');
        }

        const { token } = await response.json();
        await client.renewToken(token);

        logger.info('Successfully renewed token', LOG_CONTEXT);
      } catch (error) {
        logger.error('Failed to renew token', {
          ...LOG_CONTEXT,
          action: 'handleTokenExpiring',
          metadata: { error }
        });
      }
    };

    client.on('token-privilege-will-expire', handleTokenExpiring);
    return () => {
      client.off('token-privilege-will-expire', handleTokenExpiring);
    };
  }, [client, currentUser?.id]);

  // Handle party state changes
  useEffect(() => {
    const shouldJoinVoice = (partyState === 'joined' || partyState === 'joining') && 
                           hasPermission && 
                           !isConnected && 
                           !micPermissionDenied && 
                           !!currentUser?.id &&
                           !!voiceToken;

    logger.info('Party state change effect triggered', {
      ...LOG_CONTEXT,
      action: 'partyStateChangeEffect',
      metadata: {
        partyState,
        hasPermission,
        micPermissionDenied,
        isConnected,
        userId: currentUser?.id,
        joinAttempted: joinAttemptedRef.current,
        hasToken: !!voiceToken,
        shouldJoinVoice,
        conditions: {
          isJoinedOrJoining: partyState === 'joined' || partyState === 'joining',
          hasPermission,
          notConnected: !isConnected,
          notDenied: !micPermissionDenied,
          hasUser: !!currentUser?.id,
          hasToken: !!voiceToken,
          notAttempted: !joinAttemptedRef.current
        }
      }
    });

    // If we're leaving, cleanup voice immediately
    if (partyState === 'leaving') {
      // Reset flags before cleanup
      joinAttemptedRef.current = false;
      setMicPermissionDenied(false);
      setHasPermission(false);
      setVoiceToken(null);
      
      // Call cleanup directly
      cleanup();
      return;
    }

    // If we're joined/joining and have permission but not connected, attempt to join voice
    if (shouldJoinVoice && !joinAttemptedRef.current) {
      logger.info('Attempting to join voice after permission granted', {
        ...LOG_CONTEXT,
        action: 'joinAfterPermission',
        metadata: {
          partyState,
          hasPermission,
          micPermissionDenied,
          isConnected,
          userId: currentUser?.id,
          joinAttempted: joinAttemptedRef.current,
          hasToken: !!voiceToken,
          conditions: {
            isJoinedOrJoining: partyState === 'joined' || partyState === 'joining',
            hasPermission,
            notConnected: !isConnected,
            notDenied: !micPermissionDenied,
            hasUser: !!currentUser?.id,
            hasToken: !!voiceToken,
            notAttempted: !joinAttemptedRef.current
          }
        }
      });

      // Set join attempted before the async call
      joinAttemptedRef.current = true;
      
      // Attempt to join voice
      void joinVoice().then(audioTrack => {
        if (audioTrack) {
          setTrack(audioTrack);
          logger.info('Successfully set audio track after join', {
            ...LOG_CONTEXT,
            action: 'setTrackAfterJoin',
            metadata: {
              trackId: audioTrack.getTrackId(),
              muted: audioTrack.muted,
              partyState,
              conditions: {
                hasUser: !!currentUser?.id,
                hasPermission,
                notDenied: !micPermissionDenied,
                notConnected: !isConnected,
                hasToken: !!voiceToken
              }
            }
          });
        }
      }).catch(error => {
        // Reset join attempted on error to allow retry
        joinAttemptedRef.current = false;
        logger.error('Failed to join voice after permission granted', {
          ...LOG_CONTEXT,
          action: 'joinAfterPermissionError',
          metadata: { 
            error, 
            partyState,
            conditions: {
              hasUser: !!currentUser?.id,
              hasPermission,
              notDenied: !micPermissionDenied,
              notConnected: !isConnected,
              hasToken: !!voiceToken
            }
          }
        });
      });
      return;
    }

    // If we don't have permission and haven't been denied, request it
    if ((partyState === 'joined' || partyState === 'joining') && !hasPermission && !micPermissionDenied && !permissionRequestInProgressRef.current) {
      logger.info('Requesting microphone permission after join', {
        ...LOG_CONTEXT,
        action: 'requestPermissionAfterJoin',
        metadata: {
          partyState,
          hasPermission,
          micPermissionDenied,
          isConnected,
          userId: currentUser?.id
        }
      });
      void requestMicrophonePermission().catch(error => {
        logger.error('Failed to request microphone permission after join', {
          ...LOG_CONTEXT,
          action: 'requestPermissionAfterJoinError',
          metadata: { error, partyState }
        });
      });
    }
  }, [partyState, hasPermission, micPermissionDenied, isConnected, currentUser?.id, cleanup, joinVoice, requestMicrophonePermission, setTrack, voiceToken]);

  // Separate effect for debug logging
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      const now = new Date().toISOString();
      logger.debug('Party state changed in useVoice', {
        ...LOG_CONTEXT,
        action: 'partyStateChange',
        metadata: {
          partyState,
          hasPermission,
          micPermissionDenied,
          joinAttempted: joinAttemptedRef.current,
          isConnected,
          timestamp: now,
          userId: currentUser?.id
        }
      });

      if (partyState === 'leaving') {
        logger.info('Party is leaving, cleaning up voice', {
          ...LOG_CONTEXT,
          action: 'partyLeaving',
          metadata: {
            hasPermission,
            micPermissionDenied,
            joinAttempted: joinAttemptedRef.current,
            isConnected,
            userId: currentUser?.id,
            timestamp: now,
          }
        });
      }

      if (!hasPermission && !micPermissionDenied && !permissionRequestInProgressRef.current) {
        logger.info('Requesting microphone permission', {
          ...LOG_CONTEXT,
          action: 'requestPermission',
          metadata: {
            partyState,
            userId: currentUser?.id,
            timestamp: now
          }
        });
      }
    }
  }, [partyState, hasPermission, micPermissionDenied, isConnected, currentUser?.id]);

  // Update toggleMute to include all dependencies
  const toggleMute = useCallback(async () => {
    if (!track) {
      logger.debug('No track to mute - attempting to join voice', {
        ...LOG_CONTEXT,
        action: 'toggleMute',
        metadata: {
          hasTrack: false,
          currentUser,
          conditions: {
            hasUser: !!currentUser?.id
          }
        }
      });
      if (!currentUser?.id) {
        logger.error('Cannot join voice - no user ID', {
          ...LOG_CONTEXT,
          action: 'toggleMuteError',
          metadata: { currentUser }
        });
        return;
      }
      await joinVoice();
      return;
    }

    const newMuted = !isMuted;
    track.setEnabled(!newMuted);
    setIsMuted(newMuted);
    logger.debug('Toggled mute state', {
      ...LOG_CONTEXT,
      action: 'toggleMute',
      metadata: {
        hasTrack: true,
        trackId: track.getTrackId(),
        newMuted,
        currentUser
      }
    });
  }, [track, isMuted, joinVoice, currentUser]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      logger.debug('Cleaning up voice on unmount', LOG_CONTEXT);
      cleanup();
    };
  }, [cleanup]);

  return useMemo(() => ({
    isMuted,
    toggleMute,
    micPermissionDenied,
    requestMicrophonePermission,
    isConnected,
    joinVoice,
    leaveVoice
  }), [
    isMuted,
    toggleMute,
    micPermissionDenied, 
    requestMicrophonePermission,
    isConnected,
    joinVoice,
    leaveVoice
  ]);
} 