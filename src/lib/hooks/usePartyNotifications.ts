import { useEffect, useRef } from 'react';

import { useParty } from '@/lib/contexts/partyContext';
import { useToast } from '@/lib/hooks/use-toast';

export function usePartyNotifications() {
  const { toast } = useToast();
  const { members } = useParty();
  const prevMembersRef = useRef<typeof members>([]);

  useEffect(() => {
    // Check if a new member has joined
    if (members.length > prevMembersRef.current.length) {
      const lastMember = members[members.length - 1];

      // Show toast notification for the new member
      if (lastMember) {
        toast({
          description: `${lastMember.name} has joined the party`,
          duration: 1500, // Reduced from 2000ms to 1500ms
        });
      }
    }

    // Update previous members reference
    prevMembersRef.current = members;
  }, [members, toast]);
}
