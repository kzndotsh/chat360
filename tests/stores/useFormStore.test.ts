import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFormStore } from '@/lib/stores/useFormStore';
import { AVATARS, STATUSES } from '@/lib/config/constants';

// Mock logger
vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('useFormStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useFormStore.setState({
      formData: {
        name: '',
        avatar: AVATARS[0] || 'default-avatar',
        status: STATUSES[0] || 'online'
      },
      lastUsedData: null,
      errors: {
        name: undefined,
        avatar: undefined,
        status: undefined
      },
      isSubmitting: false
    });
  });

  it('initializes with default state', () => {
    const state = useFormStore.getState();
    
    expect(state.formData).toEqual({
      name: '',
      avatar: AVATARS[0] || 'default-avatar',
      status: STATUSES[0] || 'online'
    });
    expect(state.lastUsedData).toBeNull();
    expect(state.errors).toEqual({
      name: undefined,
      avatar: undefined,
      status: undefined
    });
    expect(state.isSubmitting).toBe(false);
  });

  it('updates form data partially', () => {
    const { setFormData } = useFormStore.getState();
    
    setFormData({ name: 'Test User' });
    
    const state = useFormStore.getState();
    expect(state.formData.name).toBe('Test User');
    expect(state.formData.avatar).toBe(AVATARS[0] || 'default-avatar');
    expect(state.formData.status).toBe(STATUSES[0] || 'online');
  });

  it('updates form data completely', () => {
    const { setFormData } = useFormStore.getState();
    const newData = {
      name: 'Test User',
      avatar: 'new-avatar.png',
      status: 'busy'
    };
    
    setFormData(newData);
    
    const state = useFormStore.getState();
    expect(state.formData).toEqual(newData);
  });

  it('sets field error', () => {
    const { setError } = useFormStore.getState();
    
    setError('name', 'Name is required');
    
    const state = useFormStore.getState();
    expect(state.errors.name).toBe('Name is required');
    expect(state.errors.avatar).toBeUndefined();
    expect(state.errors.status).toBeUndefined();
  });

  it('clears field error', () => {
    const { setError } = useFormStore.getState();
    
    // Set error first
    setError('name', 'Name is required');
    expect(useFormStore.getState().errors.name).toBe('Name is required');
    
    // Clear error
    setError('name', undefined);
    expect(useFormStore.getState().errors.name).toBeUndefined();
  });

  it('toggles submitting state', () => {
    const { setSubmitting } = useFormStore.getState();
    
    setSubmitting(true);
    expect(useFormStore.getState().isSubmitting).toBe(true);
    
    setSubmitting(false);
    expect(useFormStore.getState().isSubmitting).toBe(false);
  });

  it('saves last used data', () => {
    const { saveLastUsedData } = useFormStore.getState();
    const data = {
      name: 'Test User',
      avatar: 'test-avatar.png',
      status: 'online'
    };
    
    saveLastUsedData(data);
    
    expect(useFormStore.getState().lastUsedData).toEqual(data);
  });

  it('resets form to initial state', () => {
    const { setFormData, setError, setSubmitting, resetForm } = useFormStore.getState();
    
    // Set some data and errors
    setFormData({ name: 'Test' });
    setError('name', 'Error');
    setSubmitting(true);
    
    // Reset form
    resetForm();
    
    const state = useFormStore.getState();
    expect(state.formData).toEqual({
      name: '',
      avatar: AVATARS[0] || 'default-avatar',
      status: STATUSES[0] || 'online'
    });
    expect(state.errors).toEqual({
      name: undefined,
      avatar: undefined,
      status: undefined
    });
    expect(state.isSubmitting).toBe(false);
  });

  it('initializes with last used data', () => {
    const { saveLastUsedData, initializeWithLastUsed } = useFormStore.getState();
    const lastUsedData = {
      name: 'Last User',
      avatar: 'last-avatar.png',
      status: 'last-status'
    };
    
    // Save last used data first
    saveLastUsedData(lastUsedData);
    
    // Reset form and then initialize with last used
    useFormStore.getState().resetForm();
    initializeWithLastUsed();
    
    expect(useFormStore.getState().formData).toEqual(lastUsedData);
  });

  it('handles initialization when no last used data exists', () => {
    const { initializeWithLastUsed } = useFormStore.getState();
    
    initializeWithLastUsed();
    
    const state = useFormStore.getState();
    expect(state.formData).toEqual({
      name: '',
      avatar: AVATARS[0] || 'default-avatar',
      status: STATUSES[0] || 'online'
    });
  });

  it('clears errors when updating form data', () => {
    const { setError, setFormData } = useFormStore.getState();
    
    // Set some errors
    setError('name', 'Name error');
    setError('avatar', 'Avatar error');
    
    // Update form data
    setFormData({ name: 'New Name' });
    
    const state = useFormStore.getState();
    expect(state.errors).toEqual({
      name: undefined,
      avatar: undefined,
      status: undefined
    });
  });

  it('handles whitespace in form data', () => {
    const { setFormData } = useFormStore.getState();
    const data = {
      name: '   Test User   ',
      avatar: AVATARS[0],
      status: STATUSES[0]
    };
    
    setFormData(data);
    
    const state = useFormStore.getState();
    expect(state.formData.name).toBe('   Test User   ');
  });

  it('handles very long input values', () => {
    const { setFormData } = useFormStore.getState();
    const longName = 'a'.repeat(1000);
    
    setFormData({ name: longName });
    
    const state = useFormStore.getState();
    expect(state.formData.name).toBe(longName);
  });

  it('handles special characters in form data', () => {
    const { setFormData } = useFormStore.getState();
    const data = {
      name: '!@#$%^&*()',
      avatar: AVATARS[0],
      status: STATUSES[0]
    };
    
    setFormData(data);
    
    const state = useFormStore.getState();
    expect(state.formData.name).toBe('!@#$%^&*()');
  });

  it('handles rapid state updates', async () => {
    const { setFormData } = useFormStore.getState();
    const updates = Array.from({ length: 100 }, (_, i) => ({
      name: `User ${i}`,
      avatar: AVATARS[0],
      status: STATUSES[0]
    }));
    
    await Promise.all(updates.map(update => {
      return new Promise<void>(resolve => {
        setTimeout(() => {
          setFormData(update);
          resolve();
        }, 0);
      });
    }));
    
    const state = useFormStore.getState();
    expect(state.formData.name).toBe('User 99');
  });

  it('handles invalid avatar values', () => {
    const { setFormData } = useFormStore.getState();
    
    setFormData({ avatar: 'nonexistent.png' });
    
    const state = useFormStore.getState();
    expect(state.formData.avatar).toBe('nonexistent.png');
  });

  it('handles invalid status values', () => {
    const { setFormData } = useFormStore.getState();
    
    setFormData({ status: 'invalid_status' });
    
    const state = useFormStore.getState();
    expect(state.formData.status).toBe('invalid_status');
  });

  it('preserves other fields when setting an error', () => {
    const { setError, setFormData } = useFormStore.getState();
    
    setFormData({
      name: 'Test User',
      avatar: AVATARS[0],
      status: STATUSES[0]
    });
    
    setError('name', 'Invalid name');
    
    const state = useFormStore.getState();
    expect(state.formData).toEqual({
      name: 'Test User',
      avatar: AVATARS[0],
      status: STATUSES[0]
    });
    expect(state.errors.name).toBe('Invalid name');
  });

  it('handles multiple errors simultaneously', () => {
    const { setError } = useFormStore.getState();
    
    setError('name', 'Invalid name');
    setError('avatar', 'Invalid avatar');
    setError('status', 'Invalid status');
    
    const state = useFormStore.getState();
    expect(state.errors).toEqual({
      name: 'Invalid name',
      avatar: 'Invalid avatar',
      status: 'Invalid status'
    });
  });
}); 