import { useCallback, useEffect, useRef, useState } from 'react';
import { useAgoraContext } from '@/components/providers/AgoraProvider';
import { logger } from '@/lib/utils/logger';
import { usePartyState } from './usePartyState';

type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTING';

const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;

export function useVoiceClient() {
  const { currentUser } = usePartyState();
  const { client, initializeClient } = useAgoraContext();
  const [isConnected, setIsConnected] = useState(false);
  const loggerRef = useRef(logger);
  const isInitializedRef = useRef(false);

  // Persistent connection state handler
  useEffect(() => {
    if (!client) return;

    const handleConnectionStateChange = (curState: ConnectionState) => {
      loggerRef.current.debug('Connection state changed', {
        component: 'useVoiceClient',
        action: 'connectionStateChange',
        metadata: {
          state: curState,
          userId: currentUser?.id,
          timestamp: Date.now(),
          previousState: client.connectionState,
          debug: {
            connectionState: curState,
            uid: client.uid,
            localTracks: client.localTracks?.length || 0,
            remoteUsers: client.remoteUsers?.length || 0
          }
        },
      });

      if (curState === 'CONNECTED') {
        setIsConnected(true);
      } else if (curState === 'DISCONNECTED' || curState === 'DISCONNECTING') {
        setIsConnected(false);
      }
    };

    // Set up handler and check initial state
    client.on('connection-state-change', handleConnectionStateChange);
    
    // Log initial state
    loggerRef.current.debug('Initial connection state', {
      component: 'useVoiceClient',
      action: 'connectionInit',
      metadata: {
        state: client.connectionState,
        userId: currentUser?.id,
        timestamp: Date.now(),
        debug: {
          connectionState: client.connectionState,
          uid: client.uid,
          localTracks: client.localTracks?.length || 0,
          remoteUsers: client.remoteUsers?.length || 0
        }
      },
    });

    setIsConnected(client.connectionState === 'CONNECTED');

    return () => {
      client.off('connection-state-change', handleConnectionStateChange);
    };
  }, [client, currentUser?.id]);

  // Initialize client if needed
  useEffect(() => {
    if (!isInitializedRef.current && !client) {
      loggerRef.current.debug('Initializing Agora client', {
        component: 'useVoiceClient',
        action: 'init',
        metadata: {
          timestamp: Date.now()
        }
      });
      isInitializedRef.current = true;
      initializeClient().catch((error) => {
        loggerRef.current.error('Failed to initialize client', {
          component: 'useVoiceClient',
          action: 'init',
          metadata: { 
            error,
            timestamp: Date.now()
          },
        });
        isInitializedRef.current = false;
      });
    }
  }, [client, initializeClient]);

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
    // Ensure UID stays within 32-bit unsigned integer limit (0 to 4,294,967,295)
    const timestamp = Date.now() % 1000000; // Last 6 digits of timestamp
    const numericUid = parseInt(currentUser.id.replace(/-/g, '').slice(-8), 16) % 1000000; // Last 6 digits of hex
    const finalUid = (numericUid * 1000000 + timestamp) % 4294967295; // Ensure within uint32 limit

    loggerRef.current.debug('Fetching Agora token', {
      component: 'useVoiceClient',
      action: 'fetchToken',
      metadata: {
        userId: currentUser.id,
        numericUid: finalUid,
      },
    });

    try {
      const response = await fetch('/api/agora/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName: 'main',
          uid: finalUid,
          role: 'publisher',
        }),
      });

      loggerRef.current.debug('Token fetch response received', {
        component: 'useVoiceClient',
        action: 'fetchToken',
        metadata: {
          status: response.status,
          ok: response.ok,
          userId: currentUser.id,
          numericUid: finalUid,
          headers: Object.fromEntries(response.headers.entries())
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        loggerRef.current.error('Token fetch failed with error response', {
          component: 'useVoiceClient',
          action: 'fetchToken',
          metadata: {
            status: response.status,
            errorText,
            userId: currentUser.id,
            numericUid: finalUid
          },
        });
        throw new Error(`Failed to fetch token: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.token) {
        loggerRef.current.error('Token missing in response', {
          component: 'useVoiceClient',
          action: 'fetchToken',
          metadata: {
            responseData: data,
            userId: currentUser.id,
            numericUid: finalUid
          },
        });
        throw new Error('Token missing in response');
      }

      loggerRef.current.debug('Token fetched successfully', {
        component: 'useVoiceClient',
        action: 'fetchToken',
        metadata: {
          userId: currentUser.id,
          numericUid: finalUid,
          token: data.token.slice(0, 10) + '...',
        },
      });

      return {
        token: data.token,
        uid: finalUid,
      };
    } catch (error) {
      loggerRef.current.error('Failed to fetch token', {
        component: 'useVoiceClient',
        action: 'fetchToken',
        metadata: {
          userId: currentUser.id,
          numericUid: finalUid,
          error,
          status: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error; // Re-throw to handle in joinVoice
    }
  }, [currentUser?.id]);

  // Join voice chat
  const joinVoice = useCallback(async () => {
    if (!currentUser || !client) {
      loggerRef.current.error('Join voice failed - missing dependencies', {
        component: 'useVoiceClient',
        action: 'joinVoice',
        metadata: {
          hasUser: !!currentUser,
          hasClient: !!client
        }
      });
      return;
    }

    if (!appId) {
      const error = new Error('Agora App ID not configured');
      loggerRef.current.error('Missing app ID', {
        component: 'useVoiceClient',
        action: 'joinVoice',
        metadata: { error }
      });
      throw error;
    }

    loggerRef.current.debug('Attempting to join voice chat', {
      component: 'useVoiceClient',
      action: 'joinVoice',
      metadata: {
        userId: currentUser.id,
        clientState: client.connectionState,
        timestamp: Date.now()
      }
    });

    try {
      const tokenResult = await fetchToken();
      if (!tokenResult?.token) {
        throw new Error('Failed to get token');
      }
      
      loggerRef.current.debug('Joining Agora channel', {
        component: 'useVoiceClient',
        action: 'joinVoice',
        metadata: {
          userId: currentUser.id,
          numericUid: tokenResult.uid,
          timestamp: Date.now(),
          debug: {
            hasToken: true,
            tokenLength: tokenResult.token.length,
            connectionState: client.connectionState
          }
        }
      });

      await client.join(appId, 'main', tokenResult.token, tokenResult.uid);

      loggerRef.current.debug('Successfully joined channel', {
        component: 'useVoiceClient',
        action: 'joinVoice',
        metadata: {
          userId: currentUser.id,
          numericUid: tokenResult.uid,
          timestamp: Date.now(),
          connectionState: client.connectionState
        }
      });
    } catch (err) {
      loggerRef.current.error('Failed to join voice chat', {
        component: 'useVoiceClient',
        action: 'joinVoice',
        metadata: {
          error: err,
          userId: currentUser.id,
          timestamp: Date.now(),
          connectionState: client.connectionState
        }
      });
      throw err;
    }
  }, [currentUser, client, fetchToken]);

  // Leave voice chat
  const leaveVoice = useCallback(async () => {
    if (!client) {
      return;
    }

    loggerRef.current.debug('Leaving voice chat', {
      component: 'useVoiceClient',
      action: 'leaveVoice',
      metadata: {
        clientState: client.connectionState,
        timestamp: Date.now()
      }
    });

    try {
      await client.leave();
      loggerRef.current.debug('Successfully left voice chat', {
        component: 'useVoiceClient',
        action: 'leaveVoice',
        metadata: {
          timestamp: Date.now()
        }
      });
    } catch (error) {
      loggerRef.current.error('Failed to leave voice chat', {
        component: 'useVoiceClient',
        action: 'leaveVoice',
        metadata: { error }
      });
      throw error;
    }
  }, [client]);

  return {
    client,
    isConnected,
    joinVoice,
    leaveVoice,
  };
}

