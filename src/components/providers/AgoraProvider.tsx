'use client';

import {
  ReactNode,
  useEffect,
  useState,
  useRef,
  createContext,
  useContext,
  useCallback,
} from 'react';
import type { IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import { logger } from '@/lib/utils/logger';

// Constants for cleanup and reconnection
const CLEANUP_DELAY = 150; // 150ms delay after cleanup

if (!process.env.NEXT_PUBLIC_AGORA_APP_ID) {
  throw new Error('NEXT_PUBLIC_AGORA_APP_ID is required');
}

interface AgoraContextType {
  client: IAgoraRTCClient | null;
  initializeClient: () => Promise<void>;
}

const AgoraContext = createContext<AgoraContextType>({
  client: null,
  initializeClient: async () => {},
});

export const useAgoraContext = () => useContext(AgoraContext);

interface AgoraProviderProps {
  children: ReactNode;
}

// Lazy load AgoraRTC to avoid SSR issues
let AgoraRTC: typeof import('agora-rtc-sdk-ng').default;

export function AgoraProvider({ children }: AgoraProviderProps) {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const mountedRef = useRef(true);
  const isCleaningUpRef = useRef(false);
  const initializingRef = useRef(false);
  const loggerRef = useRef(logger);

  // Log provider mount and unmount
  useEffect(() => {
    const logger = loggerRef.current;
    logger.info('Agora provider mounted', {
      component: 'AgoraProvider',
      action: 'mount',
      metadata: {
        appId: process.env.NEXT_PUBLIC_AGORA_APP_ID,
        hasClient: !!client,
      },
    });

    return () => {
      logger.info('Agora provider unmounting', {
        component: 'AgoraProvider',
        action: 'unmount',
        metadata: {
          hasClient: !!client,
          isCleaningUp: isCleaningUpRef.current,
        },
      });
    };
  }, [client]);

  // Log client state changes
  useEffect(() => {
    if (!client) {
      return;
    }

    loggerRef.current.info('Agora client state updated', {
      component: 'AgoraProvider',
      action: 'clientUpdate',
      metadata: {
        connectionState: client.connectionState,
        uid: client.uid,
      },
    });

    const handleConnectionStateChange = (curState: string, prevState: string, reason?: string) => {
      loggerRef.current.info('Agora connection state changed', {
        component: 'AgoraProvider',
        action: 'connectionStateChange',
        metadata: {
          currentState: curState,
          previousState: prevState,
          reason,
          uid: client.uid,
        },
      });
      return;
    };

    client.on('connection-state-change', handleConnectionStateChange);

    return () => {
      client.off('connection-state-change', handleConnectionStateChange);
    };
  }, [client]);

  // Enhanced cleanup function
  const enhancedCleanup = useCallback(async () => {
    if (isCleaningUpRef.current) {
      loggerRef.current.info('Cleanup already in progress, skipping', {
        component: 'AgoraProvider',
        action: 'cleanup',
        metadata: {
          status: 'skipped',
          reason: 'already_cleaning',
        },
      });
      return;
    }

    isCleaningUpRef.current = true;

    loggerRef.current.info('Starting Agora client cleanup', {
      component: 'AgoraProvider',
      action: 'cleanup',
      metadata: {
        status: 'started',
        connectionState: client?.connectionState,
        uid: client?.uid,
      },
    });

    try {
      if (client) {
        // Remove all event listeners
        client.removeAllListeners();

        // Leave the channel if connected
        if (client.connectionState !== 'DISCONNECTED') {
          await client.leave();
          loggerRef.current.info('Successfully left Agora channel', {
            component: 'AgoraProvider',
            action: 'cleanup',
            metadata: { status: 'left_channel' },
          });
        }
      }

      // Add delay to ensure cleanup propagates
      await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY));

      // Reset state if still mounted
      if (mountedRef.current) {
        setClient(null);
        loggerRef.current.info('Agora client reset', {
          component: 'AgoraProvider',
          action: 'cleanup',
          metadata: { status: 'client_reset' },
        });
      }

      return true;
    } catch (error) {
      loggerRef.current.error('Cleanup process failed', {
        component: 'AgoraProvider',
        action: 'cleanup',
        metadata: {
          error: error instanceof Error ? error : new Error(String(error)),
          connectionState: client?.connectionState,
          uid: client?.uid,
        },
      });
      throw error;
    } finally {
      isCleaningUpRef.current = false;
      loggerRef.current.info('Cleanup process completed', {
        component: 'AgoraProvider',
        action: 'cleanup',
        metadata: { status: 'completed' },
      });
    }
  }, [client]);

  // Initialize client function that can be called when needed
  const initializeClient = useCallback(async () => {
    if (initializingRef.current || client) {
      loggerRef.current.debug('Client initialization skipped', {
        component: 'AgoraProvider',
        action: 'initialize',
        metadata: {
          reason: initializingRef.current ? 'already_initializing' : 'client_exists',
          hasClient: !!client,
        },
      });
      return;
    }

    initializingRef.current = true;
    loggerRef.current.info('Initializing Agora client', {
      component: 'AgoraProvider',
      action: 'initialize',
      metadata: { status: 'started' },
    });

    try {
      // Properly import and initialize AgoraRTC
      const AgoraModule = await import('agora-rtc-sdk-ng');
      AgoraRTC = AgoraModule.default;

      if (!AgoraRTC || !mountedRef.current) {
        throw new Error('Failed to load Agora SDK');
      }

      // Set Agora log level to DEBUG for development
      AgoraRTC.setLogLevel(0); // 0: DEBUG, 1: INFO, 2: WARN, 3: ERROR, 4: NONE

      const newClient = AgoraRTC.createClient({
        mode: 'rtc',
        codec: 'vp8',
        role: 'host',
      });

      if (mountedRef.current && !isCleaningUpRef.current) {
        setClient(newClient);
        loggerRef.current.info('Agora client initialized successfully', {
          component: 'AgoraProvider',
          action: 'initialize',
          metadata: {
            status: 'success',
            mode: 'rtc',
            codec: 'vp8',
            role: 'host',
          },
        });
      }
    } catch (error) {
      loggerRef.current.error('Failed to initialize client', {
        component: 'AgoraProvider',
        action: 'initialize',
        metadata: {
          error: error instanceof Error ? error : new Error(String(error)),
          status: 'failed',
        },
      });
      throw error;
    } finally {
      initializingRef.current = false;
    }
  }, [client]);

  // Cleanup on unmount
  useEffect(() => {
    const logger = loggerRef.current;
    return () => {
      mountedRef.current = false;
      if (client) {
        enhancedCleanup().catch((error) => {
          logger.error('Error during cleanup', {
            component: 'AgoraProvider',
            action: 'cleanup',
            metadata: { error },
          });
        });
      }
    };
  }, [client, enhancedCleanup]);

  return (
    <AgoraContext.Provider value={{ client, initializeClient }}>{children}</AgoraContext.Provider>
  );
}
