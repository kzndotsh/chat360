import React, { useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import Image from 'next/image';
import { BaseModal } from './BaseModal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AVATARS, STATUSES } from '@/lib/config/constants';
import { logger } from '@/lib/utils/logger';
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

export const NewUserModal: React.FC<NewUserModalProps> = ({ onJoin, onCancel, isSubmitting }) => {
  const { lastUsedData } = useFormStore();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      name: lastUsedData?.name || '',
      avatar: lastUsedData?.avatar || AVATARS[0],
      status: lastUsedData?.status || STATUSES[0],
    },
  });

  const handleFormSubmit = useCallback(
    async (data: FormData) => {
      const context = {
        component: 'NewUserModal',
        action: 'handleFormSubmit',
        metadata: {
          formData: data,
          isSubmitting
        }
      };

      logger.info('Form validation started', context);

      if (isSubmitting) {
        logger.info('Form submission already in progress, skipping', context);
        return;
      }

      try {
        logger.info('Calling onJoin', context);
        await onJoin(data.name.trim(), data.avatar, data.status);
        logger.info('Form submitted successfully', context);
      } catch (error) {
        logger.error(`Form submission failed: ${error}`, {
          ...context,
          metadata: {
            ...context.metadata,
            error
          }
        });
        Sentry.captureException(error, {
          extra: context.metadata,
        });
        console.error('Form submission failed:', error);
        throw error;
      }
    },
    [onJoin, isSubmitting]
  );

  return (
    <BaseModal
      onClose={onCancel}
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
                      <option
                        key={status}
                        value={status}
                      >
                        {status}
                      </option>
                    ))}
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
              {isSubmitting ? 'Joining...' : 'Join Party'}
            </button>
          </div>
        </form>
      </div>
    </BaseModal>
  );
};
