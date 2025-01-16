import { useCallback, useEffect, useState } from 'react';
import type { IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { supabase } from '@/lib/api/supabase';
import { usePartyState } from './usePartyState';
import { useAgoraContext } from '@/components/providers/AgoraProvider';
import { logger } from '@/lib/utils/logger';

export type VoiceStatus = 'silent' | 'speaking' | 'muted';

export function useVoiceChat() {
  const { currentUser } = usePartyState();
  const { client, initializeClient } = useAgoraContext();

  const [hasAudioPermission, setHasAudioPermission] = useState(false);
  const [volumeLevels, setVolumeLevels] = useState<Record<string, number>>({});
  const [deafenedUsers, setDeafenedUsers] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [track, setTrack] = useState<IMicrophoneAudioTrack | null>(null);
  const [isLoadingMic, setIsLoadingMic] = useState(false);

  // Update voice status in database
  const updateVoiceStatus = useCallback(
    async (status: VoiceStatus) => {
      if (!currentUser?.id) {
        logger.debug('Skipping voice status update - no current user', {
          component: 'useVoiceChat',
          action: 'updateVoiceStatus',
        });
        return;
      }

      logger.debug('Updating voice status', {
        component: 'useVoiceChat',
        action: 'updateVoiceStatus',
        metadata: { userId: currentUser.id, status },
      });

      try {
        await supabase
          .from('party_members')
          .update({ voiceStatus: status })
          .eq('id', currentUser.id);

        logger.debug('Voice status updated successfully', {
          component: 'useVoiceChat',
          action: 'updateVoiceStatus',
          metadata: { userId: currentUser.id, status },
        });
      } catch (error) {
        logger.error('Failed to update voice status', {
          component: 'useVoiceChat',
          action: 'updateVoiceStatus',
          metadata: { userId: currentUser.id, status, error },
        });
      }
    },
    [currentUser?.id]
  );

  // Fetch token from API
  const fetchToken = useCallback(async () => {
    if (!currentUser?.id) {
      logger.debug('Skipping token fetch - no current user', {
        component: 'useVoiceChat',
        action: 'fetchToken',
      });
      return null;
    }

    logger.debug('Fetching Agora token', {
      component: 'useVoiceChat',
      action: 'fetchToken',
      metadata: { userId: currentUser.id },
    });

    try {
      const response = await fetch('/api/agora/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName: 'main',
          uid: parseInt(currentUser.id),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch token: ${response.status}`);
      }

      const data = await response.json();
      logger.debug('Token fetched successfully', {
        component: 'useVoiceChat',
        action: 'fetchToken',
        metadata: { userId: currentUser.id },
      });
      return data.token;
    } catch (error) {
      logger.error('Failed to fetch token', {
        component: 'useVoiceChat',
        action: 'fetchToken',
        metadata: { userId: currentUser.id, error },
      });
      return null;
    }
  }, [currentUser?.id]);

  // Create microphone track
  const createMicrophoneTrack = useCallback(async () => {
    logger.debug('Creating microphone track', {
      component: 'useVoiceChat',
      action: 'createMicrophoneTrack',
    });

    try {
      setIsLoadingMic(true);
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      setTrack(audioTrack);
      logger.debug('Microphone track created successfully', {
        component: 'useVoiceChat',
        action: 'createMicrophoneTrack',
      });
      return audioTrack;
    } catch (error) {
      logger.error('Failed to create microphone track', {
        component: 'useVoiceChat',
        action: 'createMicrophoneTrack',
        metadata: { error },
      });
      return null;
    } finally {
      setIsLoadingMic(false);
    }
  }, []);

  // Request audio permission
  const requestAudioPermission = useCallback(async () => {
    logger.debug('Requesting audio permission', {
      component: 'useVoiceChat',
      action: 'requestPermission',
    });

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasAudioPermission(true);
      logger.debug('Audio permission granted', {
        component: 'useVoiceChat',
        action: 'requestPermission',
      });
      return true;
    } catch (error) {
      logger.error('Audio permission denied', {
        component: 'useVoiceChat',
        action: 'requestPermission',
        metadata: { error },
      });
      setHasAudioPermission(false);
      return false;
    }
  }, []);

  // Join voice chat
  const joinVoice = useCallback(async () => {
    if (!currentUser?.id || !client) {
      logger.debug('Skipping voice join - missing requirements', {
        component: 'useVoiceChat',
        action: 'joinVoice',
        metadata: {
          hasUser: !!currentUser?.id,
          hasClient: !!client,
        },
      });
      return;
    }

    logger.info('Attempting to join voice chat', {
      component: 'useVoiceChat',
      action: 'joinVoice',
      metadata: { userId: currentUser.id },
    });

    const hasPermission = await requestAudioPermission();
    if (!hasPermission) {
      logger.warn('Voice join aborted - no audio permission', {
        component: 'useVoiceChat',
        action: 'joinVoice',
        metadata: { userId: currentUser.id },
      });
      return;
    }

    try {
      // Initialize client if not already initialized
      await initializeClient();
      logger.debug('Client initialized', {
        component: 'useVoiceChat',
        action: 'joinVoice',
      });

      // Ensure we're in a clean state
      await client.leave().catch((error) => {
        logger.warn('Error during pre-join cleanup', {
          component: 'useVoiceChat',
          action: 'joinVoice',
          metadata: { error },
        });
      });

      if (track) {
        track.stop();
        setTrack(null);
        logger.debug('Stopped existing track', {
          component: 'useVoiceChat',
          action: 'joinVoice',
        });
      }

      // Create new track
      const audioTrack = await createMicrophoneTrack();
      if (!audioTrack) {
        throw new Error('Failed to create audio track');
      }

      // Fetch new token
      const newToken = await fetchToken();
      if (!newToken) {
        throw new Error('Failed to get token');
      }

      // Join channel
      await client.join(
        process.env.NEXT_PUBLIC_AGORA_APP_ID!,
        'main',
        newToken,
        parseInt(currentUser.id)
      );
      logger.debug('Joined Agora channel', {
        component: 'useVoiceChat',
        action: 'joinVoice',
        metadata: {
          userId: currentUser.id,
          channel: 'main',
        },
      });

      // Publish track
      await client.publish(audioTrack);
      logger.debug('Published audio track', {
        component: 'useVoiceChat',
        action: 'joinVoice',
      });

      setIsConnected(true);
      await updateVoiceStatus('speaking');
      logger.info('Successfully joined voice chat', {
        component: 'useVoiceChat',
        action: 'joinVoice',
        metadata: { userId: currentUser.id },
      });
    } catch (error) {
      logger.error('Failed to join voice chat', {
        component: 'useVoiceChat',
        action: 'joinVoice',
        metadata: { userId: currentUser.id, error },
      });
      setIsConnected(false);
      await updateVoiceStatus('silent');
    }
  }, [
    currentUser?.id,
    client,
    track,
    createMicrophoneTrack,
    fetchToken,
    updateVoiceStatus,
    initializeClient,
    requestAudioPermission,
  ]);

  // Leave voice chat
  const leaveVoice = useCallback(async () => {
    logger.info('Leaving voice chat', {
      component: 'useVoiceChat',
      action: 'leaveVoice',
      metadata: { userId: currentUser?.id },
    });

    setIsConnected(false);
    await updateVoiceStatus('silent');

    if (track) {
      track.stop();
      setTrack(null);
      logger.debug('Stopped audio track', {
        component: 'useVoiceChat',
        action: 'leaveVoice',
      });
    }

    if (client) {
      try {
        await client.leave();
        logger.debug('Left Agora channel', {
          component: 'useVoiceChat',
          action: 'leaveVoice',
        });
      } catch (error) {
        logger.error('Error leaving Agora channel', {
          component: 'useVoiceChat',
          action: 'leaveVoice',
          metadata: { error },
        });
      }
    }
  }, [client, track, updateVoiceStatus, currentUser?.id]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    if (!track) {
      logger.debug('Cannot toggle mute - no audio track', {
        component: 'useVoiceChat',
        action: 'toggleMute',
      });
      return;
    }

    const newState = !track.enabled;
    logger.info('Toggling mute state', {
      component: 'useVoiceChat',
      action: 'toggleMute',
      metadata: {
        userId: currentUser?.id,
        newState: newState ? 'unmuted' : 'muted',
      },
    });

    track.setEnabled(newState);
    await updateVoiceStatus(newState ? 'speaking' : 'muted');
  }, [track, updateVoiceStatus, currentUser?.id]);

  // Toggle deafen user
  const toggleDeafenUser = useCallback(
    async (userId: string) => {
      if (!currentUser?.id) {
        logger.debug('Cannot toggle deafen - no current user', {
          component: 'useVoiceChat',
          action: 'toggleDeafen',
        });
        return;
      }

      const isDeafening = !deafenedUsers.includes(userId);
      logger.info('Toggling user deafen state', {
        component: 'useVoiceChat',
        action: 'toggleDeafen',
        metadata: {
          userId,
          currentUserId: currentUser.id,
          newState: isDeafening ? 'deafened' : 'undeafened',
        },
      });

      const newDeafenedUsers = isDeafening
        ? [...deafenedUsers, userId]
        : deafenedUsers.filter((id) => id !== userId);

      setDeafenedUsers(newDeafenedUsers);

      try {
        await supabase
          .from('party_members')
          .update({ deafened_users: newDeafenedUsers })
          .eq('id', currentUser.id);

        logger.debug('Updated deafened users list', {
          component: 'useVoiceChat',
          action: 'toggleDeafen',
          metadata: {
            userId,
            deafenedCount: newDeafenedUsers.length,
          },
        });
      } catch (error) {
        logger.error('Failed to update deafened users', {
          component: 'useVoiceChat',
          action: 'toggleDeafen',
          metadata: { userId, error },
        });
      }
    },
    [currentUser?.id, deafenedUsers]
  );

  // Monitor client connection state
  useEffect(() => {
    if (!client) return;

    const handleConnectionStateChange = (state: string) => {
      logger.info('Connection state changed', {
        component: 'useVoiceChat',
        action: 'connectionState',
        metadata: {
          state,
          userId: currentUser?.id,
        },
      });

      if (state === 'DISCONNECTED') {
        setIsConnected(false);
        updateVoiceStatus('silent').catch((error) => {
          logger.error('Failed to update voice status after disconnect', {
            component: 'useVoiceChat',
            action: 'connectionState',
            metadata: { error },
          });
        });
      }
    };

    client.on('connection-state-change', handleConnectionStateChange);
    return () => {
      client.off('connection-state-change', handleConnectionStateChange);
    };
  }, [client, updateVoiceStatus, currentUser?.id]);

  // Monitor volume levels
  useEffect(() => {
    if (!track || !currentUser?.id) return;

    const volumeIndicator = setInterval(() => {
      const level = track.getVolumeLevel();
      setVolumeLevels((prev) => ({
        ...prev,
        [currentUser.id]: level,
      }));

      // Only log significant volume changes
      if (level > 0.5) {
        logger.debug('High volume detected', {
          component: 'useVoiceChat',
          action: 'volumeLevel',
          metadata: {
            userId: currentUser.id,
            level,
          },
        });
      }
    }, 100);

    return () => clearInterval(volumeIndicator);
  }, [track, currentUser?.id]);

  return {
    isConnected,
    isLoadingMic,
    hasAudioPermission,
    joinVoice,
    leaveVoice,
    toggleMute,
    volumeLevels,
    toggleDeafenUser,
    deafenedUsers,
  };
}
