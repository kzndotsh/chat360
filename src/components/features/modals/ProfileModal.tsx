'use client';

import React, { memo, useMemo } from 'react';

import Image from 'next/image';

import { zodResolver } from '@hookform/resolvers/zod';
import { Control, FieldErrors, useForm } from 'react-hook-form';
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
  name: z.string()
    .min(2, 'Name must be at least 2 characters')
    .max(20, 'Name cannot be longer than 20 characters'),
  avatar: z.string().refine((val) => AVATARS.includes(val), {
    message: 'Please select an avatar',
  }),
  game: z.string().refine((val) => STATUSES.includes(val), {
    message: 'Please select your current game',
  }),
});

type FormData = z.infer<typeof formSchema>;

const GameSelect = React.memo(
  ({
    field,
    isSubmitting,
    hasError,
  }: {
    field: { onChange: (value: string) => void; value: string };
    isSubmitting: boolean;
    hasError: boolean;
  }) => (
    <Select
      onValueChange={field.onChange}

      disabled={isSubmitting}
      value={field.value}
    >
      <SelectTrigger
        className={`w-full rounded-md border bg-white px-3 py-2 text-black transition-colors focus:outline-none ${hasError ? 'border-red-500' : 'border-[#5D626D]'}`}
      >
        <SelectValue
          className="text-black"
          placeholder="Select your current game"
        />
      </SelectTrigger>
      <SelectContent className="border border-gray-300 bg-white shadow-lg">
        {STATUSES.map((status) => (
          <SelectItem
            className="cursor-pointer text-black text-lg font-semibold hover:bg-[#60B801] focus:bg-[#60B801] focus:text-black rounded-none"
            key={status}
            value={status}
          >
            {status}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
);

GameSelect.displayName = 'GameSelect';

const AvatarImage = memo(({ src, index, className }: { src: string; index: number; className?: string }) => (
  <Image
    alt={`Avatar ${index + 1}`}
    className={className || "h-full w-full object-cover"}
    height={80}
    src={src}
    width={80}
  />
));
AvatarImage.displayName = 'AvatarImage';

const AvatarGrid = memo(
  ({
    field,
    isSubmitting,
    hasError,
  }: {
    field: { onChange: (value: string) => void; value: string };
    isSubmitting: boolean;
    hasError: boolean;
  }) => {
    const avatarButtons = useMemo(
      () =>
        AVATARS.map((avatar, index) => (
          <button
            onClick={() => field.onChange(avatar)}

            className={`h-20 w-20 overflow-hidden rounded-sm transition-all ${field.value === avatar ? 'ring-[5px] ring-[#55b611]' : 'hover:ring-5 hover:ring-[#55b611]'}`}
            disabled={isSubmitting}
            key={index}
            type="button"
          >
            <AvatarImage
              index={index}
              src={avatar}
            />
          </button>
        )),
      [field, isSubmitting]
    );

    return (
      <div
        className={`grid w-full grid-cols-7 justify-items-center gap-4 ${hasError ? 'rounded-md ring-2 ring-red-500' : ''}`}
      >
        {avatarButtons}
      </div>
    );
  }
);

AvatarGrid.displayName = 'AvatarGrid';

const FormFields = React.memo(
  ({
    control,
    isSubmitting,
    errors,
  }: {
    control: Control<FormData>;
    isSubmitting: boolean;
    errors: FieldErrors<FormData>;
  }) => (
    <div className="flex-1 space-y-6 sm:space-y-8">
      <FormField
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-semibold text-[#161718]">Username</FormLabel>
            <FormControl>
              <Input
                {...field}
                autoComplete="off"
                className="w-full rounded-md border border-[#5D626D] bg-white px-3 py-2 text-black transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSubmitting}
                placeholder="Enter your name"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}

        control={control}
        name="name"
      />

      <FormField
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-semibold text-[#161718]">Select Avatar</FormLabel>
            <div
              className={`grid w-full grid-cols-4 justify-items-center gap-2 sm:grid-cols-7 sm:gap-4 ${!!errors.avatar ? 'rounded-md ring-2 ring-red-500' : ''}`}
            >
              {AVATARS.map((avatar, index) => (
                <button
                  onClick={() => field.onChange(avatar)}

                  className={`h-16 w-16 overflow-hidden rounded-md transition-all sm:h-20 sm:w-20 ${field.value === avatar ? 'ring-[3px] ring-[#55b611]' : 'hover:ring-2 hover:ring-[#55b611]/50'}`}
                  disabled={isSubmitting}
                  key={index}
                  type="button"
                >
                  <AvatarImage
                    className="h-full w-full object-cover shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),inset_0_-2px_4px_rgba(0,0,0,0.1)]"
                    index={index}
                    src={avatar}
                  />
                </button>
              ))}
            </div>
            <FormMessage className="mt-2 text-sm text-red-500" />
          </FormItem>
        )}

        control={control}
        name="avatar"
      />

      <FormField
        render={({ field }) => (
          <FormItem className="mb-6">
            <FormLabel className="text-sm font-semibold text-[#161718]">Current Game</FormLabel>
            <GameSelect
              field={field}
              hasError={!!errors.game}
              isSubmitting={isSubmitting}
            />
            <FormMessage className="mt-2 text-sm text-red-500" />
          </FormItem>
        )}

        control={control}
        name="game"
      />
    </div>
  )
);

FormFields.displayName = 'FormFields';

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
    mode: 'onSubmit',
    criteriaMode: 'all',
  });

  const formState = React.useMemo(
    () => ({
      isSubmitting: form.formState.isSubmitting,
      isValid: form.formState.isValid,
      errors: form.formState.errors,
    }),
    [form.formState]
  );

  const { isSubmitting, isValid, errors } = formState;

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
      <div className="min-h-[520px] w-[90vw] rounded-lg bg-[#F7FFFF] p-2 sm:p-6 lg:w-[700px]">
        <div className="mb-2 flex items-center justify-between sm:mb-4">
          <h2 className="text-base font-bold text-[#161718] sm:text-xl">
            {initialData ? 'Edit Profile' : 'Join Party'}
          </h2>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmitForm)}

            className="flex h-full flex-col"
          >
            <div className="flex-1 space-y-4 sm:space-y-6">
              <FormField
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-[#161718]">Username</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        className="w-full rounded-md border border-[#5D626D] bg-white px-3 py-2 text-black transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSubmitting}
                        placeholder="Enter your username"
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
                    <FormLabel className="text-sm font-semibold text-[#161718]">
                      Select Avatar
                    </FormLabel>
                    <div
                      className={`grid w-full grid-cols-4 justify-items-center gap-2 sm:grid-cols-7 sm:gap-4 ${!!errors.avatar ? 'rounded-md ring-2 ring-red-500' : ''}`}
                    >
                      {AVATARS.map((avatar, index) => (
                        <button
                          onClick={() => field.onChange(avatar)}

                          className={`h-16 w-16 overflow-hidden rounded-md transition-all sm:h-20 sm:w-20 ${field.value === avatar ? 'ring-[3px] ring-[#55b611]' : 'hover:ring-2 hover:ring-[#55b611]/50'}`}
                          disabled={isSubmitting}
                          key={index}
                          type="button"
                        >
                          <AvatarImage
                            className="h-full w-full object-cover shadow-[inset_0_2px_4px_rgba(0,0,0,0.2),inset_0_-2px_4px_rgba(0,0,0,0.1)]"
                            index={index}
                            src={avatar}
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
                    <FormLabel className="text-sm font-semibold text-[#161718]">
                      Current Game
                    </FormLabel>
                    <GameSelect
                      field={field}
                      hasError={!!errors.game}
                      isSubmitting={isSubmitting}
                    />
                    <FormMessage className="mt-2 text-sm text-red-500" />
                  </FormItem>
                )}

                control={form.control}
                name="game"
              />
            </div>

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

            <div className="mt-5 flex items-center justify-between sm:mt-8">
              <button
                onClick={onCloseAction}

                className="flex items-center gap-2 opacity-80 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSubmitting}
                type="button"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ae1228] text-xs font-bold text-white">
                  B
                </div>
                <span className="text-sm text-[#161718] sm:text-base font-semibold">Cancel</span>
              </button>

              <button
                className="flex items-center gap-2 opacity-80 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSubmitting || !isValid}
                type="submit"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#55b611] text-xs font-bold text-white">
                  A
                </div>
                <span className="text-sm text-[#161718] sm:text-base font-semibold">
                  {isSubmitting ? 'Saving...' : initialData ? 'Save Changes' : 'Join Party'}
                </span>
              </button>
            </div>
          </form>
        </Form>
      </div>
    </BaseModal>
  );
}
