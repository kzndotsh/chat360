import { useEffect, useRef } from 'react';

import { useParty } from '@/lib/contexts/partyContext';
import { useToast } from '@/lib/hooks/use-toast';

export function usePartyNotifications() {
  const { toast } = useToast();
  const { members, currentMember } = useParty();
  const prevMembersRef = useRef<typeof members>([]);

  useEffect(() => {
    // Get the set of member IDs from previous state
    const prevMemberIds = new Set(prevMembersRef.current.map(m => m.id));

    // Find genuinely new members (not in previous state)
    const newMembers = members.filter(member =>
      // Member must be active
      member.is_active &&
      member.status === 'active' &&
      // Must not be in previous state
      !prevMemberIds.has(member.id) &&
      // Must not be the current user
      member.id !== currentMember?.id
    );

    // Show notifications for new members
    newMembers.forEach(member => {
      toast({
        description: `${member.name} has joined the party`,
        duration: 2000,
      });
    });

    // Update previous members reference
    prevMembersRef.current = members;
  }, [members, toast, currentMember]);
}
