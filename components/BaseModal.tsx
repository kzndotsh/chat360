import React, { ReactNode } from 'react';
import { ModalPortal } from './ModalPortal';

interface BaseModalProps {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
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
  return (
    <ModalPortal>
      <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
        <div className='bg-[#f0f0fa] w-full max-w-md p-6 shadow-lg'>
          <div className='flex justify-between items-center mb-4'>
            <h2 className='text-xl font-bold text-[#161718]'>{title}</h2>
          </div>

          <form onSubmit={onSubmit} className='space-y-4'>
            {children}

            <div className='flex justify-between items-center'>
              <button
                type='button'
                onClick={onCancel}
                disabled={!canCancel || isSubmitting}
                className={`flex items-center gap-2 px-4 py-2 border-2 rounded-none transition-colors ${
                  canCancel ? 'border-[#ae1228] text-[#ae1228] hover:bg-[#ae1228] hover:text-white' : 'border-gray-400 text-gray-400 bg-transparent opacity-50 cursor-not-allowed'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs ${
                    canCancel ? 'bg-[#ae1228]' : 'bg-gray-400'
                  }`}
                >
                  B
                </div>
                <span>{cancelText}</span>
              </button>
              
              <button
                type='submit'
                disabled={isSubmitting}
                className='flex items-center gap-2 px-4 py-2 border-2 border-[#55b611] text-[#55b611] rounded-none transition-colors hover:bg-[#55b611] hover:text-white'
              >
                <div className='w-6 h-6 rounded-full bg-[#55b611] flex items-center justify-center text-white font-bold text-xs'>
                  A
                </div>
                <span>{isSubmitting ? 'Loading...' : submitText}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};