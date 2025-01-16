import React, { createContext, useContext, useState } from 'react';
import type { PartyMember } from '@/lib/types/party';

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

  const initialize = async (member: PartyMember) => {
    setIsInitializing(true);
    // Mock initialization
    await new Promise((resolve) => setTimeout(resolve, 100));
    setMembers((prev) => [...prev, member]);
    setIsInitializing(false);
  };

  const cleanup = async () => {
    // Mock cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
    setMembers([]);
  };

  return (
    <PresenceContext.Provider value={{ members, isInitializing, initialize, cleanup }}>
      {children}
    </PresenceContext.Provider>
  );
};
