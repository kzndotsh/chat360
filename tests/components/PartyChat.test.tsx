import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PartyChat } from '@/components/features/party/PartyChat';
import { usePartyState } from '@/lib/hooks/usePartyState';
import { useModalStore } from '@/lib/stores/useModalStore';
import { useFormStore } from '@/lib/stores/useFormStore';
import { logger } from '@/lib/utils/logger';
import { PartyMember } from '@/types';

// Mock hooks
vi.mock('@/lib/hooks/usePartyState');
vi.mock('@/lib/stores/useModalStore');
vi.mock('@/lib/stores/useFormStore');
vi.mock('@/lib/utils/logger');

describe('PartyChat', () => {
  const mockJoinParty = vi.fn();
  const mockLeaveParty = vi.fn();
  const mockToggleMute = vi.fn();
  const mockEditProfile = vi.fn();
  const mockRequestMicrophonePermission = vi.fn();
  const mockShowModal = vi.fn();
  const mockHideModal = vi.fn();
  const mockSetFormData = vi.fn();
  const mockResetForm = vi.fn();
  const mockInitialize = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock usePartyState
    vi.mocked(usePartyState).mockReturnValue({
      members: [],
      currentUser: null,
      storedAvatar: null,
      isMuted: false,
      isConnected: false,
      micPermissionDenied: false,
      volumeLevels: {},
      joinParty: mockJoinParty,
      leaveParty: mockLeaveParty,
      toggleMute: mockToggleMute,
      editProfile: mockEditProfile,
      requestMicrophonePermission: mockRequestMicrophonePermission,
      initialize: mockInitialize
    });

    // Mock useModalStore
    vi.mocked(useModalStore).mockReturnValue({
      activeModal: null,
      modalData: null,
      showModal: mockShowModal,
      hideModal: mockHideModal
    });

    // Mock useFormStore
    vi.mocked(useFormStore).mockReturnValue({
      formData: { name: '', avatar: '', game: '' },
      lastUsedData: null,
      errors: {},
      isSubmitting: false,
      setFormData: mockSetFormData,
      resetForm: mockResetForm,
      setError: vi.fn(),
      setSubmitting: vi.fn(),
      saveLastUsedData: vi.fn(),
      initializeWithLastUsed: vi.fn()
    });
  });

  // Update the mock user object in all tests
  const mockUser: PartyMember = {
    id: '1',
    name: 'Test',
    avatar: 'test.png',
    game: 'Game',
    isActive: true,
    muted: false
  };

  describe('Initialization', () => {
    it('renders without crashing', () => {
      render(<PartyChat />);
      expect(screen.getByTestId('party-chat')).toBeInTheDocument();
    });

    it('initializes with stored user data', () => {
      const storedUser = {
        name: 'Test User',
        avatar: 'test-avatar.png',
        game: 'Test Game'
      };
      localStorage.setItem('currentUser', JSON.stringify(storedUser));
      
      render(<PartyChat />);
      expect(mockSetFormData).toHaveBeenCalledWith(storedUser);
    });

    it('handles corrupted localStorage data', () => {
      localStorage.setItem('currentUser', 'invalid-json');
      
      render(<PartyChat />);
      expect(mockSetFormData).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Connection Management', () => {
    it('handles successful party join', async () => {
      render(<PartyChat />);
      
      const joinButton = screen.getByRole('button', { name: /join/i });
      await act(async () => {
        fireEvent.click(joinButton);
      });

      expect(mockJoinParty).toHaveBeenCalled();
      expect(mockShowModal).not.toHaveBeenCalled();
    });

    it('handles join failure', async () => {
      mockJoinParty.mockRejectedValueOnce(new Error('Join failed'));
      
      render(<PartyChat />);
      
      const joinButton = screen.getByRole('button', { name: /join/i });
      await act(async () => {
        fireEvent.click(joinButton);
      });

      expect(mockShowModal).toHaveBeenCalledWith('error');
      expect(logger.error).toHaveBeenCalled();
    });

    it('handles leave party', async () => {
      vi.mocked(usePartyState).mockReturnValue({
        ...vi.mocked(usePartyState)(),
        currentUser: mockUser,
        isConnected: true
      });

      render(<PartyChat />);
      
      const leaveButton = screen.getByRole('button', { name: /leave/i });
      await act(async () => {
        fireEvent.click(leaveButton);
      });

      expect(mockLeaveParty).toHaveBeenCalled();
    });
  });

  describe('User Interactions', () => {
    beforeEach(() => {
      vi.mocked(usePartyState).mockReturnValue({
        ...vi.mocked(usePartyState)(),
        currentUser: mockUser,
        isConnected: true
      });
    });

    it('handles mute toggle', async () => {
      render(<PartyChat />);
      
      const muteButton = screen.getByRole('button', { name: /mute/i });
      await act(async () => {
        fireEvent.click(muteButton);
      });

      expect(mockToggleMute).toHaveBeenCalled();
    });

    it('handles profile edit', async () => {
      render(<PartyChat />);
      
      const editButton = screen.getByRole('button', { name: /edit profile/i });
      await act(async () => {
        fireEvent.click(editButton);
      });

      expect(mockShowModal).toHaveBeenCalledWith('editProfile');
    });

    it('handles microphone permission request', async () => {
      vi.mocked(usePartyState).mockReturnValue({
        ...vi.mocked(usePartyState)(),
        micPermissionDenied: true
      });

      render(<PartyChat />);
      
      const permissionButton = screen.getByRole('button', { name: /allow microphone/i });
      await act(async () => {
        fireEvent.click(permissionButton);
      });

      expect(mockRequestMicrophonePermission).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('displays error modal on join failure', async () => {
      mockJoinParty.mockRejectedValueOnce(new Error('Network error'));
      
      render(<PartyChat />);
      
      const joinButton = screen.getByRole('button', { name: /join/i });
      await act(async () => {
        fireEvent.click(joinButton);
      });

      expect(mockShowModal).toHaveBeenCalledWith('error');
      expect(logger.error).toHaveBeenCalled();
    });

    it('handles leave party failure', async () => {
      vi.mocked(usePartyState).mockReturnValue({
        ...vi.mocked(usePartyState)(),
        currentUser: mockUser,
        isConnected: true
      });
      mockLeaveParty.mockRejectedValueOnce(new Error('Leave failed'));

      render(<PartyChat />);
      
      const leaveButton = screen.getByRole('button', { name: /leave/i });
      await act(async () => {
        fireEvent.click(leaveButton);
      });

      expect(mockShowModal).toHaveBeenCalledWith('error');
      expect(logger.error).toHaveBeenCalled();
    });

    it('handles profile edit failure', async () => {
      mockEditProfile.mockRejectedValueOnce(new Error('Edit failed'));
      
      render(<PartyChat />);
      
      const editButton = screen.getByRole('button', { name: /edit profile/i });
      await act(async () => {
        fireEvent.click(editButton);
      });

      expect(mockShowModal).toHaveBeenCalledWith('error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('resets form on unmount', () => {
      const { unmount } = render(<PartyChat />);
      unmount();
      expect(mockResetForm).toHaveBeenCalled();
    });

    it('leaves party on unmount if connected', () => {
      vi.mocked(usePartyState).mockReturnValue({
        ...vi.mocked(usePartyState)(),
        currentUser: mockUser,
        isConnected: true
      });

      const { unmount } = render(<PartyChat />);
      unmount();
      expect(mockLeaveParty).toHaveBeenCalled();
    });
  });
}); 