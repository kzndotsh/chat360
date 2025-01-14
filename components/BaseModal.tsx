import React, { useCallback } from 'react';
import { ModalPortal } from './ModalPortal';
import { logWithContext } from '@/lib/logger';
import * as Sentry from '@sentry/react';

interface BaseModalProps {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void>;
  canCancel: boolean;
  isSubmitting: boolean;
  cancelText: string;
  submitText: string;
}

export const BaseModal: React.FC<BaseModalProps> = ({
  title,
  children,
  onCancel,
  onSubmit,
  canCancel,
  isSubmitting,
  cancelText,
  submitText,
}) => {
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      logWithContext('BaseModal', 'handleSubmit', 'Form submission started');

      if (isSubmitting) {
        logWithContext(
          'BaseModal',
          'handleSubmit',
          'Form already submitting, preventing resubmission'
        );
        return;
      }

      try {
        await onSubmit(e);
      } catch (error) {
        logWithContext(
          'BaseModal',
          'handleSubmit',
          `Form submission failed: ${error}`
        );
        Sentry.captureException(error, {
          extra: {
            component: 'BaseModal',
            action: 'handleSubmit',
            isSubmitting,
            title,
          },
        });
        console.error('Form submission failed:', error);
      }
    },
    [onSubmit, isSubmitting, title]
  );

  const handleCancel = useCallback(() => {
    if (!canCancel) {
      logWithContext(
        'BaseModal',
        'handleCancel',
        'Cancel not allowed during submission'
      );
      return;
    }
    logWithContext('BaseModal', 'handleCancel', 'Modal cancelled');
    onCancel();
  }, [canCancel, onCancel]);

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="w-full max-w-md bg-[#f0f0fa] p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#161718]">{title}</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {children}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleCancel}
                disabled={!canCancel || isSubmitting}
                className={`flex items-center gap-2 rounded-none border-2 px-4 py-2 transition-colors ${
                  canCancel
                    ? 'border-[#ae1228] text-[#ae1228] hover:bg-[#ae1228] hover:text-white'
                    : 'cursor-not-allowed border-gray-400 bg-transparent text-gray-400 opacity-50'
                }`}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                    canCancel ? 'bg-[#ae1228]' : 'bg-gray-400'
                  }`}
                >
                  B
                </div>
                <span>{cancelText}</span>
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-none border-2 border-[#55b611] px-4 py-2 text-[#55b611] transition-colors hover:bg-[#55b611] hover:text-white"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#55b611] text-xs font-bold text-white">
                  A
                </div>
                <span>{submitText}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};
