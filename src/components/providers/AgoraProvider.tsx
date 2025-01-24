'use client';

import type { AgoraContextType } from '@/lib/types/agora';
import type { AgoraProviderProps } from '@/lib/types/providers';
import type { IAgoraRTC, IAgoraRTCClient } from 'agora-rtc-sdk-ng';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { logger } from '@/lib/logger';

// Constants for cleanup and reconnection
const CLEANUP_DELAY = 500; // 500ms delay after cleanup
const INIT_RETRY_DELAY = 2000; // 2 seconds delay between retries
const MAX_INIT_RETRIES = 3; // Maximum number of initialization retries
const LOG_CONTEXT = { component: 'AgoraProvider' };

if (!process.env.NEXT_PUBLIC_AGORA_APP_ID) {
  throw new Error('NEXT_PUBLIC_AGORA_APP_ID is required');
}

const AgoraContext = createContext<AgoraContextType>({
  client: null,
  getClient: async () => {
    throw new Error('AgoraProvider not initialized');
  },
  cleanupClient: async () => {},
  isInitializing: false,
  error: null,
});

export const useAgoraContext = () => useContext(AgoraContext);

// Lazy load AgoraRTC to avoid SSR issues
let AgoraRTC: IAgoraRTC | null = null;

async function loadAgoraSDK(): Promise<void> {
  if (typeof window === 'undefined' || AgoraRTC) return;

  const mod = await import('agora-rtc-sdk-ng');
  AgoraRTC = mod.default;
  if (AgoraRTC) {
    // Configure Agora SDK
    AgoraRTC.disableLogUpload();
    AgoraRTC.setLogLevel(0); // Set to INFO level
  }
}

// Initialize SDK loading
if (typeof window !== 'undefined') {
  loadAgoraSDK().catch((error) => {
    logger.error('Failed to load Agora SDK', {
      ...LOG_CONTEXT,
      action: 'loadSDK',
      metadata: { error },
    });
  });
}

export function AgoraProvider({ children }: AgoraProviderProps) {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const retryCountRef = useRef(0);

  const initClient = useCallback(async () => {
    if (!AgoraRTC) {
      try {
        await loadAgoraSDK();
      } catch (err) {
        logger.error('Failed to load Agora SDK during init', {
          ...LOG_CONTEXT,
          action: 'initClient',
          metadata: { error: err },
        });
        throw err;
      }
    }

    if (!AgoraRTC) {
      throw new Error('Failed to load Agora SDK');
    }

    const newClient = AgoraRTC.createClient({
      mode: 'rtc',
      codec: 'vp8',
    });

    // Configure client settings
    await newClient.enableDualStream().catch((err) => {
      logger.error('Failed to enable dual stream', {
        ...LOG_CONTEXT,
        action: 'initClient',
        metadata: { error: err },
      });
    });

    return newClient;
  }, []);

  const cleanupClient = useCallback(async () => {
    if (!client) return;

    try {
      // First stop all tracks
      const localTracks = client.localTracks;
      await Promise.all(localTracks.map((track) => track.stop()));

      // Then leave the channel
      await client.leave();
      logger.debug('Client left channel', LOG_CONTEXT);
    } catch (err) {
      logger.error('Error during client cleanup', {
        ...LOG_CONTEXT,
        action: 'cleanupClient',
        metadata: { error: err },
      });
    }

    // Add delay to ensure cleanup is complete
    await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY));
  }, [client]);

  const getClient = useCallback(async () => {
    if (client) return client;

    setIsInitializing(true);
    setError(null);

    try {
      const newClient = await initClient();
      if (mountedRef.current) {
        setClient(newClient);
        retryCountRef.current = 0;
      }
      return newClient;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to initialize client', {
        ...LOG_CONTEXT,
        action: 'getClient',
        metadata: {
          error,
          retryCount: retryCountRef.current,
        },
      });

      if (mountedRef.current) {
        setError(error);
        retryCountRef.current++;

        // Retry initialization if under max retries
        if (retryCountRef.current < MAX_INIT_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, INIT_RETRY_DELAY * Math.pow(2, retryCountRef.current - 1))
          );
          return getClient();
        }
      }
      throw error;
    } finally {
      if (mountedRef.current) {
        setIsInitializing(false);
      }
    }
  }, [client, initClient]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void cleanupClient();
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

  return <AgoraContext.Provider value={contextValue}>{children}</AgoraContext.Provider>;
}
