'use client';

import type { PartyMember } from '../types/party/member';
import type { PartyStatus } from '../types/party/state';

import { useCallback, useEffect, useState } from 'react';

import { logger } from '../logger';
import { usePresence } from './usePresence';

const LOG_CONTEXT = {
  context: 'usePartyState',
  file: 'usePartyState.ts',
};

export function usePartyState() {
  const [partyState, setPartyState] = useState<PartyStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  const {
    members,
    currentMember,
    status: presenceStatus,
    initialize: initializePresence,
    cleanup: cleanupPresence,
    updatePresence,
  } = usePresence();

  // Initialize state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('partyState') as PartyStatus;
    const savedMember = localStorage.getItem('party_member');

    if (savedState && savedMember && currentMember) {
      try {
        const parsedMember = JSON.parse(savedMember);
        // Only restore state if we have matching member IDs
        if (parsedMember.id === currentMember.id) {
          setPartyState(savedState);
          logger.debug('Restored party state from storage', {
            ...LOG_CONTEXT,
            action: 'restoreState',
            metadata: { savedState, currentMember },
          });
        } else {
          // Clear saved state if member IDs don't match
          localStorage.removeItem('partyState');
          localStorage.removeItem('party_member');
          setPartyState('idle');
          logger.debug('Cleared mismatched party state', {
            ...LOG_CONTEXT,
            action: 'clearState',
            metadata: {
              savedState,
              savedMemberId: parsedMember.id,
              currentMemberId: currentMember.id,
            },
          });
        }
      } catch (error) {
        // Clear invalid state
        localStorage.removeItem('partyState');
        localStorage.removeItem('party_member');
        setPartyState('idle');
        logger.debug('Cleared invalid party state', {
          ...LOG_CONTEXT,
          action: 'clearState',
          metadata: { savedState, error },
        });
      }
    } else if (savedState) {
      // Clear saved state if we don't have all required data
      localStorage.removeItem('partyState');
      setPartyState('idle');
      logger.debug('Cleared invalid party state', {
        ...LOG_CONTEXT,
        action: 'clearState',
        metadata: { savedState },
      });
    }
  }, [currentMember]);

  // Save party state to localStorage when it changes
  useEffect(() => {
    if (partyState === 'joined' && currentMember) {
      localStorage.setItem('partyState', partyState);
      logger.debug('Saved party state', {
        ...LOG_CONTEXT,
        action: 'saveState',
        metadata: { partyState, currentMember },
      });
    } else if (partyState === 'idle') {
      localStorage.removeItem('partyState');
      logger.debug('Removed party state', {
        ...LOG_CONTEXT,
        action: 'removeState',
      });
    }
  }, [partyState, currentMember]);

  const join = useCallback(
    async (member: PartyMember) => {
      logger.debug('Joining party', {
        ...LOG_CONTEXT,
        action: 'join',
        metadata: { userId: member.id, existingMembers: members.length },
      });

      try {
        setPartyState('joining');
        // Initialize presence
        await initializePresence(member);
        setPartyState('joined');
      } catch (error) {
        setPartyState('idle');
        logger.error('Failed to join party', {
          ...LOG_CONTEXT,
          action: 'join',
          metadata: { error },
        });
        throw error;
      }
    },
    [initializePresence, members.length]
  );

  const leave = useCallback(async () => {
    try {
      setPartyState('leaving');
      setError(null);

      logger.debug('Leaving party', {
        ...LOG_CONTEXT,
        action: 'leave',
      });

      // First cleanup presence service
      await cleanupPresence();

      // Then clear all local state
      localStorage.removeItem('partyState');
      setPartyState('idle');

      logger.debug('Successfully left party', {
        ...LOG_CONTEXT,
        action: 'leave',
        metadata: { newState: 'idle' },
      });
    } catch (err) {
      logger.error('Failed to leave party', {
        ...LOG_CONTEXT,
        action: 'leave',
        metadata: { error: err },
      });
      setError(err instanceof Error ? err : new Error(String(err)));
      // Still set state to idle even if there was an error
      setPartyState('idle');
    }
  }, [cleanupPresence]);

  const updateProfile = useCallback(
    async (updates: Partial<PartyMember>) => {
      try {
        logger.debug('Updating profile', {
          ...LOG_CONTEXT,
          action: 'updateProfile',
          metadata: { updates },
        });

        await updatePresence(updates);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [updatePresence]
  );

  return {
    currentUser: currentMember,
    members,
    partyState,
    error,
    presenceStatus,
    join,
    leave,
    updateProfile,
  };
}
