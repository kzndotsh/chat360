'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import Image from 'next/image';
import { BaseModal } from './BaseModal';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { AVATARS, STATUSES } from '@/lib/config/constants';
import { logger } from '@/lib/utils/logger';

interface FormData {
  name: string;
  avatar: string;
  game: string;
}

interface EditProfileModalProps {
  initialData: FormData;
  onSubmit: (username: string, avatar: string, game: string) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function EditProfileModal({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: EditProfileModalProps) {
  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<FormData>({
    defaultValues: initialData,
    mode: 'onChange',
    shouldUnregister: true,
  });

  const loggerRef = useRef(logger);
  const formValues = watch();
  const mountedRef = useRef(false);

  // Initialize form with current data when modal opens
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      loggerRef.current.debug('Initializing form with data', {
        component: 'EditProfileModal',
        action: 'formInit',
        metadata: { initialData },
      });
    }

    // Always reset form with latest data
    reset(initialData);
  }, [initialData, reset]);

  // Log form validation errors
  useEffect(() => {
    if (!mountedRef.current || Object.keys(errors).length === 0) return;

    loggerRef.current.warn('Form validation errors', {
      component: 'EditProfileModal',
      action: 'formValidation',
      metadata: { errors },
    });
  }, [errors]);

  // Log meaningful form value changes
  useEffect(() => {
    if (!mountedRef.current) return;

    const hasChanges = JSON.stringify(formValues) !== JSON.stringify(initialData);
    loggerRef.current.debug('Form values updated', {
      component: 'EditProfileModal',
      action: 'formUpdate',
      metadata: {
        formValues,
        hasChanges,
      },
    });
  }, [formValues, initialData]);

  // Reset state on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      reset({} as FormData);
    };
  }, [reset]);

  const handleFormSubmit = useCallback(
    async (data: FormData) => {
      if (isSubmitting) {
        loggerRef.current.debug('Form submission blocked - already submitting', {
          component: 'EditProfileModal',
          action: 'formSubmit',
          metadata: { isSubmitting },
        });
        return;
      }

      loggerRef.current.info('Submitting profile edit form', {
        component: 'EditProfileModal',
        action: 'formSubmit',
        metadata: {
          formData: data,
          hasChanges: JSON.stringify(data) !== JSON.stringify(initialData),
        },
      });

      try {
        await onSubmit(data.name.trim(), data.avatar, data.game);
        loggerRef.current.info('Profile edit form submitted successfully', {
          component: 'EditProfileModal',
          action: 'formSubmit',
          metadata: { formData: data },
        });
      } catch (error) {
        loggerRef.current.error('Profile edit form submission failed', {
          component: 'EditProfileModal',
          action: 'formSubmit',
          metadata: {
            error: error instanceof Error ? error : new Error(String(error)),
            formData: data,
          },
        });
      }
    },
    [onSubmit, isSubmitting, initialData]
  );

  const handleCancel = useCallback(() => {
    loggerRef.current.info('Profile edit cancelled', {
      component: 'EditProfileModal',
      action: 'formCancel',
      metadata: {
        hasUnsavedChanges: JSON.stringify(formValues) !== JSON.stringify(initialData),
      },
    });
    onCancel();
  }, [onCancel, formValues, initialData]);

  const handleAvatarSelect = useCallback(
    (avatar: string) => {
      loggerRef.current.debug('Avatar selected', {
        component: 'EditProfileModal',
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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-[#161718]">Edit Profile</h2>
      </div>

      <form
        onSubmit={handleSubmit(handleFormSubmit)}
        className="space-y-4"
      >
        <div>
          <label
            htmlFor="name"
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
                id="name"
                type="text"
                placeholder="Enter your name"
                className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black transition-colors focus:border-[#616b83] focus:outline-none focus:ring-1 focus:ring-[#616b83] ${errors.name ? 'border-red-500' : ''}`}
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
              <Select
                {...field}
                onValueChange={field.onChange}
              >
                <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black transition-colors focus:border-[#616b83] focus:outline-none focus:ring-1 focus:ring-[#616b83]">
                  <SelectValue placeholder="Select a game" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem
                      key={status}
                      value={status}
                    >
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-none border-2 border-[#ae1228] px-4 py-2 text-[#ae1228] transition-colors hover:bg-[#ae1228] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ae1228] text-xs font-bold text-white">
              B
            </div>
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-none border-2 border-[#55b611] px-4 py-2 text-[#55b611] transition-colors hover:bg-[#55b611] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#55b611] text-xs font-bold text-white">
              A
            </div>
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
