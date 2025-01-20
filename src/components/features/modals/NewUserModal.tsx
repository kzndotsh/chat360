'use client';

import React, { useCallback, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import Image from 'next/image';
import { BaseModal } from './BaseModal';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { AVATARS, STATUSES } from '@/lib/config/constants';
import { logger } from '@/lib/utils/logger';
import * as Sentry from '@sentry/react';
import { useFormStore } from '@/lib/stores/useFormStore';

interface FormData {
  name: string;
  avatar: string;
  game: string;
}

interface NewUserModalProps {
  onJoin: (name: string, avatar: string, game: string) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export const NewUserModal: React.FC<NewUserModalProps> = ({ onJoin, onCancel, isSubmitting }) => {
  const { lastUsedData } = useFormStore();
  const loggerRef = useRef(logger);

  const {
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<FormData>({
    defaultValues: {
      name: lastUsedData?.name || '',
      avatar: lastUsedData?.avatar || AVATARS[0],
      game: lastUsedData?.game || STATUSES[0],
    },
  });

  const formValues = watch();

  // Log form validation errors
  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      loggerRef.current.warn('Form validation errors in new user modal', {
        component: 'NewUserModal',
        action: 'formValidation',
        metadata: { errors },
      });
    }
  }, [errors]);

  // Log form value changes
  useEffect(() => {
    loggerRef.current.debug('New user form values updated', {
      component: 'NewUserModal',
      action: 'formUpdate',
      metadata: {
        formValues,
        usedLastSavedData: !!lastUsedData,
      },
    });
  }, [formValues, lastUsedData]);

  const handleFormSubmit = useCallback(
    async (data: FormData) => {
      if (isSubmitting) {
        loggerRef.current.debug('New user form submission blocked - already submitting', {
          component: 'NewUserModal',
          action: 'formSubmit',
          metadata: {
            isSubmitting,
            formData: data,
          },
        });
        return;
      }

      loggerRef.current.info('Submitting new user form', {
        component: 'NewUserModal',
        action: 'formSubmit',
        metadata: {
          formData: data,
          usedLastSavedData: !!lastUsedData,
        },
      });

      try {
        await onJoin(data.name.trim(), data.avatar, data.game);
        loggerRef.current.info('New user form submitted successfully', {
          component: 'NewUserModal',
          action: 'formSubmit',
          metadata: { formData: data },
        });
      } catch (error) {
        loggerRef.current.error('New user form submission failed', {
          component: 'NewUserModal',
          action: 'formSubmit',
          metadata: {
            error: error instanceof Error ? error : new Error(String(error)),
            formData: data,
          },
        });
        Sentry.captureException(error, {
          extra: { formData: data },
        });
        throw error;
      }
    },
    [onJoin, isSubmitting, lastUsedData]
  );

  const handleCancel = useCallback(() => {
    loggerRef.current.info('New user form cancelled', {
      component: 'NewUserModal',
      action: 'formCancel',
      metadata: {
        hasFormData: Object.values(formValues).some(Boolean),
        formValues,
      },
    });
    onCancel();
  }, [onCancel, formValues]);

  const handleAvatarSelect = useCallback(
    (avatar: string) => {
      loggerRef.current.debug('Avatar selected in new user form', {
        component: 'NewUserModal',
        action: 'selectAvatar',
        metadata: {
          selectedAvatar: avatar,
          previousAvatar: formValues.avatar,
        },
      });
    },
    [formValues.avatar]
  );

  return (
    <BaseModal
      onClose={handleCancel}
      isSubmitting={isSubmitting}
    >
      <div className="space-y-4">
        <h2 className="mb-4 text-xl font-semibold text-[#161718]">Join Party</h2>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1 block text-sm font-medium text-[#161718]"
              >
                Username
              </label>
              <Controller
                name="name"
                control={control}
                rules={{ required: 'Username is required' }}
                render={({ field }) => (
                  <Input
                    {...field}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black transition-colors focus:border-[#616b83] focus:outline-none focus:ring-1 focus:ring-[#616b83]"
                    type="text"
                    id="username"
                    required
                    disabled={isSubmitting}
                  />
                )}
              />
              {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name.message}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-[#161718]">Select Avatar</label>
              <Controller
                name="avatar"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <div className="grid grid-cols-5 gap-2">
                    {AVATARS.map((avatar, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => {
                          handleAvatarSelect(avatar);
                          onChange(avatar);
                        }}
                        disabled={isSubmitting}
                        className={`h-12 w-12 overflow-hidden rounded-md ${
                          value === avatar ? 'ring-[3px] ring-[#55b611]' : ''
                        }`}
                      >
                        <Image
                          src={avatar}
                          alt={`Avatar ${index + 1}`}
                          width={48}
                          height={48}
                        />
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>

            <div>
              <label
                htmlFor="game"
                className="mb-1 block text-sm font-medium text-[#161718]"
              >
                Current Game
              </label>
              <Controller
                name="game"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black transition-colors focus:border-[#616b83] focus:outline-none focus:ring-1 focus:ring-[#616b83]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex items-center gap-0 opacity-80 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2"
            >
              <div className="h-3 w-3 rounded-full bg-[#ae1228] text-[8px] font-bold leading-3 text-white sm:h-4 sm:w-4 sm:text-[10px] sm:leading-4">
                B
              </div>
              <span className="text-sm text-[#161718] sm:text-base">Cancel</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-0 opacity-80 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2"
            >
              <div className="h-3 w-3 rounded-full bg-[#70b603] text-[8px] font-bold leading-3 text-white sm:h-4 sm:w-4 sm:text-[10px] sm:leading-4">
                A
              </div>
              <span className="text-sm text-[#161718] sm:text-base">
                {isSubmitting ? 'Joining...' : 'Join Party'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </BaseModal>
  );
};
