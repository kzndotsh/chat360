'use client';

import type { VoiceStatus } from '@/lib/types/party/member';

import React, { memo } from 'react';

import Image from 'next/image';

import { Card } from '@/components/ui/card';

import { ModalManager } from '@/components/features/modals/ModalManager';

import { AVATARS } from '@/lib/constants';
import { useParty } from '@/lib/contexts/partyContext';
import { usePartyNotifications } from '@/lib/hooks/usePartyNotifications';
import { logger } from '@/lib/logger';

import Clock from './Clock';
import { MemberList } from './MemberList';
import { PartyControls } from './PartyControls';
import { PartyHeader } from './PartyHeader';

const TopBar = () => {
  const { currentMember } = useParty();

  return (
    <div className="relative mb-3 flex h-[65px] w-full items-end justify-between px-4 md:px-8">
      <div className="flex items-center">
        <span className="text-xl md:text-2xl font-medium leading-none text-white [text-shadow:_0_1px_1px_rgba(0,0,0,0.15)_inset]">
          $360
        </span>
      </div>
      <div className="absolute left-1/2 top-0 -translate-x-1/2">
        <Image
          alt={currentMember?.name ?? 'Default Avatar'}
          className="h-[50px] w-[50px] md:h-[65px] md:w-[65px] object-cover"
          height={65}
          src={currentMember?.avatar ?? AVATARS[0]!}
          width={65}
        />
      </div>
      <div className="flex items-center">
        <Clock />
      </div>
    </div>
  );
};

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
    <div className="flex min-h-screen w-full items-center justify-center p-8 md:p-12">
      <div className="w-full max-w-full md:w-auto">
        <div className="flex flex-col">
          <TopBar />
          <Card className="flex h-[600px] w-full min-w-[300px] md:min-w-[900px] flex-col rounded-none border-0 bg-[#dce4e7]">
            <PartyHeader membersCount={members.length} />
            <div className="overflow-y-auto bg-[#dce4e7]">
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
