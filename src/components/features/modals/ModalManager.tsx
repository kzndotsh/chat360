'use client';

import React from 'react';
import { useModalStore } from '@/lib/stores/useModalStore';
import { ProfileModal } from './ProfileModal';
import { logger } from '@/lib/utils/logger';

type FormData = {
  name: string;
  avatar: string;
  game: string;
};

interface ModalManagerProps {
  onJoinParty: (username: string, avatar: string, game: string) => Promise<void>;
  onEditProfile: (username: string, avatar: string, game: string) => Promise<void>;
}

export function ModalManager({ onJoinParty, onEditProfile }: ModalManagerProps) {
  const { isOpen, type, data, hideModal } = useModalStore();

  if (!isOpen || !type) return null;

  const handleSubmit = async (formData: FormData) => {
    try {
      if (type === 'join') {
        await onJoinParty(formData.name, formData.avatar, formData.game);
      } else {
        await onEditProfile(formData.name, formData.avatar, formData.game);
      }
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
      onSubmit={handleSubmit}
      onClose={hideModal}
      initialData={data || undefined}
    />
  );
}
