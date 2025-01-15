import React, { useCallback } from 'react';
import { NewUserModal } from './NewUserModal';
import { EditProfileModal } from './EditProfileModal';
import { useModalStore } from '@/lib/stores/useModalStore';
import { useFormStore } from '@/lib/stores/useFormStore';
import { ModalPortal } from './ModalPortal';
import * as Sentry from '@sentry/react';

interface ModalManagerProps {
  onJoinParty: (username: string, avatar: string, status: string) => Promise<void>;
  onEditProfile: (username: string, avatar: string, status: string) => Promise<void>;
}

export const ModalManager = React.memo(function ModalManager({
  onJoinParty,
  onEditProfile,
}: ModalManagerProps) {
  const { activeModal, modalData, hideModal } = useModalStore();
  const { isSubmitting, setSubmitting, resetForm, saveLastUsedData } = useFormStore();

  const handleJoinParty = useCallback(
    async (username: string, avatar: string, status: string) => {
      if (isSubmitting) return;

      setSubmitting(true);
      try {
        saveLastUsedData({ name: username, avatar, status });
        await onJoinParty(username, avatar, status);
        resetForm();
        hideModal();
      } catch (error) {
        Sentry.captureException(error, {
          extra: { username, avatar, status }
        });
        throw error;
      } finally {
        setSubmitting(false);
      }
    },
    [onJoinParty, hideModal, isSubmitting, setSubmitting, resetForm, saveLastUsedData]
  );

  const handleEditProfile = useCallback(
    async (username: string, avatar: string, status: string) => {
      if (isSubmitting) return;

      setSubmitting(true);
      try {
        await onEditProfile(username, avatar, status);
        saveLastUsedData({ name: username, avatar, status });
        resetForm();
        hideModal();
      } catch (error) {
        Sentry.captureException(error, {
          extra: { username, avatar, status }
        });
        throw error;
      } finally {
        setSubmitting(false);
      }
    },
    [onEditProfile, hideModal, isSubmitting, setSubmitting, resetForm, saveLastUsedData]
  );

  const handleCancel = useCallback(() => {
    hideModal();
  }, [hideModal]);

  if (!activeModal) {
    return null;
  }

  return (
    <ModalPortal>
      {activeModal === 'join' ? (
        <NewUserModal
          onJoin={handleJoinParty}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
        />
      ) : activeModal === 'edit' && modalData ? (
        <EditProfileModal
          initialData={{
            name: modalData.name || '',
            avatar: modalData.avatar || '',
            status: modalData.status || '',
          }}
          onSubmit={handleEditProfile}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
        />
      ) : null}
    </ModalPortal>
  );
});
