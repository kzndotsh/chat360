import type { VolumeState } from '@/lib/types/components/props';

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
      service.onVolumeChange((volumes) => {
        setVolumeLevels((prevVolumes) => {
          const newVolumes = { ...prevVolumes };
          volumes.forEach((vol) => {
            // Transform VolumeData to VolumeState
            newVolumes[vol.uid] = {
              level: vol.level,
              voice_status: vol.voice_status,
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
