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

import { AIDenoiserExtension } from 'agora-extension-ai-denoiser';

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
  denoiser: null,
});

export const useAgoraContext = () => useContext(AgoraContext);

// Lazy load AgoraRTC to avoid SSR issues
let AgoraRTC: IAgoraRTC | null = null;
let denoiser: AIDenoiserExtension | null = null;

async function loadAgoraSDK(): Promise<{ agora: IAgoraRTC; denoiser: AIDenoiserExtension | null }> {
  if (typeof window === 'undefined') {
    throw new Error('Cannot load Agora SDK in non-browser environment');
  }

  if (AgoraRTC) {
    return { agora: AgoraRTC, denoiser };
  }

  const mod = await import('agora-rtc-sdk-ng');
  AgoraRTC = mod.default;

  // Configure Agora SDK
  AgoraRTC.disableLogUpload();
  AgoraRTC.setLogLevel(0); // Set to INFO level

  // Initialize AI Denoiser with proper assets path
  const newDenoiser = new AIDenoiserExtension({
    assetsPath: '/external/agora-denoiser'
  });

  // Check compatibility and register only if supported
  if (newDenoiser.checkCompatibility()) {
    try {
      // Wait for AudioContext to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Register extension before checking for errors
      AgoraRTC.registerExtensions([newDenoiser]);

      // Wait for registration to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Handle loading errors
      newDenoiser.onloaderror = (err: unknown) => {
        logger.error('AI Denoiser failed to load', {
          ...LOG_CONTEXT,
          action: 'loadSDK',
          metadata: { error: err }
        });
        denoiser = null;
      };

      // Only set denoiser if no errors occurred during registration
      denoiser = newDenoiser;
      logger.info('AI Denoiser initialized successfully', {
        ...LOG_CONTEXT,
        action: 'loadSDK'
      });
    } catch (err) {
      logger.error('Failed to register AI Denoiser', {
        ...LOG_CONTEXT,
        action: 'loadSDK',
        metadata: { error: err }
      });
      denoiser = null;
    }
  } else {
    logger.warn('AI Denoiser not compatible with current environment', {
      ...LOG_CONTEXT,
      action: 'loadSDK'
    });
  }

  return { agora: AgoraRTC, denoiser };
}

export function AgoraProvider({ children }: AgoraProviderProps) {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [denoiserInstance, setDenoiserInstance] = useState<AIDenoiserExtension | null>(null);
  const mountedRef = useRef(true);
  const retryCountRef = useRef(0);

  const getClient = useCallback(async () => {
    if (client) return client;

    setIsInitializing(true);
    setError(null);

    try {
      if (!AgoraRTC) {
        const { agora, denoiser: loadedDenoiser } = await loadAgoraSDK();
        if (!agora) throw new Error('Failed to load Agora SDK');

        const newClient = agora.createClient({ mode: 'rtc', codec: 'vp8' });
        if (mountedRef.current) {
          setClient(newClient);
          setDenoiserInstance(loadedDenoiser);
          retryCountRef.current = 0;
        }
        return newClient;
      }

      const newClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      if (mountedRef.current) {
        setClient(newClient);
        setDenoiserInstance(denoiser);
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
  }, [client]);

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
      denoiser: denoiserInstance,
    }),
    [client, getClient, cleanupClient, isInitializing, error, denoiserInstance]
  );

  return <AgoraContext.Provider value={contextValue}>{children}</AgoraContext.Provider>;
}
