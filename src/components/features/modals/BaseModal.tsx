import React, { useCallback } from 'react';
import { ModalPortal } from './ModalPortal';
import { logger } from '@/lib/utils/logger';

interface BaseModalProps {
  children: React.ReactNode;
  onClose: () => void;
  isSubmitting?: boolean;
}

export function BaseModal({ children, onClose, isSubmitting = false }: BaseModalProps) {
  const handleClose = useCallback(() => {
    if (isSubmitting) {
      logger.info('Close prevented - form is submitting', { 
        component: 'BaseModal', 
        action: 'handleClose' 
      });
      return;
    }
    logger.info('Modal closed', { 
      component: 'BaseModal', 
      action: 'handleClose' 
    });
    onClose();
  }, [isSubmitting, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        handleClose();
      }
    },
    [handleClose]
  );

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={handleBackdropClick}
      >
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">{children}</div>
      </div>
    </ModalPortal>
  );
}
