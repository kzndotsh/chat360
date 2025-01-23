import type { FormSlice } from '@/lib/types/party/middleware';
import type { FormState } from '@/lib/types/party/state';
import type { Store } from '@/lib/types/party/store';

import { StateCreator } from 'zustand';

import { AVATARS } from '@/lib/constants';

const FORM_STORAGE_KEY = 'party_form';

// Initial form state
const initialState: FormState = {
  name: '',
  avatar: AVATARS[0]!,
  game: '',
  errors: {},
  isSubmitting: false,
};

// Load stored form data
const loadStoredFormData = (): Partial<FormState> => {
  try {
    const stored = localStorage.getItem(FORM_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as Partial<FormState>;
      return {
        name: data.name || '',
        avatar: data.avatar || AVATARS[0]!,
        game: data.game || '',
      };
    }
  } catch {
    // Ignore storage errors
  }
  return {};
};

// Save form data
const saveFormData = (data: Partial<FormState>) => {
  try {
    const toSave = {
      name: data.name,
      avatar: data.avatar,
      game: data.game,
    };
    localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Ignore storage errors
  }
};

export const createFormMiddleware = (): StateCreator<Store, [], [], FormSlice> => (set) => ({
  // Initial form state with stored data
  form: {
    ...initialState,
    ...loadStoredFormData(),
  },

  // Form data actions
  setFormData: (data) =>
    set((state: Store) => {
      const newState = {
        ...state,
        form: {
          ...state.form,
          ...data,
          // Clear errors when updating form
          errors: {},
        },
      };
      // Save form data
      saveFormData(newState.form);
      return newState;
    }),

  // Form error actions
  setFormError: (field, error) =>
    set((state: Store) => ({
      ...state,
      form: {
        ...state.form,
        errors: {
          ...state.form.errors,
          [field]: error,
        },
      },
    })),

  // Form submission actions
  setSubmitting: (isSubmitting) =>
    set((state: Store) => ({
      ...state,
      form: {
        ...state.form,
        isSubmitting,
      },
    })),

  // Reset form action
  resetForm: () =>
    set((state: Store) => ({
      ...state,
      form: {
        ...initialState,
      },
    })),
});
