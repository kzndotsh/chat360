'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceStore } from '@/lib/stores/useVoiceStore';
import { logger } from '@/lib/utils/logger';
import { usePartyState } from './usePartyState';
import { useAgoraContext } from '@/components/providers/AgoraProvider';
import AgoraRTC, { IAgoraRTCClient, IAgoraRTCRemoteUser } from 'agora-rtc-sdk-ng';

if (!process.env.NEXT_PUBLIC_AGORA_APP_ID) {
  throw new Error('NEXT_PUBLIC_AGORA_APP_ID is required');
}

const LOG_CONTEXT = { component: 'useVoice' };

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
  const joinAttemptedRef = useRef(false);
  const permissionRequestInProgressRef = useRef(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const reconnectAttemptRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAY = 1000;

  // Join voice channel
  const joinVoice = useCallback(async () => {
    if (!currentUser?.id) {
      throw new Error('Missing required data for voice join');
    }

    try {
      // Get or initialize the client
      const agoraClient = await getClient();

      // Generate deterministic UID from user ID
      const uid = parseInt(currentUser.id.replace(/-/g, '').slice(-8), 16) % 1000000;

      // Get token from your server
      const response = await fetch('/api/agora/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          channelName: 'main',
          uid
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch token');
      }

      const { token } = await response.json();

      // Join the channel
      await agoraClient.join(
        process.env.NEXT_PUBLIC_AGORA_APP_ID!,
        'main',
        token,
        uid
      );

      // Create and publish audio track
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: {
          sampleRate: 48000,
          stereo: false,
          bitrate: 128 // Optimal for voice
        }
      });

      await agoraClient.publish(audioTrack);
      
      // Store the track
      setTrack(audioTrack);

      logger.info('Successfully joined voice and published track', {
        ...LOG_CONTEXT,
        action: 'joinVoice',
        metadata: { 
          userId: currentUser.id,
          uid
        }
      });
    } catch (error) {
      logger.error('Failed to join voice', {
        ...LOG_CONTEXT,
        action: 'joinVoice',
        metadata: { error }
      });
      throw error;
    }
  }, [currentUser?.id, getClient, setTrack]);

  // Enhanced cleanup function
  const cleanup = useCallback(async () => {
    try {
      // Stop and close track first
      if (track) {
        track.stop();
        track.close();
        setTrack(null);
      }
      
      // Clean up client
      await cleanupClient();
      joinAttemptedRef.current = false;
      setMicPermissionDenied(false);
      reconnectAttemptRef.current = 0;
      
      logger.info('Successfully cleaned up voice connection', LOG_CONTEXT);
    } catch (error) {
      logger.error('Failed to cleanup voice connection', {
        ...LOG_CONTEXT,
        action: 'cleanup',
        metadata: { error }
      });
    }
  }, [track, setTrack, cleanupClient]);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      logger.debug('Cleaning up voice on unmount', LOG_CONTEXT);
      cleanup();
    };
  }, [cleanup]);

  // Leave voice channel
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
  }, [setTrack]);

  // Handle microphone permission separately from join
  const requestMicrophonePermission = useCallback(async () => {
    if (hasPermission) {
      logger.debug('Already have microphone permission', LOG_CONTEXT);
      return;
    }

    // Prevent multiple simultaneous requests
    if (permissionRequestInProgressRef.current) {
      logger.debug('Permission request already in progress', LOG_CONTEXT);
      return;
    }

    try {
      permissionRequestInProgressRef.current = true;
      logger.debug('Requesting microphone permission', LOG_CONTEXT);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicPermissionDenied(false);
      setHasPermission(true);
      logger.debug('Microphone permission granted', LOG_CONTEXT);
    } catch (error) {
      logger.error('Failed to get microphone permission', {
        ...LOG_CONTEXT,
        metadata: { error }
      });
      setMicPermissionDenied(true);
      throw error;
    } finally {
      permissionRequestInProgressRef.current = false;
    }
  }, [hasPermission]);

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

  // Combined effect to handle both join attempts and flag resets
  useEffect(() => {
    logger.debug('Party state changed in useVoice', {
      metadata: {
        partyState,
        hasPermission,
        micPermissionDenied,
        joinAttempted: joinAttemptedRef.current,
        isConnected,
        timestamp: new Date().toISOString(),
      }
    });

    // If we're in idle or joining state, no voice action needed
    if (partyState === 'idle' || partyState === 'joining') {
      logger.debug('Party in idle/joining state, no voice action needed', {
        metadata: {
          hasPermission,
          micPermissionDenied,
        }
      });
      return;
    }

    // If we're leaving, cleanup voice
    if (partyState === 'leaving') {
      logger.debug('Party is leaving, cleaning up voice', {
        metadata: {
          hasPermission,
          micPermissionDenied,
        }
      });
      cleanup();
      return;
    }

    // Handle joined state
    if (partyState === 'joined') {
      // If we already attempted to join, don't try again
      if (joinAttemptedRef.current) {
        logger.debug('Join already attempted, skipping', {
          metadata: {
            hasPermission,
            micPermissionDenied,
          }
        });
        return;
      }

      // If we have permission, attempt to join voice
      if (hasPermission) {
        logger.debug('Have permission, attempting to join voice', {
          metadata: {
            hasPermission,
            micPermissionDenied,
          }
        });
        joinVoice();
        return;
      }

      // If we don't have permission and haven't been denied, request it
      if (!micPermissionDenied && !permissionRequestInProgressRef.current) {
        logger.info('Requesting microphone permission before join', {
          metadata: {
            hasPermission,
            micPermissionDenied,
          }
        });
        requestMicrophonePermission().catch(() => {});
        return;
      }
    }
  }, [partyState, hasPermission, micPermissionDenied, joinAttemptedRef.current, isConnected, joinVoice, requestMicrophonePermission, cleanup]);

  const toggleMute = useCallback(async () => {
    if (!track) {
      logger.debug('No track to mute - attempting to join voice', LOG_CONTEXT);
      if (!currentUser?.id) {
        logger.error('Cannot join voice - no user ID', LOG_CONTEXT);
        return;
      }
      await joinVoice();
      return;
    }

    const newMuted = !isMuted;
    track.setEnabled(!newMuted);
    setIsMuted(newMuted);
    logger.debug('Toggled mute state', LOG_CONTEXT);
  }, [track, isMuted, joinVoice, currentUser?.id]);

  return {
    isMuted,
    toggleMute,
    micPermissionDenied,
    requestMicrophonePermission,
    isConnected,
    joinVoice,
    leaveVoice
  };
} 