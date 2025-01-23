import type { PartyMember } from '@/lib/types/party/member';
import type { PresenceSlice } from '@/lib/types/party/middleware';
import type { Store } from '@/lib/types/party/store';

import { StateCreator } from 'zustand';

import { logger } from '@/lib/logger';
import { PresenceService } from '@/lib/services/presenceService';

// Get presence service instance
const presenceService = PresenceService.getInstance();

export const createPresenceMiddleware =
  (): StateCreator<Store, [], [], PresenceSlice> => (set) => {
    // Store presence listener for cleanup
    let presenceListener: ((members: PartyMember[]) => void) | null = null;

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

          // Clean up any existing listener
          if (presenceListener) {
            presenceService.removeListener(presenceListener);
          }

          // Set up presence listener to keep state in sync
          presenceListener = (members: PartyMember[]) => {
            set((state: Store) => {
              const currentMember = state.presence.currentMember;
              if (!currentMember) return state;

              // Create new members map
              const membersMap = new Map(members.map(m => [m.id, m]));

              // Ensure current member is preserved
              if (!membersMap.has(currentMember.id)) {
                membersMap.set(currentMember.id, currentMember);
              }

              return {
                ...state,
                presence: {
                  ...state.presence,
                  members: membersMap,
                },
              };
            });
          };

          presenceService.addListener(presenceListener);

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

      cleanupPresence: async () => {
        try {
          // Remove presence listener first
          if (presenceListener) {
            presenceService.removeListener(presenceListener);
            presenceListener = null;
          }

          await presenceService.cleanup();

          set((state: Store) => ({
            ...state,
            presence: {
              ...state.presence,
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
