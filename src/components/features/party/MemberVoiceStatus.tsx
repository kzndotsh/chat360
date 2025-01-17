'use client';

import { useCallback, useRef, useEffect } from 'react';
import { VoiceStatusIcon } from '@/components/ui/VoiceStatusIcon';
import { useVoiceStore } from '@/lib/stores/useVoiceStore';
import { useVoiceClient } from '@/lib/hooks/useVoiceClient';
import { PartyMember } from '@/lib/types/party';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/utils/logger';

interface MemberVoiceStatusProps {
  member: PartyMember;
  isCurrentUser?: boolean;
}

export function MemberVoiceStatus({ member, isCurrentUser }: MemberVoiceStatusProps) {
  const { isConnected, isMuted, isSpeaking } = useVoiceStore();
  const { joinVoice, leaveVoice } = useVoiceClient();
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleConnect = useCallback(async () => {
    try {
      await joinVoice();
    } catch (error) {
      logger.error('Failed to connect to voice', {
        component: 'MemberVoiceStatus',
        action: 'handleConnect',
        metadata: { error },
      });
    }
  }, [joinVoice]);

  const handleDisconnect = useCallback(async () => {
    try {
      await leaveVoice();
    } catch (error) {
      logger.error('Failed to disconnect from voice', {
        component: 'MemberVoiceStatus',
        action: 'handleDisconnect',
        metadata: { error },
      });
    }
  }, [leaveVoice]);

  if (!isCurrentUser) {
    return (
      <div className="flex items-center gap-2">
        <VoiceStatusIcon status={member.voice_status} />
        <span className="text-sm text-muted-foreground">{member.name}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <VoiceStatusIcon status={isConnected ? (isSpeaking ? 'speaking' : (isMuted ? 'muted' : 'silent')) : 'deafened'} />
      <span className="text-sm text-muted-foreground">{member.name}</span>
      {isConnected ? (
        <Button variant="ghost" size="sm" onClick={handleDisconnect}>
          Disconnect
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={handleConnect}>
          Connect
        </Button>
      )}
    </div>
  );
}
