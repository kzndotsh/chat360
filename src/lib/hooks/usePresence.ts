'use client';

import type { PartyMember, VoiceMemberState } from '@/lib/types/party/member';
import type { PresenceServiceState } from '@/lib/types/party/service';

import { useCallback, useEffect, useState } from 'react';

import { PresenceService } from '@/lib/services/presenceService';
import { usePartyStore } from '@/lib/stores/partyStore';

type PresenceHookState = {
  currentMember: (PartyMember & Partial<VoiceMemberState>) | null;
  error: Error | null;
  members: (PartyMember & Partial<VoiceMemberState>)[];
  status: PresenceServiceState['status'];
};

export function usePresence(): PresenceHookState & {
  initialize: (member: PartyMember & Partial<VoiceMemberState>) => Promise<void>;
  updatePresence: (updates: Partial<PartyMember & VoiceMemberState>) => Promise<void>;
  cleanup: () => void;
} {
  const [status, setStatus] = useState<PresenceServiceState['status']>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [members, setMembers] = useState<(PartyMember & Partial<VoiceMemberState>)[]>([]);
  const [currentMember, setCurrentMember] = useState<
    (PartyMember & Partial<VoiceMemberState>) | null
  >(null);

  useEffect(() => {
    const presenceService = PresenceService.getInstance();

    // Update initial state
    setStatus(presenceService.getState().status);
    setMembers(presenceService.getMembers());
    setCurrentMember(presenceService.getCurrentMember());

    // Subscribe to member updates
    const handleMemberUpdate = (newMembers: PartyMember[]) => {
      setMembers(newMembers);
      setStatus(presenceService.getState().status);
      setCurrentMember(presenceService.getCurrentMember());
    };

    presenceService.addListener(handleMemberUpdate);

    return () => {
      presenceService.removeListener(handleMemberUpdate);
    };
  }, []);

  const initialize = useCallback(async (member: PartyMember & Partial<VoiceMemberState>) => {
    const presenceService = PresenceService.getInstance();

    try {
      setStatus('connecting');
      await presenceService.initialize(member);
      setStatus('connected');
      setMembers(presenceService.getMembers());
      setCurrentMember(presenceService.getCurrentMember());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setStatus('error');
    }
  }, []);

  const updatePresence = useCallback(async (updates: Partial<PartyMember & VoiceMemberState>) => {
    const presenceService = PresenceService.getInstance();
    try {
      await presenceService.updatePresence(updates);
      // Update state after presence update
      setMembers(presenceService.getMembers());
      setCurrentMember(presenceService.getCurrentMember());
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const cleanup = useCallback(async () => {
    const presenceService = PresenceService.getInstance();
    const partyStore = usePartyStore.getState();

    try {
      await presenceService.cleanup();
      // Use the store's subscribeAsVisitor instead of direct service call
      await partyStore.subscribeAsVisitor();
      // Only clear current member and status, keep members list
      setCurrentMember(null);
      setStatus('idle');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      // Still reset state even if there was an error
      setCurrentMember(null);
      setStatus('idle');
    }
  }, []);

  return {
    currentMember,
    error,
    members,
    status,
    initialize,
    cleanup,
    updatePresence,
  };
}
