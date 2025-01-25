import { useEffect, useRef } from 'react';

import { useParty } from '@/lib/contexts/partyContext';
import { useToast } from '@/lib/hooks/use-toast';

export function usePartyNotifications() {
  const { toast } = useToast();
  const { members, currentMember } = useParty();
  const prevMembersRef = useRef<typeof members>([]);
  const achievementShownRef = useRef<boolean>(false);

  useEffect(() => {
    // Get the set of member IDs from previous state
    const prevMemberIds = new Set(prevMembersRef.current.map(m => m.id));

    // Find genuinely new members (not in previous state)
    const newMembers = members.filter(member =>
      // Member must be active
      member.is_active &&
      member.status === 'active' &&
      // Must not be in previous state
      !prevMemberIds.has(member.id)
    );

    // Show achievement only for current user's first join
    if (currentMember &&
        newMembers.some(m => m.id === currentMember.id) &&
        !achievementShownRef.current) {
      achievementShownRef.current = true;
      // Small delay to ensure modal is closed
      setTimeout(() => {
        toast({
          description: 'Achievement Unlocked: Joined the Party!',
          duration: 2000,
        });
      }, 500);
    }

    // Update previous members reference
    prevMembersRef.current = members;
  }, [members, toast, currentMember]);
}
