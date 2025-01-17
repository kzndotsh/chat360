import { useCallback, useRef } from 'react';
import { logger } from '@/lib/utils/logger';
import { supabase } from '@/lib/api/supabase';
import { usePartyState } from './usePartyState';

export type VoiceStatus = 'silent' | 'speaking' | 'muted';

export function useVoiceStatus() {
  const { currentUser } = usePartyState();
  const loggerRef = useRef(logger);

  const updateVoiceStatus = useCallback(
    async (status: VoiceStatus) => {
      if (!currentUser?.id) {
        loggerRef.current.debug('Skipping voice status update - no current user', {
          component: 'useVoiceStatus',
          action: 'updateVoiceStatus',
        });
        return;
      }

      try {
        await supabase
          .from('party_members')
          .update({ voice_status: status })
          .eq('id', currentUser.id);
      } catch (error) {
        loggerRef.current.error('Failed to update voice status', {
          component: 'useVoiceStatus',
          action: 'updateVoiceStatus',
          metadata: { userId: currentUser.id, status, error },
        });
      }
    },
    [currentUser?.id]
  );

  return {
    updateVoiceStatus,
  };
}
