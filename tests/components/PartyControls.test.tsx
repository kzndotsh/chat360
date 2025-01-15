import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartyControls } from '@/components/features/party/PartyControls';
import { useModalStore } from '@/lib/stores/useModalStore';
import { useFormStore } from '@/lib/stores/useFormStore';
import { AVATARS } from '@/lib/config/constants';

vi.mock('@/lib/stores/useModalStore');
vi.mock('@/lib/stores/useFormStore');

describe('PartyControls', () => {
  const mockShowModal = vi.fn();
  const mockHideModal = vi.fn();
  const mockFormState = {
    formData: { name: '', avatar: '', game: '' },
    lastUsedData: null,
    errors: {
      name: undefined,
      avatar: undefined,
      game: undefined,
    },
    isSubmitting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(useModalStore).mockReturnValue({
      showModal: mockShowModal,
      hideModal: mockHideModal,
    });
    vi.mocked(useFormStore).mockReturnValue({
      ...mockFormState,
      setFormData: vi.fn(),
      resetForm: vi.fn(),
      setError: vi.fn(),
      setSubmitting: vi.fn(),
      saveLastUsedData: vi.fn(),
      initializeWithLastUsed: vi.fn(),
      getState: () => mockFormState,
      setState: (fn: ((state: typeof mockFormState) => Partial<typeof mockFormState>) | Partial<typeof mockFormState>) => {
        Object.assign(mockFormState, typeof fn === 'function' ? fn(mockFormState) : fn);
      },
    });
  });

  it('disables join button when user is active', () => {
    const mockProps = {
      currentUser: {
        id: '1',
        name: 'Test User',
        avatar: AVATARS[0] ?? '',
        isActive: true,
        isMuted: false,
        game: 'Test Game',
        muted: false,
      },
      isJoining: false,
      isLeaving: false,
      isMuted: false,
      onJoin: vi.fn(),
      onLeave: vi.fn(),
      onToggleMute: vi.fn(),
      onRequestMicrophonePermission: vi.fn(),
    };

    render(<PartyControls {...mockProps} />);
    const joinButton = screen.getByText('Join Party').closest('button');
    expect(joinButton).toBeDisabled();
  });

  it('shows loading state while joining', () => {
    const mockProps = {
      currentUser: {
        id: '1',
        name: 'Test User',
        avatar: AVATARS[0] ?? '',
        isActive: true,
        isMuted: false,
        game: 'Test Game',
        muted: false,
      },
      isJoining: true,
      isLeaving: false,
      isMuted: false,
      onJoin: vi.fn(),
      onLeave: vi.fn(),
      onToggleMute: vi.fn(),
      onRequestMicrophonePermission: vi.fn(),
    };

    render(<PartyControls {...mockProps} />);
    const joinButton = screen.getByText('Join Party').closest('button');
    expect(joinButton).toBeDisabled();
    expect(joinButton).toHaveClass('opacity-50', 'cursor-not-allowed');
  });

  it('shows loading state while leaving', () => {
    const mockProps = {
      currentUser: {
        id: '1',
        name: 'Test User',
        avatar: AVATARS[0] ?? '',
        isActive: true,
        isMuted: false,
        game: 'Test Game',
        muted: false,
      },
      isJoining: false,
      isLeaving: true,
      isMuted: false,
      onJoin: vi.fn(),
      onLeave: vi.fn(),
      onToggleMute: vi.fn(),
      onRequestMicrophonePermission: vi.fn(),
    };

    render(<PartyControls {...mockProps} />);
    const leaveButton = screen.getByText('Leave Party').closest('button');
    expect(leaveButton).toBeDisabled();
    expect(leaveButton).toHaveClass('opacity-50', 'cursor-not-allowed');
  });

  it('shows join button when not joined', () => {
    const mockProps = {
      currentUser: {
        id: '1',
        name: 'Test User',
        avatar: AVATARS[0] ?? '',
        isActive: true,
        isMuted: false,
        game: 'Test Game',
        muted: false,
      },
      isJoining: false,
      isLeaving: false,
      isMuted: false,
      onJoin: vi.fn(),
      onLeave: vi.fn(),
      onToggleMute: vi.fn(),
      onRequestMicrophonePermission: vi.fn(),
    };

    render(<PartyControls {...mockProps} />);
    const joinButton = screen.getByText('Join Party').closest('button');
    expect(joinButton).toBeDisabled();
  });

  it('handles microphone permission request', async () => {
    const mockProps = {
      currentUser: {
        id: '1',
        name: 'Test User',
        avatar: AVATARS[0] ?? '',
        game: 'Test Game',
        isActive: true,
        muted: false,
        agora_uid: 123,
      },
      isLeaving: false,
      isMuted: false,
      onJoin: vi.fn(),
      onLeave: vi.fn(),
      onToggleMute: vi.fn(),
      onRequestMicrophonePermission: vi.fn(),
      isJoining: false,
    };

    render(<PartyControls {...mockProps} />);
    const joinButton = screen.getByText('Join Party').closest('button');
    expect(joinButton).toBeDisabled();
  });
});
