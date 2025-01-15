import { create } from 'zustand';
import { AVATARS, STATUSES } from '@/lib/config/constants';
import { logger } from '@/lib/utils/logger';

interface FormData {
  name: string;
  avatar: string;
  status: string;
}

interface FormStore {
  formData: FormData;
  lastUsedData: FormData | null;
  errors: Record<keyof FormData, string | undefined>;
  isSubmitting: boolean;
  setFormData: (data: Partial<FormData>) => void;
  setError: (field: keyof FormData, error: string | undefined) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  saveLastUsedData: (data: FormData) => void;
  resetForm: () => void;
  initializeWithLastUsed: () => void;
}

const initialFormState: FormData = {
  name: '',
  avatar: AVATARS[0] || 'default-avatar',
  status: STATUSES[0] || 'online',
};

export const useFormStore = create<FormStore>((set, get) => ({
  formData: initialFormState,
  lastUsedData: null,
  errors: {
    name: undefined,
    avatar: undefined,
    status: undefined,
  },
  isSubmitting: false,
  setFormData: (data) => {
    logger.info(`Setting form data: ${JSON.stringify(data)}`, {
      component: 'useFormStore',
      action: 'setFormData'
    });
    set((state) => ({
      formData: { ...state.formData, ...data },
      errors: {
        name: undefined,
        avatar: undefined,
        status: undefined,
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
      action: 'saveLastUsedData'
    });
    set(() => ({
      lastUsedData: data,
      formData: { ...data },
    }));
    localStorage.setItem('lastUsedFormData', JSON.stringify(data));
  },
  resetForm: () => {
    const lastUsed = get().lastUsedData;
    set({
      formData: lastUsed || initialFormState,
      errors: {
        name: undefined,
        avatar: undefined,
        status: undefined,
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
          action: 'initializeWithLastUsed'
        });
        set((state) => ({
          formData: {
            name: data.name || state.formData.name,
            avatar: data.avatar || state.formData.avatar,
            status: data.status || state.formData.status,
          },
          lastUsedData: data,
        }));
      } catch (error) {
        logger.error(`Error parsing stored data: ${error}`, {
          component: 'useFormStore',
          action: 'initializeWithLastUsed',
          metadata: { error }
        });
        localStorage.removeItem('lastUsedFormData');
      }
    }
  },
}));
