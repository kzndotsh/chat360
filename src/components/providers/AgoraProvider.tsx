'use client';

import {
  ReactNode,
  useEffect,
  useState,
  useRef,
  createContext,
  useContext,
  useCallback,
  useMemo,
} from 'react';
import type { IAgoraRTCClient, IAgoraRTC } from 'agora-rtc-sdk-ng';
import { logger } from '@/lib/utils/logger';

// Constants for cleanup and reconnection
const CLEANUP_DELAY = 150; // 150ms delay after cleanup
const INIT_RETRY_DELAY = 1000; // 1 second delay between retries
const MAX_INIT_RETRIES = 3; // Maximum number of initialization retries
const LOG_CONTEXT = { component: 'AgoraProvider' };

if (!process.env.NEXT_PUBLIC_AGORA_APP_ID) {
  throw new Error('NEXT_PUBLIC_AGORA_APP_ID is required');
}

interface AgoraContextType {
  client: IAgoraRTCClient | null;
  getClient: () => Promise<IAgoraRTCClient>;
  cleanupClient: () => Promise<void>;
  isInitializing: boolean;
  error: Error | null;
}

const AgoraContext = createContext<AgoraContextType>({
  client: null,
  getClient: async () => { throw new Error('AgoraProvider not initialized') },
  cleanupClient: async () => {},
  isInitializing: false,
  error: null,
});

export const useAgoraContext = () => useContext(AgoraContext);

interface AgoraProviderProps {
  children: ReactNode;
}

// Lazy load AgoraRTC to avoid SSR issues
let AgoraRTC: IAgoraRTC | null = null;

async function loadAgoraSDK(): Promise<void> {
  if (typeof window === 'undefined' || AgoraRTC) return;
  
  const mod = await import('agora-rtc-sdk-ng');
  AgoraRTC = mod.default;
  if (AgoraRTC) {
    // Configure Agora SDK
    AgoraRTC.disableLogUpload(); // Disable log upload for privacy
    AgoraRTC.setLogLevel(0); // Set to INFO level
  }
}

// Initialize SDK loading
if (typeof window !== 'undefined') {
  loadAgoraSDK().catch(error => {
    logger.error('Failed to load Agora SDK', {
      ...LOG_CONTEXT,
      action: 'loadSDK',
      metadata: { error }
    });
  });
}

export function AgoraProvider({ children }: AgoraProviderProps) {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const mountedRef = useRef(true);
  const isCleaningUpRef = useRef(false);
  const initializingRef = useRef(false);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const retryCountRef = useRef(0);

  // Keep clientRef in sync with client state
  useEffect(() => {
    clientRef.current = client;
  }, [client]);

  // Enhanced cleanup function
  const cleanupClient = useCallback(async () => {
    const currentClient = clientRef.current;
    if (!currentClient || isCleaningUpRef.current) return;

    logger.info('Starting client cleanup...', LOG_CONTEXT);
    isCleaningUpRef.current = true;

    try {
      // Remove all event listeners
      currentClient.removeAllListeners();

      // Leave the channel if connected
      if (currentClient.connectionState !== 'DISCONNECTED') {
        await currentClient.leave();
      }

      // Add delay to ensure cleanup propagates
      await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY));

      // Reset state if still mounted
      if (mountedRef.current) {
        setClient(null);
        clientRef.current = null;
        setError(null);
      }

      logger.info('Client cleanup completed', LOG_CONTEXT);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Error during cleanup', {
        ...LOG_CONTEXT,
        action: 'cleanup',
        metadata: { error: err },
      });
      if (mountedRef.current) {
        setError(err);
      }
    } finally {
      isCleaningUpRef.current = false;
    }
  }, []);

  // Get or initialize client
  const getClient = useCallback(async (): Promise<IAgoraRTCClient> => {
    if (clientRef.current) {
      return clientRef.current;
    }

    if (initializingRef.current) {
      throw new Error('Client initialization already in progress');
    }

    if (retryCountRef.current >= MAX_INIT_RETRIES) {
      throw new Error('Max initialization retries reached');
    }

    try {
      setIsInitializing(true);
      initializingRef.current = true;

      // Ensure SDK is loaded
      if (!AgoraRTC) {
        const mod = await import('agora-rtc-sdk-ng');
        AgoraRTC = mod.default;
        if (AgoraRTC) {
          AgoraRTC.setLogLevel(1);
          AgoraRTC.enableLogUpload();
          AgoraRTC.disableLogUpload();
        }
      }

      // Create new client
      const newClient = AgoraRTC.createClient({
        mode: 'rtc',
        codec: 'vp8',
      });

      // Configure client
      newClient.enableAudioVolumeIndicator();
      
      // Set up error handling
      newClient.on('error', (err: Error) => {
        logger.error('Client error', {
          ...LOG_CONTEXT,
          action: 'clientError',
          metadata: { error: err },
        });
        setError(err instanceof Error ? err : new Error(String(err)));
      });

      if (mountedRef.current) {
        setClient(newClient);
        clientRef.current = newClient;
        setError(null);
        retryCountRef.current = 0;
      }

      logger.info('Client initialized successfully', LOG_CONTEXT);
      return newClient;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to initialize client', {
        ...LOG_CONTEXT,
        action: 'initialize',
        metadata: { error: err, retry: retryCountRef.current },
      });

      retryCountRef.current++;
      if (mountedRef.current) {
        setError(err);
      }

      // Retry after delay
      if (retryCountRef.current < MAX_INIT_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, INIT_RETRY_DELAY));
        return getClient();
      }
      throw err;
    } finally {
      if (mountedRef.current) {
        setIsInitializing(false);
      }
      initializingRef.current = false;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanupClient().catch((error) => {
        logger.error('Error during cleanup on unmount', {
          ...LOG_CONTEXT,
          action: 'unmount',
          metadata: { error },
        });
      });
    };
  }, [cleanupClient]);

  const contextValue = useMemo(
    () => ({
      client,
      getClient,
      cleanupClient,
      isInitializing,
      error,
    }),
    [client, getClient, cleanupClient, isInitializing, error]
  );

  return (
    <AgoraContext.Provider value={contextValue}>
      {children}
    </AgoraContext.Provider>
  );
}
