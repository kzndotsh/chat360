import { useEffect, useState } from 'react';
import type { IRemoteAudioTrack, IAgoraRTCRemoteUser, UID } from 'agora-rtc-sdk-ng';
import { useAgoraContext } from '@/components/providers/AgoraProvider';
import { logger } from '@/lib/utils/logger';

interface RemoteAudioState {
  uid: UID;
  hasAudio: boolean;
  audioTrack: IRemoteAudioTrack | null;
}

export function useRemoteVoice() {
  const { client } = useAgoraContext();
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [remoteAudioStates, setRemoteAudioStates] = useState<RemoteAudioState[]>([]);

  useEffect(() => {
    if (!client) {
      logger.debug('No client available, skipping effect', {
        component: 'useRemoteVoice',
        action: 'setup',
      });
      return;
    }

    logger.debug('Setting up remote voice handlers', {
      component: 'useRemoteVoice',
      action: 'setup',
      metadata: { hasClient: !!client },
    });

    // Update remote users and audio states
    const updateStates = () => {
      setRemoteUsers(client.remoteUsers.slice());
      setRemoteAudioStates(
        client.remoteUsers.map((user) => ({
          uid: user.uid,
          hasAudio: user.hasAudio,
          audioTrack: user.audioTrack || null,
        }))
      );
    };

    const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
      if (mediaType === 'audio') {
        logger.info('Remote user published audio', {
          component: 'useRemoteVoice',
          action: 'userPublished',
          metadata: { uid: user.uid },
        });

        try {
          // Subscribe to the remote user's audio track
          await client.subscribe(user, mediaType);
          logger.debug('Subscribed to remote user audio', {
            component: 'useRemoteVoice',
            action: 'subscribe',
            metadata: { uid: user.uid },
          });

          // Play the audio
          if (user.audioTrack) {
            user.audioTrack.play();
            logger.debug('Started playing remote user audio', {
              component: 'useRemoteVoice',
              action: 'playAudio',
              metadata: { uid: user.uid },
            });
          }

          // Update states
          updateStates();
        } catch (error) {
          logger.error('Failed to handle remote user audio', {
            component: 'useRemoteVoice',
            action: 'handleAudio',
            metadata: {
              uid: user.uid,
              error,
            },
          });
        }
      }
      return;
    };

    const handleUserUnpublished = (user: IAgoraRTCRemoteUser) => {
      logger.info('Remote user unpublished', {
        component: 'useRemoteVoice',
        action: 'userUnpublished',
        metadata: { uid: user.uid },
      });

      // Stop and remove the user's audio track
      if (user.audioTrack) {
        user.audioTrack.stop();
        logger.debug('Stopped remote user audio track', {
          component: 'useRemoteVoice',
          action: 'stopAudio',
          metadata: { uid: user.uid },
        });
      }

      // Update states
      updateStates();
    };

    const handleUserLeft = (user: IAgoraRTCRemoteUser) => {
      logger.info('Remote user left', {
        component: 'useRemoteVoice',
        action: 'userLeft',
        metadata: { uid: user.uid },
      });

      // Update states
      updateStates();
    };

    // Add event listeners
    client.on('user-published', handleUserPublished);
    client.on('user-unpublished', handleUserUnpublished);
    client.on('user-left', handleUserLeft);

    // Initial state update
    updateStates();

    // Cleanup
    return () => {
      logger.debug('Cleaning up remote voice handlers', {
        component: 'useRemoteVoice',
        action: 'cleanup',
      });

      // Remove event listeners
      client.off('user-published', handleUserPublished);
      client.off('user-unpublished', handleUserUnpublished);
      client.off('user-left', handleUserLeft);

      // Stop all remote audio tracks by getting them directly from the client
      client.remoteUsers.forEach((user) => {
        if (user.audioTrack) {
          user.audioTrack.stop();
          logger.debug('Stopped remote audio track during cleanup', {
            component: 'useRemoteVoice',
            action: 'cleanup',
            metadata: { uid: user.uid },
          });
        }
      });
    };
  }, [client]);

  return {
    remoteUsers,
    remoteAudioStates,
  };
}
