import type { VolumeState } from '@/lib/types/components/props';
import type { VoiceMemberState } from '@/lib/types/party/member';

import { useState, useEffect } from 'react';

import { useAgoraContext } from '@/components/providers/AgoraProvider';

import { VoiceService } from '../services/voiceService';

export function useVolumeControl() {
  const [volumeLevels, setVolumeLevels] = useState<Record<string, VolumeState>>({});
  const { client } = useAgoraContext();

  useEffect(() => {
    if (!client) return;

    try {
      const service = VoiceService.getInstance(client);
      service.onVolumeChange((volumes: VoiceMemberState[]) => {
        setVolumeLevels((prevVolumes) => {
          const newVolumes = { ...prevVolumes };
          volumes.forEach((vol) => {
            newVolumes[vol.id] = {
              id: vol.id,
              level: vol.level,
              voice_status: vol.voice_status,
              muted: vol.muted,
              is_deafened: vol.is_deafened,
              agora_uid: vol.agora_uid,
            };
          });
          return newVolumes;
        });
      });

      return () => {
        // Properly cleanup by setting callback to null
        service.onVolumeChange(null);
        // Clear volume levels
        setVolumeLevels({});
      };
    } catch (error) {
      console.error('Failed to initialize VoiceService:', error);
      return undefined;
    }
  }, [client]);

  return volumeLevels;
}
