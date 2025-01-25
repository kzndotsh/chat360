'use client';

import type { VoiceStatus, MemberStatus } from '@/lib/types/party/member';

import React, { memo } from 'react';

import { Card } from '@/components/ui/card';

import { ModalManager } from '@/components/features/modals/ModalManager';

import { useParty } from '@/lib/contexts/partyContext';
import { usePartyNotifications } from '@/lib/hooks/usePartyNotifications';
import { logger } from '@/lib/logger';

import { MemberList } from './MemberList';
import { PartyControls } from './PartyControls';
import { PartyHeader } from './PartyHeader';
import { TopBar } from './TopBar';

const PartyContent = memo(() => {
  const { members, currentMember, volumeLevels } = useParty();

  return (
    <div className="flex flex-col">
      <MemberList
        currentUserId={currentMember?.id}
        members={members}
        volumeLevels={volumeLevels}
      />
    </div>
  );
});
PartyContent.displayName = 'PartyContent';

const PartyActions = memo(() => {
  const { currentMember, isMuted, toggleMute, micPermissionDenied, partyState, leave } = useParty();

  return (
    <PartyControls
      onLeaveAction={leave}
      onRequestMicrophonePermission={() => {}}
      onToggleMute={toggleMute}

      currentUser={currentMember}
      isLeaving={false}
      isMuted={isMuted}
      micPermissionDenied={micPermissionDenied}
      partyState={partyState}
    />
  );
});
PartyActions.displayName = 'PartyActions';

function PartyChat() {
  usePartyNotifications();
  const { members, join, updateProfile } = useParty();

  const handleJoinParty = async (name: string, avatar: string, game: string) => {
    logger.debug('Creating member for join', {
      component: 'PartyChat',
      action: 'handleJoinParty',
      metadata: { name, avatar, game },
    });

    const member = {
      id: crypto.randomUUID(),
      name,
      avatar,
      game,
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      is_active: true,
      status: 'active' as MemberStatus,
      voice_status: 'silent' as VoiceStatus,
      volumeLevel: 0,
      muted: false,
      is_deafened: false,
    };

    logger.debug('Calling join with member', {
      component: 'PartyChat',
      action: 'handleJoinParty',
      metadata: { member },
    });

    await join(member);

    logger.debug('Join completed', {
      component: 'PartyChat',
      action: 'handleJoinParty',
    });
  };

  const handleEditProfile = async (name: string, avatar: string, game: string) => {
    await updateProfile({ name, avatar, game });
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-0 lg:p-12">
      <div className="w-full max-w-full px-4 sm:px-6 lg:w-auto">
        <div className="flex flex-col">
          <TopBar />
          <Card className="flex h-[calc(100vh-180px)] w-full flex-col rounded-none border-0 bg-[#dce4e7] lg:h-[600px] lg:min-w-[900px]">
            <PartyHeader membersCount={members.length} />
            <div className="flex-1 overflow-y-auto bg-[#dce4e7]">
              <PartyContent />
            </div>
          </Card>
          <PartyActions />
        </div>
      </div>
      <ModalManager
        onEditProfileAction={handleEditProfile}
        onJoinPartyAction={handleJoinParty}
      />
    </div>
  );
}

export default PartyChat;
