import type { FormData, FormStore } from '@/lib/types/party/middleware';

import { create } from 'zustand';

import { AVATARS, STATUSES } from '@/lib/constants';
import { logger } from '@/lib/logger';

const initialFormState: FormData = {
  name: '',
  avatar: AVATARS[0] || 'default-avatar',
  game: STATUSES[0] || 'online',
};

export const useFormStore = create<FormStore>((set, get) => ({
  formData: initialFormState,
  lastUsedData: null,
  errors: {
    name: undefined,
    avatar: undefined,
    game: undefined,
  },
  isSubmitting: false,
  setFormData: (data) => {
    logger.info(`Setting form data: ${JSON.stringify(data)}`, {
      component: 'useFormStore',
      action: 'setFormData',
    });
    set((state) => ({
      formData: { ...state.formData, ...data },
      errors: {
        name: undefined,
        avatar: undefined,
        game: undefined,
      },
    }));
  },
  setError: (field, error) =>
    set((state) => ({
      errors: { ...state.errors, [field]: error },
    })),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  saveLastUsedData: (data) => {
    logger.info(`Saving last used data: ${JSON.stringify(data)}`, {
      component: 'useFormStore',
      action: 'saveLastUsedData',
    });
    set(() => ({
      lastUsedData: data,
      formData: { ...data },
    }));
    localStorage.setItem('lastUsedFormData', JSON.stringify(data));
  },
  initializeFromMember: (member) => {
    const data: FormData = {
      name: member.name,
      avatar: member.avatar,
      game: member.game,
    };
    logger.info(`Initializing form from member: ${JSON.stringify(data)}`, {
      component: 'useFormStore',
      action: 'initializeFromMember',
    });
    set(() => ({
      formData: data,
      lastUsedData: data,
    }));
  },
  resetForm: () => {
    const lastUsed = get().lastUsedData;
    set({
      formData: lastUsed || initialFormState,
      errors: {
        name: undefined,
        avatar: undefined,
        game: undefined,
      },
      isSubmitting: false,
    });
  },
  initializeWithLastUsed: () => {
    const stored = localStorage.getItem('lastUsedFormData');
    if (stored) {
      try {
        const data = JSON.parse(stored) as FormData;
        logger.info(`Initializing with stored data: ${JSON.stringify(data)}`, {
          component: 'useFormStore',
          action: 'initializeWithLastUsed',
        });
        set((state) => ({
          formData: {
            name: data.name || state.formData.name,
            avatar: data.avatar || state.formData.avatar,
            game: data.game || state.formData.game,
          },
          lastUsedData: data,
        }));
      } catch (error) {
        logger.error(`Error parsing stored data: ${error}`, {
          component: 'useFormStore',
          action: 'initializeWithLastUsed',
          metadata: { error },
        });
        localStorage.removeItem('lastUsedFormData');
      }
    }
  },
}));
