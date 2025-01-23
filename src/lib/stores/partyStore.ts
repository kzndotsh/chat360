import type { Store } from '@/lib/types/party/store';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { PresenceService } from '@/lib/services/presenceService';

import { createFormMiddleware } from '../middleware/formMiddleware';
import { createPartyMiddleware } from '../middleware/partyMiddleware';
import { createPresenceMiddleware } from '../middleware/presenceMiddleware';
import { createVoiceMiddleware } from '../middleware/voiceMiddleware';

// Get presence service instance
const presenceService = PresenceService.getInstance();

// Create store with all middlewares
export const usePartyStore = create<Store>()(
  persist(
    (...args) => ({
      // Combine all middlewares
      ...createPresenceMiddleware()(...args),
      ...createVoiceMiddleware()(...args),
      ...createPartyMiddleware(presenceService.initialize, presenceService.cleanup)(...args),
      ...createFormMiddleware()(...args),
    }),
    {
      name: 'party-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state: Store) => ({
        // Only persist necessary parts of the state
        form: {
          name: state.form.name,
          avatar: state.form.avatar,
          game: state.form.game,
        },
        party: {
          status: state.party.status,
        },
      }),
    }
  )
);
