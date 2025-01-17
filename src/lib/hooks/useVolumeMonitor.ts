import { useEffect, useState } from 'react';
import { useVoiceClient } from './useVoiceClient';
import { useVoiceTrack } from './useVoiceTrack';
import { usePartyState } from './usePartyState';

export function useVolumeMonitor() {
  const { client, isConnected } = useVoiceClient();
  const { track } = useVoiceTrack();
  const { currentUser } = usePartyState();
  const [volumeLevels, setVolumeLevels] = useState<Record<string, number>>({});
  const [deafenedUsers, setDeafenedUsers] = useState<string[]>([]);

  // Monitor volume levels
  useEffect(() => {
    if (!client || !isConnected) return;

    const volumeIndicator = setInterval(() => {
      const remoteUsers = client.remoteUsers || [];
      const newVolumeLevels: Record<string, number> = {};

      remoteUsers.forEach((user) => {
        const level = user.audioTrack?.getVolumeLevel() || 0;
        newVolumeLevels[user.uid as string] = level * 100; // Convert to percentage
      });

      // Add local user's volume if available
      if (track && currentUser?.id) {
        const localLevel = track.getVolumeLevel() || 0;
        newVolumeLevels[currentUser.id] = localLevel * 100;
      }

      setVolumeLevels(newVolumeLevels);
    }, 100);

    return () => clearInterval(volumeIndicator);
  }, [isConnected, currentUser?.id, client, track]);

  // Toggle deafen user
  const toggleDeafenUser = async (userId: string) => {
    if (!currentUser?.id) return;

    const isDeafening = !deafenedUsers.includes(userId);
    const newDeafenedUsers = isDeafening
      ? [...deafenedUsers, userId]
      : deafenedUsers.filter((id) => id !== userId);

    setDeafenedUsers(newDeafenedUsers);
  };

  return {
    volumeLevels,
    deafenedUsers,
    toggleDeafenUser,
  };
}
