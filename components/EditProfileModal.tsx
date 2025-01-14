import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import Image from 'next/image';
import { BaseModal } from './BaseModal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AVATARS, STATUSES } from '@/lib/constants';
import { logWithContext } from '@/lib/logger';
import * as Sentry from '@sentry/react';

interface FormData {
  name: string;
  avatar: string;
  status: string;
}

interface EditProfileModalProps {
  initialData?: {
    name: string;
    avatar: string;
    status: string;
  };
  onSubmit: (name: string, avatar: string, status: string) => void;
  onCancel: () => void;
}

export const EditProfileModal = React.memo(function EditProfileModal({ 
  initialData, 
  onSubmit, 
  onCancel 
}: EditProfileModalProps) {
  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    defaultValues: {
      name: initialData?.name || '',
      avatar: initialData?.avatar || AVATARS[0],
      status: initialData?.status || STATUSES[0],
    }
  });

  useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name,
        avatar: initialData.avatar,
        status: initialData.status,
      });
    }
  }, [initialData, reset]);

  const handleFormSubmit = (data: FormData) => {
    try {
      logWithContext('EditProfileModal.tsx', 'handleFormSubmit', 'Submitting form data');
      onSubmit(data.name.trim(), data.avatar, data.status);
      logWithContext('EditProfileModal.tsx', 'handleFormSubmit', 'Form submitted successfully');
    } catch (error) {
      logWithContext('EditProfileModal.tsx', 'handleFormSubmit', `Error submitting form: ${error}`);
      Sentry.captureException(error);
    }
  };

  return (
    <BaseModal
      title='Edit Profile'
      onCancel={onCancel}
      onSubmit={handleSubmit(handleFormSubmit)}
      canCancel={true}
      isSubmitting={isSubmitting}
      cancelText='Cancel'
      submitText='Save Changes'
    >
      <div>
        <label htmlFor='username' className='block text-sm font-medium text-[#161718] mb-1'>
          Username
        </label>
        <Controller
          name='name'
          control={control}
          rules={{ required: 'Username is required' }}
          render={({ field }) => (
            <Input
              {...field}
              className='w-full px-3 py-2 border border-gray-300 rounded-md text-black bg-white focus:outline-none focus:ring-1 focus:ring-[#616b83] focus:border-[#616b83] transition-colors' 
              type='text'
              id='username'
              required
              disabled={isSubmitting}
            />
          )}
        />
        {errors.name && <p className='mt-1 text-sm text-red-500'>{errors.name.message}</p>}
      </div>

      <div>
        <label className='block text-sm font-medium text-[#161718] mb-1'>Select Avatar</label>
        <Controller
          name='avatar'
          control={control}
          render={({ field: { onChange, value } }) => (
            <div className='grid grid-cols-5 gap-2'>
              {AVATARS.map((avatar, index) => (
                <button
                  key={index}
                  type='button'
                  onClick={() => onChange(avatar)}
                  disabled={isSubmitting}
                  className={`w-12 h-12 rounded-md overflow-hidden ${value === avatar ? 'ring-[3px] ring-[#55b611]' : ''}`}
                >
                  <Image src={avatar} alt={`Avatar ${index + 1}`} width={48} height={48} />
                </button>
              ))}
            </div>
          )}
        />
      </div>

      <div>
        <label htmlFor='status' className='block text-sm font-medium text-[#161718] mb-1'>Status</label>
        <Controller
          name='status'
          control={control}
          render={({ field }) => (
            <Select
              {...field}
              id='status'
              className='w-full px-3 py-2 border border-gray-300 rounded-md text-black bg-white focus:outline-none focus:ring-1 focus:ring-[#616b83] focus:border-[#616b83] transition-colors'
              disabled={isSubmitting}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </Select>
          )}
        />
      </div>
    </BaseModal>
  );
});