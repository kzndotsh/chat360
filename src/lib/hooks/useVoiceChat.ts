import { useCallback, useEffect, useRef, useState } from 'react';
import { useVoiceClient } from './useVoiceClient';
import { useVoiceTrack } from './useVoiceTrack';
import { useVolumeMonitor } from './useVolumeMonitor';
import { useVoicePermissions } from './useVoicePermissions';
import { usePartyState } from './usePartyState';
import { logger } from '@/lib/utils/logger';

export type VoiceChatError = {
  type: 'permission' | 'connection' | 'track' | 'unknown';
  message: string;
  details?: unknown;
};

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

export function useVoiceChat() {
  const [error, setError] = useState<VoiceChatError | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryAttemptsRef = useRef(0);
  const loggerRef = useRef(logger);
  const cleanupInProgressRef = useRef(false);

  const { client, isConnected, joinVoice, leaveVoice } = useVoiceClient();
  const { track, isLoadingMic, isMuted, toggleMute, stopTrack } = useVoiceTrack();
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
  }, [leaveVoice, stopTrack, track, isConnected, error, retryOperation, partyState]);

  // Enhanced connect with retry logic
  const connect = useCallback(async () => {
    loggerRef.current.debug('Attempting to connect to voice chat', {
      component: 'useVoiceChat',
      action: 'connect',
      metadata: {
        hasPermission: hasAudioPermission,
        isConnected,
        hasError: !!error,
      },
    });

    try {
      setError(null);

      // First check if we already have permission
      if (!hasAudioPermission) {
        loggerRef.current.debug('Requesting microphone permission', {
          component: 'useVoiceChat',
          action: 'connect',
        });

        const hasPermission = await requestAudioPermission();
        if (!hasPermission) {
          const permissionError = {
            type: 'permission' as const,
            message: 'Microphone permission denied',
          };
          setError(permissionError);
          loggerRef.current.warn('Microphone permission denied', {
            component: 'useVoiceChat',
            action: 'connect',
          });
          return;
        }
      }

      // Then try to join voice chat
      loggerRef.current.debug('Attempting to join voice chat', {
        component: 'useVoiceChat',
        action: 'connect',
      });

      await joinVoice();

      loggerRef.current.info('Successfully connected to voice chat', {
        component: 'useVoiceChat',
        action: 'connect',
      });
    } catch (err) {
      const connectError = {
        type: 'connection' as const,
        message: 'Failed to connect to voice chat',
        details: err,
      };
      setError(connectError);

      // Attempt retry
      const success = await retryOperation(joinVoice);
      if (!success) {
        loggerRef.current.error('Failed to connect to voice chat after retries', {
          component: 'useVoiceChat',
          action: 'connect',
          metadata: { error: err },
        });
      }
    }
  }, [joinVoice, requestAudioPermission, hasAudioPermission, isConnected, error, retryOperation]);

  // Auto-join with better state handling
  useEffect(() => {
    let isStale = false;
    let timeoutId: NodeJS.Timeout;

    if (partyState === 'joined' && currentUser && !isConnected && !cleanupInProgressRef.current) {
      loggerRef.current.debug('Auto-joining voice chat after party join', {
        component: 'useVoiceChat',
        action: 'autoJoin',
        metadata: {
          userId: currentUser.id,
          hasPermission: hasAudioPermission,
        },
      });

      // Request permission immediately
      if (!hasAudioPermission) {
        loggerRef.current.debug('Requesting microphone permission before auto-join', {
          component: 'useVoiceChat',
          action: 'autoJoin',
        });

        requestAudioPermission()
          .then((hasPermission) => {
            if (isStale) return;

            if (hasPermission) {
              loggerRef.current.debug('Got microphone permission, proceeding with auto-join', {
                component: 'useVoiceChat',
                action: 'autoJoin',
              });

              // Add a delay to ensure everything is ready
              timeoutId = setTimeout(async () => {
                if (isStale) return;

                try {
                  await connect();
                } catch (err) {
                  if (!isStale) {
                    loggerRef.current.error('Failed to auto-join voice chat', {
                      component: 'useVoiceChat',
                      action: 'autoJoin',
                      metadata: { error: err },
                    });
                  }
                }
              }, 1000);
            } else {
              loggerRef.current.warn('Microphone permission denied during auto-join', {
                component: 'useVoiceChat',
                action: 'autoJoin',
              });
            }
          })
          .catch((error) => {
            if (!isStale) {
              loggerRef.current.error('Failed to request microphone permission during auto-join', {
                component: 'useVoiceChat',
                action: 'autoJoin',
                metadata: { error },
              });
            }
          });
      } else {
        // Already have permission, proceed with connect after delay
        timeoutId = setTimeout(async () => {
          if (isStale) return;

          try {
            await connect();
          } catch (err) {
            if (!isStale) {
              loggerRef.current.error('Failed to auto-join voice chat', {
                component: 'useVoiceChat',
                action: 'autoJoin',
                metadata: { error: err },
              });
            }
          }
        }, 1000);
      }
    }

    return () => {
      isStale = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [partyState, currentUser, isConnected, connect, hasAudioPermission, requestAudioPermission]);

  // Sync cleanup with party state
  useEffect(() => {
    if ((partyState === 'leaving' || !currentUser) && !cleanupInProgressRef.current) {
      loggerRef.current.debug('Party leaving or user removed, initiating voice cleanup', {
        component: 'useVoiceChat',
        action: 'partyStateSync',
        metadata: {
          isConnected,
          hasTrack: !!track,
          cleanupInProgress: cleanupInProgressRef.current,
          partyState,
        },
      });

      // Add small delay to ensure we don't cleanup too early
      setTimeout(cleanup, 100);
    }
  }, [partyState, currentUser, cleanup, isConnected, track]);

  return {
    // Connection states
    isConnected,
    connectionState: client?.connectionState || 'DISCONNECTED',
    isRetrying,

    // Audio states
    isLoadingMic,
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
    client,
  };
}
