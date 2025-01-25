import type { PartyMember } from '@/lib/types/party/member';
import type { PresenceSlice } from '@/lib/types/party/middleware';
import type { Store } from '@/lib/types/party/store';

import { StateCreator } from 'zustand';

import { logger } from '@/lib/logger';
import { PresenceService } from '@/lib/services/presenceService';

// Get presence service instance
const presenceService = PresenceService.getInstance();

export const createPresenceMiddleware = (): StateCreator<Store, [], [], PresenceSlice> => (set) => {
  // Store presence listener for cleanup
  let presenceListener: ((members: PartyMember[]) => void) | null = null;

  // Set up presence listener to keep state in sync
  const setupPresenceListener = () => {
    // Remove existing listener first to prevent duplicates
    if (presenceListener) {
      presenceService.removeListener(presenceListener);
      presenceListener = null;
    }

    // Create new listener
    presenceListener = (members: PartyMember[]) => {
      // Update state with new member list
      set((state: Store) => ({
        ...state,
        presence: {
          ...state.presence,
          members: new Map(members.map(m => [m.id, m])),
        },
      }));

      logger.debug('Presence listener updated state', {
        action: 'presenceListener',
        metadata: { memberCount: members.length },
      });
    };

    // Register new listener
    presenceService.addListener(presenceListener);
  };

  return {
    // Initial presence state
    presence: {
      members: new Map<string, PartyMember>(),
      currentMember: null,
      status: 'idle',
      error: null,
    },

    initializePresence: async (member: PartyMember) => {
      try {
        set((state: Store) => ({
          ...state,
          presence: {
            ...state.presence,
            status: 'connecting',
            error: null,
          },
        }));

        // Track member and wait for result
        const result = await presenceService.trackMember(member);

        if ('error' in result) {
          throw result.error;
        }

        // Update state with tracked member
        set((state: Store) => ({
          ...state,
          presence: {
            ...state.presence,
            status: 'connected',
            currentMember: member,
            members: new Map([[member.id, member]]),
          },
        }));

        // Set up presence listener
        setupPresenceListener();

        logger.debug('Initialized presence', {
          action: 'initializePresence',
          metadata: { result },
        });
      } catch (error) {
        set((state: Store) => ({
          ...state,
          presence: {
            ...state.presence,
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          },
        }));
        throw error;
      }
    },

    subscribeAsVisitor: async () => {
      try {
        // Subscribe to presence updates first
        await PresenceService.subscribeAsVisitor();

        // Set up presence listener after successful subscription
        setupPresenceListener();

        logger.debug('Subscribed as visitor', {
          action: 'subscribeAsVisitor',
        });
      } catch (error) {
        logger.error('Failed to subscribe as visitor', {
          action: 'subscribeAsVisitor',
          metadata: { error },
        });
        throw error;
      }
    },

    cleanupPresence: async () => {
      try {
        // Remove presence listener first to prevent race conditions
        if (presenceListener) {
          presenceService.removeListener(presenceListener);
          presenceListener = null;
        }

        // Cleanup presence service before state reset
        await presenceService.cleanup();

        // Reset state after cleanup to ensure clean slate
        set((state: Store) => ({
          ...state,
          presence: {
            members: new Map(),
            currentMember: null,
            status: 'idle',
            error: null,
          },
        }));

        logger.debug('Cleaned up presence', {
          action: 'cleanupPresence',
        });
      } catch (error) {
        set((state: Store) => ({
          ...state,
          presence: {
            ...state.presence,
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          },
        }));
        throw error;
      }
    },

    updatePresence: async (updates: Partial<PartyMember>) => {
      try {
        await presenceService.updatePresence(updates);

        // Update local state immediately for responsive UI
        set((state: Store) => {
          const currentMember = state.presence.currentMember;
          if (!currentMember) return state;

          const updatedMember = {
            ...currentMember,
            ...updates,
            last_seen: new Date().toISOString(),
          };

          return {
            ...state,
            presence: {
              ...state.presence,
              currentMember: updatedMember,
              members: new Map(state.presence.members).set(updatedMember.id, updatedMember),
            },
          };
        });

        logger.debug('Updated presence', {
          action: 'updatePresence',
          metadata: { updates },
        });
      } catch (error) {
        set((state: Store) => ({
          ...state,
          presence: {
            ...state.presence,
            error: error instanceof Error ? error : new Error(String(error)),
          },
        }));
        throw error;
      }
    },
  };
};
