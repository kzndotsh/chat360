import React, { useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import Image from 'next/image';
import { BaseModal } from './BaseModal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AVATARS, STATUSES } from '@/lib/constants';
import { LoadingSpinner } from './LoadingSpinner';
import { logWithContext } from '@/lib/logger';
import * as Sentry from '@sentry/react';
import { useFormStore } from '@/lib/stores/useFormStore';

interface FormData {
  name: string;
  avatar: string;
  status: string;
}

interface NewUserModalProps {
  onJoin: (name: string, avatar: string, status: string) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export const NewUserModal: React.FC<NewUserModalProps> = ({
  onJoin,
  onCancel,
  isSubmitting,
}) => {
  const { formData: storedFormData } = useFormStore();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: storedFormData.name || '',
      avatar: storedFormData.avatar || AVATARS[0],
      status: storedFormData.status || STATUSES[0],
    },
  });

  const handleFormSubmit = useCallback(
    async (data: FormData) => {
      const context = {
        component: 'NewUserModal',
        action: 'handleFormSubmit',
        formData: data,
        isSubmitting,
      };

      logWithContext(
        'NewUserModal',
        'handleFormSubmit',
        `Attempting to submit form with name: ${data.name}`
      );

      if (isSubmitting) {
        logWithContext(
          'NewUserModal',
          'handleFormSubmit',
          'Form submission already in progress, skipping'
        );
        return;
      }

      try {
        logWithContext('NewUserModal', 'handleFormSubmit', 'Calling onJoin');
        await onJoin(data.name.trim(), data.avatar, data.status);
        logWithContext(
          'NewUserModal',
          'handleFormSubmit',
          'Form submitted successfully'
        );
      } catch (error) {
        logWithContext(
          'NewUserModal',
          'handleFormSubmit',
          `Form submission failed: ${error}`
        );
        Sentry.captureException(error, {
          extra: context,
        });
        console.error('Form submission failed:', error);
        throw error;
      }
    },
    [onJoin, isSubmitting]
  );

  return (
    <BaseModal
      title="Join Party"
      onCancel={onCancel}
      onSubmit={handleSubmit(handleFormSubmit)}
      canCancel={!isSubmitting}
      isSubmitting={isSubmitting}
      cancelText="Cancel"
      submitText={isSubmitting ? 'Joining...' : 'Join Party'}
    >
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
          {errors.name && (
            <p className="mt-1 text-sm text-red-500">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#161718]">
            Select Avatar
          </label>
          <Controller
            name="avatar"
            control={control}
            render={({ field: { onChange, value } }) => (
              <div className="grid grid-cols-5 gap-2">
                {AVATARS.map((avatar, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => onChange(avatar)}
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
            htmlFor="status"
            className="mb-1 block text-sm font-medium text-[#161718]"
          >
            Status
          </label>
          <Controller
            name="status"
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                id="status"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black transition-colors focus:border-[#616b83] focus:outline-none focus:ring-1 focus:ring-[#616b83]"
                disabled={isSubmitting}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            )}
          />
        </div>
      </div>
    </BaseModal>
  );
};
