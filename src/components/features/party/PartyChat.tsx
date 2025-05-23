'use client';

import type { VoiceStatus, MemberStatus } from '@/lib/types/party/member';

import React, { memo, useMemo } from 'react';

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

  const memoizedMembers = useMemo(() => members, [members]);

  return (
    <div className="flex flex-col">
      <MemberList
        currentUserId={currentMember?.id}
        members={memoizedMembers}
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
    try {
      logger.debug('Updating profile', {
        component: 'PartyChat',
        action: 'handleEditProfile',
        metadata: { name, avatar, game },
      });

      await updateProfile({ name, avatar, game });

      logger.debug('Profile update completed', {
        component: 'PartyChat',
        action: 'handleEditProfile',
      });
    } catch (error) {
      logger.error('Failed to update profile', {
        component: 'PartyChat',
        action: 'handleEditProfile',
        metadata: { error },
      });
      throw error; // Re-throw to let modal handle error display
    }
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto">
      <div className="flex min-h-[100dvh] w-full items-center justify-center p-0 lg:p-12">
        <div className="w-full max-w-full px-4 sm:px-6 lg:w-auto">
          <div className="flex flex-col">
            <TopBar />
            <Card className="flex h-[calc(100dvh-180px)] w-full flex-col rounded-none border-0 shadow-none bg-[#dce4e7] lg:h-[600px] lg:min-w-[900px]">
              <PartyHeader membersCount={members.length} />
              <div className="flex-1 overflow-y-auto bg-[#dce4e7] bubble-scrollbar">
                <PartyContent />
              </div>
            </Card>
            <div className="mt-0">
              <PartyActions />
            </div>
          </div>
        </div>
        <ModalManager
          onEditProfileAction={handleEditProfile}
          onJoinPartyAction={handleJoinParty}
        />
      </div>
    </div>
  );
}

export default PartyChat;
