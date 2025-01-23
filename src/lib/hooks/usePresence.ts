'use client';

import type { PartyMember } from '../types/party/member';

import { useCallback, useEffect, useState } from 'react';

import { PresenceService } from '../services/presenceService';

export function usePresence() {
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [currentMember, setCurrentMember] = useState<PartyMember | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [error, setError] = useState<Error | null>(null);

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

  const initialize = useCallback(async (member: PartyMember) => {
    const presenceService = PresenceService.getInstance();
    try {
      // Add required fields for the service's PartyMember type
      const fullMember: PartyMember = {
        id: member.id,
        name: member.name,
        avatar: member.avatar,
        game: member.game,
        created_at: member.created_at,
        last_seen: new Date().toISOString(),
        is_active: true,
        voice_status: member.voice_status || 'silent',
        muted: member.muted || false,
        is_deafened: false,
        agora_uid: member.agora_uid,
        volumeLevel: 0,
      };

      await presenceService.initialize(fullMember);
      // Update state after initialization
      setMembers(presenceService.getMembers());
      setCurrentMember(presenceService.getCurrentMember());
      setStatus(presenceService.getState().status);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const updatePresence = useCallback(async (updates: Partial<PartyMember>) => {
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
    try {
      await presenceService.cleanup();
      // Reset state after cleanup
      setMembers([]);
      setCurrentMember(null);
      setStatus('idle');
      setError(null); // Also reset any error state
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      // Still reset state even if there was an error
      setMembers([]);
      setCurrentMember(null);
      setStatus('idle');
    }
  }, []);

  return {
    status,
    members,
    currentMember,
    error,
    initialize,
    cleanup,
    updatePresence,
  };
}
