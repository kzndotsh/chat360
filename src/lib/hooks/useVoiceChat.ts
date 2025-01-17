import { useState, useCallback, useRef, useEffect } from 'react';
import { useVoicePermissions } from './useVoicePermissions';
import { usePartyState } from './usePartyState';
import { useVoiceClient } from './useVoiceClient';
import { useVoiceTrack } from './useVoiceTrack';
import { useVolumeMonitor } from './useVolumeMonitor';
import { logger } from '@/lib/utils/logger';
import type { IAgoraRTCClient } from 'agora-rtc-sdk-ng';

export type VoiceChatError = {
  type: 'permission' | 'connection' | 'track' | 'unknown';
  message: string;
  details?: unknown;
};

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

export function useVoiceChat() {
  // Logger ref to avoid recreation
  const loggerRef = useRef(logger);
  const cleanupInProgressRef = useRef(false);
  const retryAttemptsRef = useRef(0);

  // State
  const [error, setError] = useState<VoiceChatError | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Hooks
  const { client, isConnected, joinVoice, leaveVoice } = useVoiceClient();
  const typedClient = client as IAgoraRTCClient | undefined;
  const { track, isMuted, toggleMute, stopTrack, createMicrophoneTrack } = useVoiceTrack();
  const { volumeLevels, deafenedUsers, toggleDeafenUser } = useVolumeMonitor();
  const { hasAudioPermission, requestAudioPermission } = useVoicePermissions();
  const { currentUser, partyState } = usePartyState();

  // Reset retry counter when error is cleared
  useEffect(() => {
    if (!error) {
      retryAttemptsRef.current = 0;
    }
  }, [error]);

  // Retry logic for failed operations
  const retryOperation = useCallback(async (operation: () => Promise<void>) => {
    if (retryAttemptsRef.current >= MAX_RETRY_ATTEMPTS) {
      loggerRef.current.error('Max retry attempts reached', {
        component: 'useVoiceChat',
        action: 'retry',
        metadata: { attempts: retryAttemptsRef.current },
      });
      return false;
    }

    setIsRetrying(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      await operation();
      setError(null);
      return true;
    } catch (err) {
      retryAttemptsRef.current++;
      loggerRef.current.warn('Retry attempt failed', {
        component: 'useVoiceChat',
        action: 'retry',
        metadata: {
          attempt: retryAttemptsRef.current,
          error: err,
        },
      });
      return false;
    } finally {
      setIsRetrying(false);
    }
  }, []);

  // Enhanced cleanup with better state handling
  const cleanup = useCallback(async () => {
    if (cleanupInProgressRef.current) {
      loggerRef.current.debug('Cleanup already in progress, skipping', {
        component: 'useVoiceChat',
        action: 'cleanup',
      });
      return;
    }

    cleanupInProgressRef.current = true;
    loggerRef.current.debug('Starting voice chat cleanup', {
      component: 'useVoiceChat',
      action: 'cleanup',
      metadata: {
        hasTrack: !!track,
        isConnected,
        hasError: !!error,
        partyState,
      },
    });

    try {
      setError(null);

      // First stop the track if it exists
      if (track) {
        try {
          await stopTrack();
          loggerRef.current.debug('Successfully stopped track during cleanup', {
            component: 'useVoiceChat',
            action: 'cleanup',
          });
        } catch (err) {
          loggerRef.current.error('Failed to stop track during cleanup', {
            component: 'useVoiceChat',
            action: 'cleanup',
            metadata: { error: err },
          });
        }
      }

      // Then attempt to leave voice if connected
      if (isConnected) {
        try {
          await leaveVoice();
          loggerRef.current.debug('Successfully left voice chat during cleanup', {
            component: 'useVoiceChat',
            action: 'cleanup',
          });
        } catch (err) {
          const leaveError = {
            type: 'connection' as const,
            message: 'Failed to leave voice chat',
            details: err,
          };
          setError(leaveError);

          if (isConnected) {
            const success = await retryOperation(leaveVoice);
            if (!success) {
              loggerRef.current.error('Failed to leave voice chat after retries', {
                component: 'useVoiceChat',
                action: 'cleanup',
                metadata: { error: err },
              });
            }
          }
        }
      }
    } finally {
      cleanupInProgressRef.current = false;
      loggerRef.current.debug('Cleanup completed', {
        component: 'useVoiceChat',
        action: 'cleanup',
        metadata: {
          hasError: !!error,
          isConnected,
          hasTrack: !!track,
        },
      });
    }
  }, [track, stopTrack, isConnected, leaveVoice, error, retryOperation, partyState]);

  // Enhanced connect with better state handling
  const connect = useCallback(async () => {
    // Check dependencies first
    if (!typedClient || !currentUser) {
      loggerRef.current.error('Connect failed - missing dependencies', {
        component: 'useVoiceChat',
        action: 'connect',
        metadata: {
          hasClient: !!typedClient,
          hasUser: !!currentUser,
          connectionState: typedClient?.connectionState
        }
      });
      return;
    }

    // Skip if already connected
    const state = typedClient.connectionState;
    if (state === 'CONNECTED') {
      loggerRef.current.debug('Connect skipped - already connected', {
        component: 'useVoiceChat',
        action: 'connect',
        metadata: {
          connectionState: state
        }
      });
      return;
    }

    // Skip if cleanup in progress
    if (cleanupInProgressRef.current) {
      loggerRef.current.debug('Connect skipped - cleanup in progress', {
        component: 'useVoiceChat',
        action: 'connect'
      });
      return;
    }

    try {
      // Request audio permission if needed
      if (!hasAudioPermission) {
        loggerRef.current.debug('Requesting audio permission before connect', {
          component: 'useVoiceChat',
          action: 'connect'
        });
        await requestAudioPermission();
      }

      // Join voice chat
      loggerRef.current.debug('Attempting to join voice chat', {
        component: 'useVoiceChat',
        action: 'connect',
        metadata: {
          userId: currentUser.id,
          connectionState: typedClient.connectionState
        }
      });

      await joinVoice();

      // Create and publish track
      const newTrack = await createMicrophoneTrack();
      if (newTrack && typedClient.connectionState === 'CONNECTED') {
        await typedClient.publish(newTrack);
      }

      loggerRef.current.debug('Successfully connected', {
        component: 'useVoiceChat',
        action: 'connect',
        metadata: {
          userId: currentUser.id,
          connectionState: typedClient.connectionState,
          hasTrack: !!newTrack
        }
      });
    } catch (err) {
      loggerRef.current.error('Connect failed', {
        component: 'useVoiceChat',
        action: 'connect',
        metadata: {
          error: err,
          userId: currentUser.id,
          connectionState: typedClient.connectionState
        }
      });
      throw err;
    }
  }, [typedClient, currentUser, hasAudioPermission, requestAudioPermission, joinVoice, createMicrophoneTrack]);

  // Voice chat state check effect - for logging only
  useEffect(() => {
    loggerRef.current.debug('Voice chat state check', {
      component: 'useVoiceChat',
      action: 'stateCheck',
      metadata: {
        partyState,
        hasUser: !!currentUser,
        hasClient: !!typedClient,
        isConnected,
        clientState: typedClient?.connectionState,
        cleanupInProgress: cleanupInProgressRef.current
      }
    });
  }, [partyState, currentUser, typedClient, isConnected]);

  // Cleanup effect
  useEffect(() => {
    // Only trigger cleanup on transition to leaving state and not already cleaning up
    if (partyState === 'leaving' && !cleanupInProgressRef.current) {
      loggerRef.current.debug('Voice chat cleanup triggered', {
        component: 'useVoiceChat',
        action: 'cleanup',
        metadata: {
          userId: currentUser?.id,
          clientState: typedClient?.connectionState,
          timestamp: Date.now()
        }
      });
      cleanup();
    }
  }, [partyState, cleanup]);

  return {
    // Connection states
    isConnected,
    connectionState: typedClient?.connectionState || 'DISCONNECTED',
    isRetrying,

    // Audio states
    isMuted,
    hasAudioPermission,

    // Actions
    toggleMute,
    connect,
    disconnect: cleanup,
    requestAudioPermission,

    // Volume monitoring
    volumeLevels,
    deafenedUsers,
    toggleDeafenUser,

    // Error handling
    error,
    clearError: () => setError(null),

    // Advanced usage
    track,
    client: typedClient,
  };
}

