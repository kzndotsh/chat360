'use client';

import React from 'react';

import Image from 'next/image';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { AVATARS, STATUSES } from '@/lib/constants';
import { logger } from '@/lib/logger';

import { BaseModal } from './BaseModal';

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  avatar: z.string().refine((val) => AVATARS.includes(val), {
    message: 'Please select an avatar',
  }),
  game: z.string().refine((val) => STATUSES.includes(val), {
    message: 'Please select your current game',
  }),
});

type FormData = z.infer<typeof formSchema>;

interface ProfileModalProps {
  initialData?: FormData;
  onCloseAction: () => void;
  onSubmitAction: (data: FormData) => Promise<void>;
}

export function ProfileModal({ onSubmitAction, onCloseAction, initialData }: ProfileModalProps) {
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues:
      initialData?.avatar && initialData?.game
        ? initialData
        : {
            name: initialData?.name || '',
            avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? AVATARS[0]!,
            game: STATUSES[Math.floor(Math.random() * STATUSES.length)] ?? STATUSES[0]!,
          },
    mode: 'all',
    criteriaMode: 'all',
  });

  React.useEffect(() => {
    // Trigger validation on mount
    form.trigger();
  }, [form]);

  const onSubmitForm = async (data: FormData) => {
    try {
      logger.debug('Submitting profile form', {
        component: 'ProfileModal',
        action: 'submitForm',
        metadata: { data },
      });

      setError(null);
      await onSubmitAction(data);

      logger.debug('Profile form submitted successfully', {
        component: 'ProfileModal',
        action: 'submitForm',
      });
    } catch (err) {
      logger.error('Failed to submit profile', {
        component: 'ProfileModal',
        action: 'submitForm',
        metadata: { error: err },
      });
      setError(err instanceof Error ? err.message : 'Failed to submit profile');
    }
  };

  return (
    <BaseModal
      onCloseAction={onCloseAction}

      preventOutsideClick={true}
    >
      <div className="min-h-[520px] w-[90vw] rounded-lg bg-white p-4 shadow-xl sm:w-[480px] sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#161718] sm:text-xl">
            {initialData ? 'Edit Profile' : 'Join Party'}
          </h2>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmitForm)}

            className="flex h-full flex-col"
          >
            <div className="flex-1 space-y-6 sm:space-y-8">
              <FormField
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[#161718]">Username</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={form.formState.isSubmitting}
                        placeholder="Enter your name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}

                control={form.control}
                name="name"
              />

              <FormField
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[#161718]">
                      Select Avatar
                    </FormLabel>
                    <div
                      className={`mx-auto grid grid-cols-4 justify-items-center gap-3 p-4 ${
                        form.formState.errors.avatar ? 'rounded-md ring-2 ring-red-500' : ''
                      }`}
                    >
                      {AVATARS.map((avatar, index) => (
                        <button
                          className={`h-16 w-16 overflow-hidden rounded-md transition-all ${
                            field.value === avatar
                              ? 'ring-[3px] ring-[#55b611]'
                              : 'hover:ring-2 hover:ring-[#55b611]/50'
                          }`}

                          onClick={() => field.onChange(avatar)}

                          disabled={form.formState.isSubmitting}
                          key={index}
                          type="button"
                        >
                          <Image
                            alt={`Avatar ${index + 1}`}
                            className="h-full w-full object-cover"
                            height={64}
                            src={avatar}
                            width={64}
                          />
                        </button>
                      ))}
                    </div>
                    <FormMessage className="mt-2 text-sm text-red-500" />
                  </FormItem>
                )}

                control={form.control}
                name="avatar"
              />

              <FormField
                render={({ field }) => (
                  <FormItem className="mb-6">
                    <FormLabel className="text-sm font-medium text-[#161718]">
                      Current Game
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}

                      disabled={form.formState.isSubmitting}
                      value={field.value}
                    >
                      <SelectTrigger
                        className={`w-full rounded-md border bg-white px-3 py-2 text-black transition-colors focus:outline-none ${
                          form.formState.errors.game ? 'border-red-500' : 'border-gray-300'
                        }`}
                      >
                        <SelectValue
                          className="text-black"
                          placeholder="Select your current game"
                        />
                      </SelectTrigger>
                      <SelectContent className="border border-gray-300 bg-white shadow-lg">
                        {STATUSES.map((status) => (
                          <SelectItem
                            className="cursor-pointer text-black hover:bg-[#f3f4f6] focus:bg-[#f3f4f6] focus:text-black"
                            key={status}
                            value={status}
                          >
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="mt-2 text-sm text-red-500" />
                  </FormItem>
                )}

                control={form.control}
                name="game"
              />

              {error && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg
                        aria-hidden="true"
                        className="h-5 w-5 text-red-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          clipRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                          fillRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Error</h3>
                      <div className="mt-2 text-sm text-red-700">{error}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between sm:mt-12">
                <button
                  onClick={onCloseAction}

                  className="flex items-center gap-2 opacity-80 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={form.formState.isSubmitting}
                  type="button"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ae1228] text-xs font-bold text-white">
                    B
                  </div>
                  <span className="text-sm text-[#161718] sm:text-base">Cancel</span>
                </button>

                <button
                  className="flex items-center gap-2 opacity-80 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={form.formState.isSubmitting || !form.formState.isValid}
                  type="submit"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#55b611] text-xs font-bold text-white">
                    A
                  </div>
                  <span className="text-sm text-[#161718] sm:text-base">
                    {form.formState.isSubmitting
                      ? 'Saving...'
                      : initialData
                        ? 'Save Changes'
                        : 'Join Party'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </BaseModal>
  );
}
