'use client';

import React, { useCallback, useMemo } from 'react';

import { logger } from '@/lib/logger';
import { useModalStore } from '@/lib/stores/useModalStore';

import { ProfileModal } from './ProfileModal';

const MemoizedProfileModal = React.memo(ProfileModal, (prevProps, nextProps) => {
  return (
    prevProps.initialData === nextProps.initialData &&
    prevProps.onSubmitAction === nextProps.onSubmitAction &&
    prevProps.onCloseAction === nextProps.onCloseAction
  );
});

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

  const handleSubmitAction = useCallback(
    async (formData: FormData) => {
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
    },
    [onJoinPartyAction, onEditProfileAction, type, hideModal]
  );

  const memoizedInitialData = useMemo(() => data || undefined, [data]);

  const modalProps = useMemo(
    () => ({
      onCloseAction: hideModal,
      onSubmitAction: handleSubmitAction,
      initialData: memoizedInitialData,
    }),
    [hideModal, handleSubmitAction, memoizedInitialData]
  );

  if (!isOpen || !type) return null;

  return <MemoizedProfileModal {...modalProps} />;
}
