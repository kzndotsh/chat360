import { describe, it, expect, beforeEach } from 'vitest';
import { useModalStore } from '@/lib/stores/useModalStore';

describe('useModalStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useModalStore.setState({
      activeModal: null,
      modalData: null
    });
  });

  it('initializes with default state', () => {
    const state = useModalStore.getState();
    
    expect(state.activeModal).toBeNull();
    expect(state.modalData).toBeNull();
  });

  it('shows modal with type only', () => {
    const { showModal } = useModalStore.getState();
    
    showModal('join');
    
    const state = useModalStore.getState();
    expect(state.activeModal).toBe('join');
    expect(state.modalData).toBeNull();
  });

  it('shows modal with type and data', () => {
    const { showModal } = useModalStore.getState();
    const modalData = {
      name: 'Test User',
      avatar: 'test-avatar.png',
      status: 'Online'
    };
    
    showModal('edit', modalData);
    
    const state = useModalStore.getState();
    expect(state.activeModal).toBe('edit');
    expect(state.modalData).toEqual(modalData);
  });

  it('hides modal', () => {
    const { showModal, hideModal } = useModalStore.getState();
    
    // First show a modal
    showModal('join', { name: 'Test' });
    
    // Then hide it
    hideModal();
    
    const state = useModalStore.getState();
    expect(state.activeModal).toBeNull();
    expect(state.modalData).toBeNull();
  });

  it('updates modal type', () => {
    const { showModal } = useModalStore.getState();
    
    // Show join modal first
    showModal('join');
    expect(useModalStore.getState().activeModal).toBe('join');
    
    // Update to edit modal
    showModal('edit');
    expect(useModalStore.getState().activeModal).toBe('edit');
  });

  it('updates modal data', () => {
    const { showModal } = useModalStore.getState();
    
    // Show modal with initial data
    showModal('edit', { name: 'Initial' });
    expect(useModalStore.getState().modalData).toEqual({ name: 'Initial' });
    
    // Update with new data
    showModal('edit', { name: 'Updated' });
    expect(useModalStore.getState().modalData).toEqual({ name: 'Updated' });
  });

  it('handles partial modal data', () => {
    const { showModal } = useModalStore.getState();
    
    showModal('edit', { name: 'Test' });
    
    const state = useModalStore.getState();
    expect(state.modalData).toEqual({ name: 'Test' });
    expect(state.modalData?.avatar).toBeUndefined();
    expect(state.modalData?.status).toBeUndefined();
  });

  it('preserves type safety for modal types', () => {
    const { showModal } = useModalStore.getState();
    
    // These should compile without type errors
    showModal('join');
    showModal('edit');
    showModal(null);
    
    // @ts-expect-error - Invalid modal type
    showModal('invalid');
  });

  it('handles undefined modal data', () => {
    const { showModal } = useModalStore.getState();
    
    showModal('join', undefined);
    
    const state = useModalStore.getState();
    expect(state.activeModal).toBe('join');
    expect(state.modalData).toBeNull();
  });

  it('maintains data isolation between modals', () => {
    const { showModal } = useModalStore.getState();
    
    // Set data for edit modal
    showModal('edit', { name: 'Edit Data' });
    expect(useModalStore.getState().modalData).toEqual({ name: 'Edit Data' });
    
    // Switch to join modal
    showModal('join');
    expect(useModalStore.getState().modalData).toBeNull();
    
    // Switch back to edit modal
    showModal('edit', { name: 'New Edit Data' });
    expect(useModalStore.getState().modalData).toEqual({ name: 'New Edit Data' });
  });
}); 