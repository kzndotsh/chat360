import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgoraContext } from '@/components/providers/AgoraProvider';
import { logger } from '@/lib/utils/logger';
import { usePartyState } from './usePartyState';

export function useVoiceClient() {
  const { currentUser } = usePartyState();
  const { client, initializeClient } = useAgoraContext();
  const [isConnected, setIsConnected] = useState(false);
  const loggerRef = useRef(logger);
  const isInitializedRef = useRef(false);

  // Fetch token from API
  const fetchToken = useCallback(async () => {
    if (!currentUser?.id) {
      loggerRef.current.debug('Skipping token fetch - no current user', {
        component: 'useVoiceClient',
        action: 'fetchToken',
      });
      return null;
    }

    // Convert UUID to numeric UID for Agora
    // Add timestamp to make UID unique per session
    const timestamp = Date.now() % 100000; // Last 5 digits of timestamp
    const numericUid =
      parseInt(currentUser.id.replace(/-/g, '').slice(0, 3), 16) * 100000 + timestamp;

    loggerRef.current.debug('Fetching Agora token', {
      component: 'useVoiceClient',
      action: 'fetchToken',
      metadata: {
        userId: currentUser.id,
        numericUid,
      },
    });

    try {
      const response = await fetch('/api/agora/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName: 'main',
          uid: numericUid,
          role: 'publisher',
          tokenExpireTime: 3600,
          privilegeExpireTime: 3000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch token: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.token) {
        throw new Error('Token missing in response');
      }

      loggerRef.current.debug('Token fetched successfully', {
        component: 'useVoiceClient',
        action: 'fetchToken',
        metadata: {
          userId: currentUser.id,
          numericUid,
        },
      });

      return {
        token: data.token,
        uid: numericUid,
      };
    } catch (error) {
      loggerRef.current.error('Failed to fetch token', {
        component: 'useVoiceClient',
        action: 'fetchToken',
        metadata: {
          userId: currentUser.id,
          numericUid,
          error,
          status: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      return null;
    }
  }, [currentUser?.id]);

  // Join voice chat
  const joinVoice = useCallback(async () => {
    if (!currentUser?.id || !client) {
      loggerRef.current.debug('Skipping voice join - missing requirements', {
        component: 'useVoiceClient',
        action: 'joinVoice',
        metadata: {
          hasUser: !!currentUser?.id,
          hasClient: !!client,
          clientState: client?.connectionState,
        },
      });
      return;
    }

    loggerRef.current.info('Attempting to join voice chat', {
      component: 'useVoiceClient',
      action: 'joinVoice',
      metadata: {
        userId: currentUser.id,
        clientState: client.connectionState,
      },
    });

    try {
      // Ensure we're in a clean state
      if (client.connectionState !== 'DISCONNECTED') {
        loggerRef.current.debug('Cleaning up existing connection', {
          component: 'useVoiceClient',
          action: 'joinVoice',
          metadata: {
            currentState: client.connectionState,
          },
        });
        await client.leave().catch((error) => {
          loggerRef.current.warn('Error during pre-join cleanup', {
            component: 'useVoiceClient',
            action: 'joinVoice',
            metadata: { error },
          });
        });
        // Wait for disconnect to complete
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Fetch new token
      const tokenData = await fetchToken();
      if (!tokenData?.token) {
        throw new Error('Failed to get token');
      }

      // Join channel
      const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
      if (!appId) {
        throw new Error('Agora App ID not configured');
      }

      loggerRef.current.debug('Joining Agora channel', {
        component: 'useVoiceClient',
        action: 'joinVoice',
        metadata: {
          userId: currentUser.id,
          numericUid: tokenData.uid,
        },
      });

      await client.join(appId, 'main', tokenData.token, tokenData.uid);

      // Wait for connection to establish
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify connection state
      if (client.connectionState !== 'CONNECTED') {
        throw new Error('Failed to establish connection');
      }

      setIsConnected(true);

      loggerRef.current.info('Successfully joined voice chat', {
        component: 'useVoiceClient',
        action: 'joinVoice',
        metadata: {
          userId: currentUser.id,
          numericUid: tokenData.uid,
          clientState: client.connectionState,
        },
      });
    } catch (error) {
      loggerRef.current.error('Failed to join voice chat', {
        component: 'useVoiceClient',
        action: 'joinVoice',
        metadata: {
          error,
          status: error instanceof Error ? error.message : 'Unknown error',
          clientState: client.connectionState,
        },
      });
      setIsConnected(false);
      throw error;
    }
  }, [currentUser?.id, client, fetchToken]);

  // Leave voice chat
  const leaveVoice = useCallback(async () => {
    loggerRef.current.info('Leaving voice chat', {
      component: 'useVoiceClient',
      action: 'leaveVoice',
      metadata: { userId: currentUser?.id },
    });

    // Prevent multiple leave attempts
    if (!isConnected) {
      loggerRef.current.debug('Already disconnected, skipping leave', {
        component: 'useVoiceClient',
        action: 'leaveVoice',
      });
      return;
    }

    setIsConnected(false);

    if (client) {
      try {
        await client.leave();
        loggerRef.current.debug('Left Agora channel', {
          component: 'useVoiceClient',
          action: 'leaveVoice',
        });
      } catch (error) {
        // Only log error if we're still connected
        if (client.connectionState !== 'DISCONNECTED') {
          loggerRef.current.error('Error leaving Agora channel', {
            component: 'useVoiceClient',
            action: 'leaveVoice',
            metadata: { error },
          });
        }
      }
    }
  }, [currentUser?.id, isConnected, client]);

  // Initialize client when component mounts
  useEffect(() => {
    if (!isInitializedRef.current) {
      loggerRef.current.debug('Initializing Agora client', {
        component: 'useVoiceClient',
        action: 'init',
      });
      initializeClient()
        .then(async () => {
          isInitializedRef.current = true;
          loggerRef.current.debug('Agora client initialized', {
            component: 'useVoiceClient',
            action: 'init',
          });
        })
        .catch((error) => {
          loggerRef.current.error('Failed to initialize Agora client', {
            component: 'useVoiceClient',
            action: 'init',
            metadata: { error },
          });
        });
    }
  }, [initializeClient]);

  // Monitor client connection state
  useEffect(() => {
    if (!client || !currentUser?.id) return;

    const handleConnectionStateChange = (state: string) => {
      loggerRef.current.info('Connection state changed', {
        component: 'useVoiceClient',
        action: 'connectionState',
        metadata: {
          state,
          userId: currentUser?.id,
          previousState: client.connectionState,
        },
      });

      if (state === 'DISCONNECTED') {
        setIsConnected(false);
      } else if (state === 'CONNECTED') {
        setIsConnected(true);
      }
    };

    client.on('connection-state-change', handleConnectionStateChange);
    return () => {
      client.off('connection-state-change', handleConnectionStateChange);
    };
  }, [client, currentUser?.id]);

  return {
    client,
    isConnected,
    isInitialized: isInitializedRef.current,
    joinVoice,
    leaveVoice,
  };
}
