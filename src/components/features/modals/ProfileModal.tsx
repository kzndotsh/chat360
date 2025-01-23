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
  avatar: z.string(),
  game: z.string(),
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
    defaultValues: initialData || {
      name: '',
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] ?? AVATARS[0]!,
      game: STATUSES[0],
    },
  });

  React.useEffect(() => {
    if (!initialData) {
      const randomIndex = Math.floor(Math.random() * AVATARS.length);
      const randomAvatar = AVATARS[randomIndex] ?? AVATARS[0]!;
      form.setValue('avatar', randomAvatar);
    }
  }, [form, initialData]);

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
    <BaseModal onCloseAction={onCloseAction}>
      <div className="min-h-[520px] w-[480px] rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#161718]">
            {initialData ? 'Edit Profile' : 'Join Party'}
          </h2>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmitForm)}

            className="flex h-full flex-col"
          >
            <div className="flex-1 space-y-8">
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
                    <div className="grid grid-cols-5 gap-2">
                      {AVATARS.map((avatar, index) => (
                        <button
                          className={`h-12 w-12 overflow-hidden rounded-md transition-all ${
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
                            height={48}
                            src={avatar}
                            width={48}
                          />
                        </button>
                      ))}
                    </div>
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
                      <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black transition-colors focus:outline-none">
                        <SelectValue
                          className="text-black"
                          placeholder="Select a game"
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
                    <FormMessage />
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

              <div className="mt-12 flex items-center justify-between">
                <button
                  onClick={onCloseAction}

                  className="flex items-center gap-0 opacity-80 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2"
                  disabled={form.formState.isSubmitting}
                  type="button"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ae1228] text-xs font-bold text-white">
                    B
                  </div>
                  <span className="text-sm text-[#161718] sm:text-base">Cancel</span>
                </button>

                <button
                  className="flex items-center gap-0 opacity-80 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2"
                  disabled={form.formState.isSubmitting}
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
