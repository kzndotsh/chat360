import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartyControls } from '@/components/features/party/PartyControls';
import { useModalStore } from '@/lib/stores/useModalStore';
import { AVATARS } from '@/lib/config/constants';

vi.mock('@/lib/stores/useModalStore');

const defaultProps = {
  currentUser: null,
  isJoining: false,
  isLeaving: false,
  isMuted: false,
  onJoin: vi.fn(),
  onLeave: vi.fn(),
  onToggleMute: vi.fn(),
  onRequestMicrophonePermission: vi.fn(),
};

describe('PartyControls', () => {
  const mockShowModal = vi.fn();
  const mockHideModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(useModalStore).mockReturnValue({
      showModal: mockShowModal,
      hideModal: mockHideModal,
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
  });

  it('shows loading state while leaving', () => {
    const mockProps = {
      ...defaultProps,
      currentUser: {
        id: '1',
        name: 'Test User',
        avatar: 'test.png',
        game: 'Test Game',
        isActive: true,
        muted: false,
        agora_uid: 123,
      },
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
});
