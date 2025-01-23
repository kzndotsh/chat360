'use client';

import React from 'react';

import { logger } from '@/lib/logger';
import { useModalStore } from '@/lib/stores/useModalStore';

import { ProfileModal } from './ProfileModal';

type FormData = {
  name: string;
  avatar: string;
  game: string;
};

interface ModalManagerProps {
  onEditProfileAction: (username: string, avatar: string, game: string) => Promise<void>;
  onJoinPartyAction: (username: string, avatar: string, game: string) => Promise<void>;
}

export function ModalManager({ onJoinPartyAction, onEditProfileAction }: ModalManagerProps) {
  const { isOpen, type, data, hideModal } = useModalStore();

  if (!isOpen || !type) return null;

  const handleSubmitAction = async (formData: FormData) => {
    try {
      logger.debug('Handling modal submission', {
        component: 'ModalManager',
        action: 'handleSubmit',
        metadata: { type, formData },
      });

      if (type === 'join') {
        await onJoinPartyAction(formData.name, formData.avatar, formData.game);
      } else {
        await onEditProfileAction(formData.name, formData.avatar, formData.game);
      }

      logger.debug('Modal submission successful', {
        component: 'ModalManager',
        action: 'handleSubmit',
        metadata: { type },
      });

      hideModal();
    } catch (error) {
      logger.error('Failed to submit profile', {
        component: 'ModalManager',
        action: type === 'join' ? 'joinParty' : 'editProfile',
        metadata: { error },
      });
      throw error; // Let ProfileModal handle the error display
    }
  };

  return (
    <ProfileModal
      onCloseAction={hideModal}
      onSubmitAction={handleSubmitAction}

      initialData={data || undefined}
    />
  );
}
