import { useCallback, useRef, useState } from 'react';
import { logger } from '@/lib/utils/logger';

export function useVoicePermissions() {
  const [hasAudioPermission, setHasAudioPermission] = useState(false);
  const loggerRef = useRef(logger);

  // Request audio permission
  const requestAudioPermission = useCallback(async () => {
    loggerRef.current.debug('Requesting audio permission', {
      component: 'useVoicePermissions',
      action: 'requestPermission',
    });

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasAudioPermission(true);
      loggerRef.current.debug('Audio permission granted', {
        component: 'useVoicePermissions',
        action: 'requestPermission',
      });
      return true;
    } catch (error) {
      loggerRef.current.error('Audio permission denied', {
        component: 'useVoicePermissions',
        action: 'requestPermission',
        metadata: { error },
      });
      setHasAudioPermission(false);
      return false;
    }
  }, []);

  return {
    hasAudioPermission,
    requestAudioPermission,
  };
}
