'use client';

import React, { useCallback, useRef, useEffect } from 'react';
import { ModalPortal } from './ModalPortal';
import { logger } from '@/lib/utils/logger';

interface BaseModalProps {
  children: React.ReactNode;
  onClose: () => void;
  isSubmitting?: boolean;
}

export function BaseModal({ children, onClose, isSubmitting = false }: BaseModalProps) {
  const loggerRef = useRef(logger);
  const mountedRef = useRef(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Log modal mount and unmount
  useEffect(() => {
    const logger = loggerRef.current;
    logger.debug('Modal mounted', {
      component: 'BaseModal',
      action: 'mount',
      metadata: { isSubmitting },
    });

    return () => {
      logger.debug('Modal unmounted', {
        component: 'BaseModal',
        action: 'unmount',
        metadata: { isSubmitting },
      });
    };
  }, [isSubmitting]);

  // Log when submission state changes
  useEffect(() => {
    loggerRef.current.debug('Modal submission state changed', {
      component: 'BaseModal',
      action: 'submissionStateChange',
      metadata: { isSubmitting },
    });
  }, [isSubmitting]);

  const handleClose = useCallback(() => {
    if (isSubmitting) {
      loggerRef.current.info('Modal close prevented - form is submitting', {
        component: 'BaseModal',
        action: 'closeAttempt',
        metadata: { isSubmitting },
      });
      return;
    }

    loggerRef.current.info('Modal closing', {
      component: 'BaseModal',
      action: 'close',
      metadata: {
        isSubmitting,
        trigger: 'direct',
      },
    });
    onClose();
  }, [isSubmitting, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        loggerRef.current.info('Modal backdrop clicked', {
          component: 'BaseModal',
          action: 'backdropClick',
          metadata: {
            isSubmitting,
            trigger: 'backdrop',
          },
        });
        handleClose();
      }
    },
    [handleClose, isSubmitting]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        loggerRef.current.info('Modal escape key pressed', {
          component: 'BaseModal',
          action: 'escapeKey',
          metadata: {
            isSubmitting,
            trigger: 'keyboard',
          },
        });
        handleClose();
      }
    },
    [handleClose, isSubmitting]
  );

  // Add keyboard event listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const logger = loggerRef.current;
    const timeout = timeoutRef.current;
    return () => {
      mountedRef.current = false;
      if (timeout) {
        clearTimeout(timeout);
        logger.debug('Cleared lock timeout on unmount', {
          component: 'BaseModal',
          action: 'cleanup',
        });
      }
    };
  }, []);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">{children}</div>
      </div>
    </ModalPortal>
  );
}
