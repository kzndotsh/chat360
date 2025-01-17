'use client';

import { useCallback, useRef, useEffect } from 'react';
import { VoiceStatusIcon } from '@/components/ui/VoiceStatusIcon';
import { useVoiceChat } from '@/lib/hooks/useVoiceChat';
import { PartyMember } from '@/lib/types/party';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/utils/logger';

interface MemberVoiceStatusProps {
  member: PartyMember;
  isCurrentUser?: boolean;
}

export function MemberVoiceStatus({ member, isCurrentUser }: MemberVoiceStatusProps) {
  const { toggleDeafenUser, deafenedUsers } = useVoiceChat();
  const isDeafened = deafenedUsers.includes(member.id);
  const loggerRef = useRef(logger);

  const handleClick = useCallback(() => {
    if (!isCurrentUser) {
      loggerRef.current.info('Toggling user deafen status', {
        component: 'MemberVoiceStatus',
        action: 'toggleDeafen',
        metadata: {
          memberId: member.id,
          memberName: member.name,
          currentStatus: isDeafened ? 'deafened' : 'active',
          newStatus: isDeafened ? 'active' : 'deafened',
        },
      });
      toggleDeafenUser(member.id);
    } else {
      loggerRef.current.debug('Attempted to toggle deafen on current user', {
        component: 'MemberVoiceStatus',
        action: 'toggleDeafen',
        metadata: {
          memberId: member.id,
          memberName: member.name,
          isCurrentUser,
        },
      });
    }
  }, [isCurrentUser, member.id, member.name, toggleDeafenUser, isDeafened]);

  // Log initial render and status changes
  useEffect(() => {
    loggerRef.current.debug('Member voice status updated', {
      component: 'MemberVoiceStatus',
      action: 'statusUpdate',
      metadata: {
        memberId: member.id,
        memberName: member.name,
        voice_status: member.voice_status,
        isDeafened,
        isCurrentUser,
      },
    });
  }, [member.id, member.name, member.voice_status, isDeafened, isCurrentUser]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={isCurrentUser}
      className="relative"
    >
      <VoiceStatusIcon
        status={isDeafened ? 'deafened' : member.voice_status}
        size="sm"
      />
    </Button>
  );
}
