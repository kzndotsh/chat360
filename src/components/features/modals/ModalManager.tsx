import React, { useCallback, useRef } from 'react';
import { NewUserModal } from './NewUserModal';
import { EditProfileModal } from './EditProfileModal';
import { useModalStore } from '@/lib/stores/useModalStore';
import { useFormStore } from '@/lib/stores/useFormStore';
import { ModalPortal } from './ModalPortal';
import * as Sentry from '@sentry/react';
import { logger } from '@/lib/utils/logger';

interface ModalManagerProps {
  onJoinParty: (username: string, avatar: string, game: string) => Promise<void>;
  onEditProfile: (username: string, avatar: string, game: string) => Promise<void>;
}

export const ModalManager = React.memo(function ModalManager({
  onJoinParty,
  onEditProfile,
}: ModalManagerProps) {
  const { activeModal, modalData, hideModal } = useModalStore();
  const { isSubmitting, setSubmitting, resetForm, saveLastUsedData } = useFormStore();
  const loggerRef = useRef(logger);

  const handleJoinParty = useCallback(
    async (username: string, avatar: string, game: string) => {
      const startTime = Date.now();
      
      if (isSubmitting) {
        loggerRef.current.debug('Join party submission blocked - already submitting', {
          component: 'ModalManager',
          action: 'joinParty',
          metadata: { 
            username, 
            isSubmitting,
            timestamp: startTime,
            state: 'blocked',
          },
        });
        return;
      }

      loggerRef.current.info('Attempting to join party from modal', {
        component: 'ModalManager',
        action: 'joinParty',
        metadata: { 
          username, 
          game,
          timestamp: startTime,
          state: 'starting',
        },
      });

      setSubmitting(true);
      try {
        const joinStartTime = Date.now();
        saveLastUsedData({ name: username, avatar, game });
        await onJoinParty(username, avatar, game);
        const joinEndTime = Date.now();
        
        resetForm();
        hideModal();
        
        loggerRef.current.info('Successfully joined party from modal', {
          component: 'ModalManager',
          action: 'joinParty',
          metadata: { 
            username, 
            game,
            timestamp: Date.now(),
            state: 'completed',
            timing: {
              totalDuration: Date.now() - startTime,
              joinDuration: joinEndTime - joinStartTime,
            },
          },
        });
      } catch (error) {
        const failureTime = Date.now();
        loggerRef.current.error('Failed to join party from modal', {
          component: 'ModalManager',
          action: 'joinParty',
          metadata: {
            error: error instanceof Error ? error : new Error(String(error)),
            username,
            game,
            timestamp: failureTime,
            state: 'failed',
            timing: {
              totalDuration: failureTime - startTime,
            },
          },
        });
        Sentry.captureException(error, {
          extra: { 
            username, 
            avatar, 
            game,
            timing: {
              totalDuration: failureTime - startTime,
            },
          },
        });
        throw error;
      } finally {
        setSubmitting(false);
      }
    },
    [onJoinParty, hideModal, isSubmitting, setSubmitting, resetForm, saveLastUsedData]
  );

  const handleEditProfile = useCallback(
    async (username: string, avatar: string, game: string) => {
      if (isSubmitting) {
        loggerRef.current.debug('Edit profile submission blocked - already submitting', {
          component: 'ModalManager',
          action: 'editProfile',
          metadata: { username, isSubmitting },
        });
        return;
      }

      loggerRef.current.info('Attempting to edit profile from modal', {
        component: 'ModalManager',
        action: 'editProfile',
        metadata: { username, game },
      });

      setSubmitting(true);
      try {
        await onEditProfile(username, avatar, game);
        resetForm();
        hideModal();
        loggerRef.current.info('Successfully edited profile from modal', {
          component: 'ModalManager',
          action: 'editProfile',
          metadata: { username, game },
        });
      } catch (error) {
        loggerRef.current.error('Failed to edit profile from modal', {
          component: 'ModalManager',
          action: 'editProfile',
          metadata: {
            error: error instanceof Error ? error : new Error(String(error)),
            username,
            game,
          },
        });
        Sentry.captureException(error, {
          extra: { username, avatar, game },
        });
        throw error;
      } finally {
        setSubmitting(false);
      }
    },
    [onEditProfile, hideModal, isSubmitting, setSubmitting, resetForm]
  );

  const handleCancel = useCallback(() => {
    loggerRef.current.info('Modal cancelled', {
      component: 'ModalManager',
      action: 'cancelModal',
      metadata: { activeModal, modalData },
    });
    hideModal();
  }, [hideModal, activeModal, modalData]);

  // Log modal state changes
  React.useEffect(() => {
    if (activeModal) {
      loggerRef.current.debug('Modal state changed', {
        component: 'ModalManager',
        action: 'modalStateChange',
        metadata: {
          activeModal,
          hasModalData: !!modalData,
          isSubmitting,
          timestamp: Date.now(),
          modalStack: {
            isJoinModal: activeModal === 'join',
            isEditModal: activeModal === 'edit',
            hasRequiredModalData: activeModal === 'edit' ? !!modalData : true,
          },
          formState: {
            isSubmitting,
            hasModalData: !!modalData,
          }
        },
      });
    } else {
      loggerRef.current.debug('Modal closed', {
        component: 'ModalManager',
        action: 'modalClose',
        metadata: {
          previousModal: activeModal,
          wasSubmitting: isSubmitting,
          timestamp: Date.now(),
        },
      });
    }
  }, [activeModal, modalData, isSubmitting]);

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
      ) : activeModal === 'edit' ? (
        <EditProfileModal
          initialData={{
            name: modalData?.name || '',
            avatar: modalData?.avatar || '',
            game: modalData?.game || '',
          }}
          onSubmit={handleEditProfile}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
        />
      ) : null}
    </ModalPortal>
  );
});
