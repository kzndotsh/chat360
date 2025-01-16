import React, { createContext, useContext, useState, useRef } from 'react';
import type { PartyMember } from '@/lib/types/party';
import { logger } from '@/lib/utils/logger';

interface PresenceContextType {
  members: PartyMember[];
  isInitializing: boolean;
  initialize: (member: PartyMember) => Promise<void>;
  cleanup: () => Promise<void>;
}

const PresenceContext = createContext<PresenceContextType>({
  members: [],
  isInitializing: false,
  initialize: async () => {},
  cleanup: async () => {},
});

export const usePresence = () => useContext(PresenceContext);

export const PresenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const mountedRef = useRef(true);

  const initialize = async (member: PartyMember) => {
    logger.info('Initializing presence context', {
      component: 'PresenceContext',
      action: 'initialize',
      metadata: { member },
    });

    setIsInitializing(true);
    // Mock initialization
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (!mountedRef.current) return;

    setMembers((prev) => {
      const newMembers = [...prev, member];
      logger.debug('Updated members list', {
        component: 'PresenceContext',
        action: 'initialize',
        metadata: {
          previousCount: prev.length,
          newCount: newMembers.length,
        },
      });
      return newMembers;
    });
    setIsInitializing(false);

    logger.info('Presence context initialized', {
      component: 'PresenceContext',
      action: 'initialize',
      metadata: {
        memberId: member.id,
        totalMembers: members.length + 1,
      },
    });
  };

  const cleanup = async () => {
    logger.info('Cleaning up presence context', {
      component: 'PresenceContext',
      action: 'cleanup',
      metadata: { memberCount: members.length },
    });

    // Mock cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (!mountedRef.current) return;

    setMembers([]);
    logger.debug('Cleared members list', {
      component: 'PresenceContext',
      action: 'cleanup',
    });
  };

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      mountedRef.current = false;
      logger.debug('Presence context unmounting', {
        component: 'PresenceContext',
        action: 'unmount',
      });
    };
  }, []);

  return (
    <PresenceContext.Provider value={{ members, isInitializing, initialize, cleanup }}>
      {children}
    </PresenceContext.Provider>
  );
};
