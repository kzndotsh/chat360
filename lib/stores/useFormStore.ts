import { create } from 'zustand';
import { AVATARS, STATUSES } from '@/lib/constants';
import { logWithContext } from '@/lib/logger';

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
  setFormData: (data) =>
    set((state) => ({
      formData: { ...state.formData, ...data },
    })),
  setError: (field, error) =>
    set((state) => ({
      errors: { ...state.errors, [field]: error },
    })),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  saveLastUsedData: (data) => {
    logWithContext(
      'useFormStore',
      'saveLastUsedData',
      `Saving last used data: ${JSON.stringify(data)}`
    );
    set({ lastUsedData: data });
    localStorage.setItem('lastUsedFormData', JSON.stringify(data));
  },
  resetForm: () =>
    set({
      formData: initialFormState,
      errors: {
        name: undefined,
        avatar: undefined,
        status: undefined,
      },
      isSubmitting: false,
    }),
  initializeWithLastUsed: () => {
    const stored = localStorage.getItem('lastUsedFormData');
    if (stored) {
      try {
        const data = JSON.parse(stored) as FormData;
        logWithContext(
          'useFormStore',
          'initializeWithLastUsed',
          `Initializing with stored data: ${JSON.stringify(data)}`
        );
        set((state) => ({
          formData: {
            name: data.name || state.formData.name,
            avatar: data.avatar || state.formData.avatar,
            status: data.status || state.formData.status,
          },
          lastUsedData: data,
        }));
      } catch (error) {
        logWithContext(
          'useFormStore',
          'initializeWithLastUsed',
          `Error parsing stored data: ${error}`
        );
        localStorage.removeItem('lastUsedFormData');
      }
    }
  },
}));
