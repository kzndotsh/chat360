'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
import { BaseModal } from './BaseModal';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AVATARS, STATUSES } from '@/lib/config/constants';
import { logger } from '@/lib/utils/logger';

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  avatar: z.string(),
  game: z.string(),
});

type FormData = z.infer<typeof formSchema>;

interface ProfileModalProps {
  onSubmit: (data: FormData) => Promise<void>;
  onClose: () => void;
  initialData?: FormData;
}

export function ProfileModal({ onSubmit, onClose, initialData }: ProfileModalProps) {
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: '',
      avatar: AVATARS[0],
      game: STATUSES[0],
    },
  });

  const onSubmitForm = async (data: FormData) => {
    try {
      setError(null);
      await onSubmit(data);
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
    <BaseModal onClose={onClose} isSubmitting={form.formState.isSubmitting}>
      <div className="w-[480px] min-h-[520px] rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#161718]">
            {initialData ? 'Edit Profile' : 'Join Party'}
          </h2>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitForm)} className="flex flex-col h-full space-y-4">
            <div className="flex-1 space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[#161718]">Username</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter your name"
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black transition-colors focus:border-[#616b83] focus:outline-none focus:ring-1 focus:ring-[#616b83]"
                        disabled={form.formState.isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="avatar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[#161718]">Select Avatar</FormLabel>
                    <div className="grid grid-cols-5 gap-2">
                      {AVATARS.map((avatar, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => field.onChange(avatar)}
                          disabled={form.formState.isSubmitting}
                          className={`h-12 w-12 overflow-hidden rounded-md ${
                            field.value === avatar ? 'ring-[3px] ring-[#55b611]' : ''
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
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="game"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-[#161718]">Current Game</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={form.formState.isSubmitting}
                    >
                      <SelectTrigger className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-black transition-colors focus:border-[#616b83] focus:outline-none focus:ring-1 focus:ring-[#616b83]">
                        <SelectValue placeholder="Select a game" className="text-black" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-gray-300 shadow-lg">
                        {STATUSES.map((status) => (
                          <SelectItem
                            key={status}
                            value={status}
                            className="cursor-pointer text-black hover:bg-[#f3f4f6] focus:bg-[#f3f4f6] focus:text-black"
                          >
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {error && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-red-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                          clipRule="evenodd"
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

              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={form.formState.isSubmitting}
                  className="flex items-center gap-2 rounded-none border-2 border-[#ae1228] px-4 py-2 text-[#ae1228] transition-colors hover:bg-[#ae1228] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ae1228] text-xs font-bold text-white">
                    B
                  </div>
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="flex items-center gap-2 rounded-none border-2 border-[#55b611] px-4 py-2 text-[#55b611] transition-colors hover:bg-[#55b611] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#55b611] text-xs font-bold text-white">
                    A
                  </div>
                  {form.formState.isSubmitting ? 'Saving...' : initialData ? 'Save Changes' : 'Join Party'}
                </button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </BaseModal>
  );
} 