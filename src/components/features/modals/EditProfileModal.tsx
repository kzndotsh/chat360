import React, { useCallback, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import Image from 'next/image';
import { BaseModal } from './BaseModal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AVATARS, STATUSES } from '@/lib/config/constants';

interface FormData {
  name: string;
  avatar: string;
  status: string;
}

interface EditProfileModalProps {
  initialData: FormData;
  onSubmit: (username: string, avatar: string, status: string) => Promise<void>;
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
    reset
  } = useForm<FormData>({
    defaultValues: initialData,
    mode: 'onChange'
  });

  // Store the last form data to prevent unnecessary resets
  const lastFormData = React.useRef('');

  // Only reset form when initialData meaningfully changes
  useEffect(() => {
    const currentFormData = JSON.stringify({
      name: initialData.name,
      avatar: initialData.avatar,
      status: initialData.status
    });
    
    if (currentFormData !== lastFormData.current) {
      reset(initialData);
      lastFormData.current = currentFormData;
    }
  }, [initialData.name, initialData.avatar, initialData.status, reset]);

  const handleFormSubmit = useCallback(
    async (data: FormData) => {
      if (isSubmitting) return;
      try {
        await onSubmit(data.name.trim(), data.avatar, data.status);
      } catch {
        // Error handling is done in the parent component
      }
    },
    [onSubmit, isSubmitting]
  );

  return (
    <BaseModal
      onClose={onCancel}
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
                    onClick={() => onChange(avatar)}
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
