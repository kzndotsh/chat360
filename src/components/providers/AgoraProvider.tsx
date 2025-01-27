'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { IAgoraRTC, IAgoraRTCClient } from 'agora-rtc-sdk-ng';

import { logger } from '@/lib/logger';

// Constants for cleanup and reconnection
const CLEANUP_DELAY = 500; // 500ms delay after cleanup
const INIT_RETRY_DELAY = 2000; // 2 seconds delay between retries

interface AgoraContextType {
  client: IAgoraRTCClient | null;
  error: Error | null;
  isInitializing: boolean;
  cleanupClient: () => Promise<void>;
  getClient: () => Promise<IAgoraRTCClient>;
}

interface AgoraProviderProps {
  children: ReactNode;
}

const AgoraContext = createContext<AgoraContextType>({
  client: null,
  getClient: async () => {
    throw new Error('AgoraContext not initialized');
  },
  cleanupClient: async () => {},
  isInitializing: false,
  error: null,
});

export const useAgoraContext = () => useContext(AgoraContext);

// Lazy load AgoraRTC to avoid SSR issues
let AgoraRTC: IAgoraRTC | null = null;

async function loadAgoraSDK(): Promise<{ agora: IAgoraRTC }> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot load Agora SDK in non-browser environment');
  }

  if (AgoraRTC) {
    return { agora: AgoraRTC };
  }

  const mod = await import('agora-rtc-sdk-ng');
  AgoraRTC = mod.default;

  // Configure Agora SDK
  AgoraRTC.disableLogUpload();
  AgoraRTC.setLogLevel(0); // Set to INFO level

  // Disable stats collection and logging
  // @ts-expect-error - These parameters exist but are not in type definitions
  AgoraRTC.setParameter('DISABLE_STATS_COLLECTOR', true);
  // @ts-expect-error - These parameters exist but are not in type definitions
  AgoraRTC.setParameter('UPLOAD_LOG', false);
  // @ts-expect-error - These parameters exist but are not in type definitions
  AgoraRTC.setParameter('REPORT_APP_SCENARIO', false);
  // @ts-expect-error - These parameters exist but are not in type definitions
  AgoraRTC.setParameter('UPLOAD_EXCEPTION', false);

  return { agora: AgoraRTC };
}

export function AgoraProvider({ children }: AgoraProviderProps) {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);
  const retryCountRef = useRef(0);

  const getClient = useCallback(async () => {
    if (client) return client;

    setIsInitializing(true);
    setError(null);

    try {
      if (!AgoraRTC) {
        const { agora } = await loadAgoraSDK();
        if (!agora) throw new Error('Failed to load Agora SDK');

        // Create client with minimal configuration
        const newClient = agora.createClient({
          mode: 'rtc',
          codec: 'vp8'
        });
        if (mountedRef.current) {
          setClient(newClient);
          retryCountRef.current = 0;
        }
        return newClient;
      }

      const newClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      if (mountedRef.current) {
        setClient(newClient);
        retryCountRef.current = 0;
      }
      return newClient;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to initialize client', {
        component: 'AgoraProvider',
        action: 'getClient',
        metadata: { error },
      });

      if (mountedRef.current) {
        setError(error);
        retryCountRef.current++;
      }

      // Retry initialization with exponential backoff
      if (retryCountRef.current < 3) {
        await new Promise((resolve) =>
          setTimeout(resolve, INIT_RETRY_DELAY * Math.pow(2, retryCountRef.current))
        );
        return getClient();
      }

      throw error;
    } finally {
      if (mountedRef.current) {
        setIsInitializing(false);
      }
    }
  }, [client]);

  const cleanupClient = useCallback(async () => {
    if (!client) return;

    try {
      // First stop all tracks
      const localTracks = client.localTracks;
      await Promise.all(
        localTracks.map((track) => {
          track.stop();
          return track.close();
        })
      );

      // Then leave the channel
      await client.leave();

      // Finally release the client
      client.removeAllListeners();
      if (mountedRef.current) {
        setClient(null);
      }
    } catch (err) {
      logger.error('Error during client cleanup', {
        component: 'AgoraProvider',
        action: 'cleanupClient',
        metadata: { error: err },
      });
    }

    // Add delay to ensure cleanup is complete
    await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY));
  }, [client]);

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
