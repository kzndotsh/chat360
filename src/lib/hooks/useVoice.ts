'use client';

import type { VoiceHookProps, VoiceHookState } from '../types/party/voice';

import { useState, useEffect, useCallback } from 'react';

import { useAgoraContext } from '@/components/providers/AgoraProvider';

import { logger } from '../logger';
import { VoiceService } from '../services/voiceService';

export function useVoice({ partyState = 'idle', channelName, uid }: Partial<VoiceHookProps>) {
  const [state, setState] = useState<VoiceHookState>({
    status: 'idle',
    error: null,
    isMuted: false,
    volume: 0,
  });
  const { client } = useAgoraContext();
  const [voiceService, setVoiceService] = useState<VoiceService | null>(null);

  // Initialize voice service when client is available
  useEffect(() => {
    if (client) {
      const service = VoiceService.getInstance(client);
      setVoiceService(service);
    }
  }, [client]);

  useEffect(() => {
    if (partyState === 'joined' && channelName && uid && voiceService) {
      setState((prev) => ({ ...prev, status: 'connecting', error: null }));

      voiceService
        .join(channelName, uid)
        .then(() => {
          setState((prev) => ({ ...prev, status: 'connected', error: null }));
        })
        .catch((error) => {
          if (error.name === 'NotAllowedError') {
            setState((prev) => ({ ...prev, status: 'permission_denied', error }));
          } else {
            setState((prev) => ({ ...prev, status: 'disconnected', error }));
          }
          logger.error('Voice connection error', { metadata: { error } });
        });

      return () => {
        voiceService.leave().catch((error) => {
          logger.error('Voice disconnection error', { metadata: { error } });
        });
      };
    }
    return undefined;
  }, [partyState, channelName, uid, voiceService]);

  const toggleMute = useCallback(async () => {
    logger.info('Toggle mute requested', {
      component: 'useVoice',
      action: 'toggleMute',
      metadata: {
        hasVoiceService: !!voiceService,
        currentMuteState: voiceService?.isMuted,
      },
    });

    if (!voiceService) {
      logger.warn('Cannot toggle mute - no voice service available', {
        component: 'useVoice',
        action: 'toggleMute',
      });
      return;
    }

    try {
      await voiceService.toggleMute();
      logger.info('Mute state toggled successfully', {
        component: 'useVoice',
        action: 'toggleMute',
        metadata: {
          newMuteState: voiceService.isMuted,
        },
      });
    } catch (error) {
      logger.error('Toggle mute error', {
        component: 'useVoice',
        action: 'toggleMute',
        metadata: { error },
      });
    }
  }, [voiceService]);

  logger.debug('Voice hook state', {
    component: 'useVoice',
    action: 'render',
    metadata: {
      state,
      isMuted: voiceService?.isMuted,
      volume: voiceService?.getVolume(),
      partyState,
      channelName,
      uid,
    },
  });

  return {
    state,
    toggleMute,
    isMuted: voiceService?.isMuted ?? false,
    volume: voiceService?.getVolume() ?? 0,
  };
}

// Default export with simpler interface
export default function useVoiceWithDefaults(props: Partial<VoiceHookProps> = {}) {
  return useVoice(props);
}
