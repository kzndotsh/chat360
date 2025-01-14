import React, { useCallback, useEffect } from 'react';
import { useModalStore } from '@/lib/stores/useModalStore';
import { useFormStore } from '@/lib/stores/useFormStore';
import { NewUserModal } from './NewUserModal';
import { EditProfileModal } from './EditProfileModal';
import { ModalPortal } from './ModalPortal';
import { LoadingSpinner } from './LoadingSpinner';
import { logWithContext } from '@/lib/logger';
import * as Sentry from '@sentry/react';

interface ModalManagerProps {
  onJoinParty: (
    username: string,
    avatar: string,
    status: string
  ) => Promise<void>;
  onEditProfile: (
    username: string,
    avatar: string,
    status: string
  ) => Promise<void>;
}

export const ModalManager = React.memo(function ModalManager({
  onJoinParty,
  onEditProfile,
}: ModalManagerProps) {
  const { activeModal, modalData, hideModal } = useModalStore();
  const {
    isSubmitting,
    setSubmitting,
    resetForm,
    saveLastUsedData,
    initializeWithLastUsed,
  } = useFormStore();

  useEffect(() => {
    if (activeModal === 'join' || activeModal === 'edit') {
      initializeWithLastUsed();
    }
  }, [activeModal, initializeWithLastUsed]);

  const handleJoinParty = useCallback(
    async (username: string, avatar: string, status: string) => {
      const context = {
        component: 'ModalManager',
        action: 'handleJoinParty',
        username,
        avatar,
        status,
        isSubmitting,
      };

      logWithContext(
        'ModalManager',
        'handleJoinParty',
        `Starting join party for ${username}`
      );

      if (isSubmitting) {
        logWithContext(
          'ModalManager',
          'handleJoinParty',
          'Submission already in progress, skipping'
        );
        return;
      }

      setSubmitting(true);

      try {
        logWithContext(
          'ModalManager',
          'handleJoinParty',
          'Calling onJoinParty'
        );
        await onJoinParty(username, avatar, status);
        logWithContext(
          'ModalManager',
          'handleJoinParty',
          'Join party successful'
        );
        saveLastUsedData({ name: username, avatar, status });
        resetForm();
        hideModal();
      } catch (error) {
        logWithContext(
          'ModalManager',
          'handleJoinParty',
          `Join party failed: ${error}`
        );
        Sentry.captureException(error, {
          extra: context,
        });
        console.error('Failed to join party:', error);
        throw error; // Re-throw to prevent form from resetting
      } finally {
        setSubmitting(false);
      }
    },
    [
      onJoinParty,
      hideModal,
      isSubmitting,
      setSubmitting,
      resetForm,
      saveLastUsedData,
    ]
  );

  const handleEditProfile = useCallback(
    async (username: string, avatar: string, status: string) => {
      const context = {
        component: 'ModalManager',
        action: 'handleEditProfile',
        username,
        avatar,
        status,
        isSubmitting,
      };

      logWithContext(
        'ModalManager',
        'handleEditProfile',
        `Starting edit profile for ${username}`
      );

      if (isSubmitting) {
        logWithContext(
          'ModalManager',
          'handleEditProfile',
          'Submission already in progress, skipping'
        );
        return;
      }

      setSubmitting(true);

      try {
        logWithContext(
          'ModalManager',
          'handleEditProfile',
          'Calling onEditProfile'
        );
        await onEditProfile(username, avatar, status);
        logWithContext(
          'ModalManager',
          'handleEditProfile',
          'Edit profile successful'
        );
        saveLastUsedData({ name: username, avatar, status });
        resetForm();
        hideModal();
      } catch (error) {
        logWithContext(
          'ModalManager',
          'handleEditProfile',
          `Edit profile failed: ${error}`
        );
        Sentry.captureException(error, {
          extra: context,
        });
        console.error('Failed to edit profile:', error);
        throw error; // Re-throw to prevent form from resetting
      } finally {
        setSubmitting(false);
      }
    },
    [
      onEditProfile,
      hideModal,
      isSubmitting,
      setSubmitting,
      resetForm,
      saveLastUsedData,
    ]
  );

  const handleCancel = useCallback(() => {
    logWithContext('ModalManager', 'handleCancel', 'Cancelling modal');
    try {
      resetForm();
      hideModal();
      logWithContext(
        'ModalManager',
        'handleCancel',
        'Modal cancelled successfully'
      );
    } catch (error) {
      logWithContext(
        'ModalManager',
        'handleCancel',
        `Modal cancel failed: ${error}`
      );
      Sentry.captureException(error, {
        extra: {
          component: 'ModalManager',
          action: 'handleCancel',
          activeModal,
        },
      });
      console.error('Failed to cancel modal:', error);
    }
  }, [resetForm, hideModal, activeModal]);

  if (!activeModal) return null;

  const modals = {
    join: (
      <ModalPortal>
        <NewUserModal
          key={`join-modal-${Date.now()}`}
          onJoin={handleJoinParty}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
        />
      </ModalPortal>
    ),
    edit: modalData ? (
      <ModalPortal>
        <EditProfileModal
          key={`edit-modal-${Date.now()}`}
          initialData={{
            name: modalData.name || '',
            avatar: modalData.avatar || '',
            status: modalData.status || '',
          }}
          onSubmit={handleEditProfile}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
        />
      </ModalPortal>
    ) : null,
  };

  return modals[activeModal] || null;
});
