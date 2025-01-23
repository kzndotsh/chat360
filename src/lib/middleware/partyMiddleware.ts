import type { PartyMember } from '@/lib/types/party/member';
import type { PartySlice } from '@/lib/types/party/middleware';
import type { PartyStatus } from '@/lib/types/party/state';
import type { Store } from '@/lib/types/party/store';

import { StateCreator } from 'zustand';

export const createPartyMiddleware =
  (
    initializePresence: (member: PartyMember) => Promise<void>,
    cleanupPresence: () => Promise<void>
  ): StateCreator<Store, [], [], PartySlice> =>
  (set) => ({
    // Initial party state
    party: {
      status: 'idle',
      error: null,
    },

    // Party status actions
    setPartyStatus: (status: PartyStatus) =>
      set((state: Store) => ({
        ...state,
        party: {
          ...state.party,
          status,
          // Reset error when changing status
          error: null,
        },
      })),

    // Party error actions
    setPartyError: (error) =>
      set((state: Store) => ({
        ...state,
        party: {
          ...state.party,
          error,
          // Set status to idle on error
          status: error ? 'idle' : state.party.status,
        },
      })),

    // Join party action
    joinParty: async (member) => {
      try {
        // Set joining state first
        set((state: Store) => ({
          ...state,
          party: {
            ...state.party,
            status: 'joining',
            error: null,
          },
        }));

        // Initialize presence and wait for connection
        await initializePresence(member);

        // Set joined state after successful presence initialization
        set((state: Store) => ({
          ...state,
          party: {
            ...state.party,
            status: 'joined',
          },
        }));
      } catch (error) {
        // Reset to idle state on error
        set((state: Store) => ({
          ...state,
          party: {
            ...state.party,
            status: 'idle',
            error: error instanceof Error ? error : new Error('Failed to join party'),
          },
        }));
        throw error;
      }
    },

    // Leave party action
    leaveParty: async () => {
      try {
        // Set leaving state first
        set((state: Store) => ({
          ...state,
          party: {
            ...state.party,
            status: 'leaving',
            error: null,
          },
        }));

        // Clean up presence and wait for completion
        await cleanupPresence();

        // Reset to idle state after successful cleanup
        set((state: Store) => ({
          ...state,
          party: {
            ...state.party,
            status: 'idle',
          },
        }));
      } catch (error) {
        // Reset to idle state on error
        set((state: Store) => ({
          ...state,
          party: {
            ...state.party,
            status: 'idle',
            error: error instanceof Error ? error : new Error('Failed to leave party'),
          },
        }));
        throw error;
      }
    },
  });
