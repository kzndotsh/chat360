import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PartyControls } from '@/components/features/party/PartyControls';
import { useModalStore } from '@/lib/stores/useModalStore';
import { type PartyMember } from '@/types';

// Mock hooks and localStorage
vi.mock('@/lib/stores/useFormStore', () => ({
  useFormStore: {
    getState: vi.fn(() => ({
      lastUsedData: null
    }))
  }
}));

vi.mock('@/lib/stores/useModalStore', () => ({
  useModalStore: vi.fn()
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn()
  }
}));

describe('PartyControls', () => {
  const mockUser: PartyMember = {
    id: '1',
    name: 'Test User',
    avatar: 'avatar.png',
    game: 'Playing Game',
    isActive: true,
    muted: false
  };

  const mockProps = {
    currentUser: mockUser,
    isMuted: false,
    micPermissionDenied: false,
    onJoin: vi.fn(),
    onLeave: vi.fn(),
    onToggleMute: vi.fn(),
    onRequestMicrophonePermission: vi.fn()
  };

  const mockShowModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    vi.mocked(useModalStore).mockReturnValue({
      showModal: mockShowModal,
      hideModal: vi.fn(),
      isOpen: false,
      modalType: null
    });
  });

  it('renders all control buttons', () => {
    render(<PartyControls {...mockProps} />);
    
    expect(screen.getByText('Join Party')).toBeInTheDocument();
    expect(screen.getByText('Leave Party')).toBeInTheDocument();
    expect(screen.getByText('Mute')).toBeInTheDocument();
    expect(screen.getByText('Edit Profile')).toBeInTheDocument();
  });

  it('disables join button when user is active', () => {
    render(<PartyControls {...mockProps} />);
    
    const joinButton = screen.getByText('Join Party').closest('button');
    expect(joinButton).toBeDisabled();
  });

  it('enables join button when user is not active', () => {
    render(
      <PartyControls
        {...mockProps}
        currentUser={{ ...mockUser, isActive: false }}
      />
    );
    
    const joinButton = screen.getByText('Join Party').closest('button');
    expect(joinButton).not.toBeDisabled();
  });

  it('handles joining with stored user data', async () => {
    const storedUser = {
      name: 'Stored User',
      avatar: 'stored-avatar.png',
      status: 'Stored Status'
    };
    localStorage.setItem('currentUser', JSON.stringify(storedUser));

    render(
      <PartyControls
        {...mockProps}
        currentUser={{ ...mockUser, isActive: false }}
      />
    );
    
    const joinButton = screen.getByText('Join Party').closest('button');
    fireEvent.click(joinButton!);

    await waitFor(() => {
      expect(mockProps.onJoin).toHaveBeenCalledWith(
        storedUser.name,
        storedUser.avatar,
        storedUser.status
      );
    });
  });

  it('shows join modal when no stored data exists', async () => {
    render(
      <PartyControls
        {...mockProps}
        currentUser={{ ...mockUser, isActive: false }}
      />
    );
    
    const joinButton = screen.getByText('Join Party').closest('button');
    fireEvent.click(joinButton!);

    await waitFor(() => {
      expect(mockShowModal).toHaveBeenCalledWith('join');
    });
  });

  it('handles leaving party', async () => {
    render(<PartyControls {...mockProps} />);
    
    const leaveButton = screen.getByText('Leave Party').closest('button');
    fireEvent.click(leaveButton!);

    await waitFor(() => {
      expect(mockProps.onLeave).toHaveBeenCalled();
    });
  });

  it('handles toggling mute', () => {
    render(<PartyControls {...mockProps} />);
    
    const muteButton = screen.getByText('Mute').closest('button');
    fireEvent.click(muteButton!);

    expect(mockProps.onToggleMute).toHaveBeenCalled();
  });

  it('shows unmute text when muted', () => {
    render(<PartyControls {...mockProps} isMuted={true} />);
    expect(screen.getByText('Unmute')).toBeInTheDocument();
  });

  it('handles editing profile', () => {
    render(<PartyControls {...mockProps} />);
    
    const editButton = screen.getByText('Edit Profile').closest('button');
    fireEvent.click(editButton!);

    expect(mockShowModal).toHaveBeenCalledWith('edit', {
      name: mockUser.name,
      avatar: mockUser.avatar,
      status: mockUser.game
    });
  });

  it('shows microphone permission request button when denied', () => {
    render(<PartyControls {...mockProps} micPermissionDenied={true} />);
    
    const permissionButton = screen.getByText('Re-request Microphone Access');
    fireEvent.click(permissionButton);

    expect(mockProps.onRequestMicrophonePermission).toHaveBeenCalled();
  });

  it('shows loading state while joining', async () => {
    mockProps.onJoin.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    render(
      <PartyControls
        {...mockProps}
        currentUser={{ ...mockUser, isActive: false }}
      />
    );
    
    const joinButton = screen.getByText('Join Party').closest('button');
    fireEvent.click(joinButton!);

    expect(screen.getByText('Joining...')).toBeInTheDocument();
  });

  it('shows loading state while leaving', async () => {
    mockProps.onLeave.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    render(<PartyControls {...mockProps} />);
    
    const leaveButton = screen.getByText('Leave Party').closest('button');
    fireEvent.click(leaveButton!);

    expect(screen.getByText('Leaving...')).toBeInTheDocument();
  });
}); 