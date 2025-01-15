import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemberList } from '@/components/features/party/MemberList';
import { PartyMember } from '@/types';
import { AVATARS } from '@/lib/config/constants';

describe('MemberList', () => {
  const mockMembers: PartyMember[] = [
    {
      id: '1',
      name: 'Test User 1',
      avatar: AVATARS[0] ?? 'https://i.imgur.com/LCycgcq.png',
      game: 'Game 1',
      isActive: true,
      muted: false,
    },
    {
      id: '2',
      name: 'Test User 2',
      avatar: AVATARS[1] ?? 'https://i.imgur.com/Qrlzo59.png',
      game: 'Game 2',
      isActive: false,
      muted: true,
    },
  ];

  const mockVolumeLevels: Record<string, number> = {
    '1': 75,
    '2': 0,
  };

  const mockToggleMute = () => {};

  describe('Rendering', () => {
    it('renders member list with correct members', () => {
      render(
        <MemberList
          members={mockMembers}
          volumeLevels={mockVolumeLevels}
          toggleMute={mockToggleMute}
        />
      );

      expect(screen.getByText('Test User 1')).toBeInTheDocument();
      expect(screen.getByText('Test User 2')).toBeInTheDocument();
      expect(screen.getByText('Game 1')).toBeInTheDocument();
      expect(screen.getByText('Game 2')).toBeInTheDocument();
    });

    it('renders empty state when no members', () => {
      render(
        <MemberList
          members={[]}
          volumeLevels={{}}
          toggleMute={mockToggleMute}
        />
      );
      expect(screen.getByText(/no members/i)).toBeInTheDocument();
    });

    it('handles members with missing fields', () => {
      const incompleteMembers: PartyMember[] = [
        {
          id: '3',
          name: '',
          avatar: '',
          game: '',
          isActive: true,
          muted: false,
        },
      ];

      render(
        <MemberList
          members={incompleteMembers}
          volumeLevels={{}}
          toggleMute={mockToggleMute}
        />
      );
      expect(screen.getByText(/anonymous/i)).toBeInTheDocument();
      expect(screen.getByText(/not playing/i)).toBeInTheDocument();
    });

    it('handles extremely long names and game titles', () => {
      const longNameMember: PartyMember = {
        id: '4',
        name: 'A'.repeat(100),
        avatar: AVATARS[2] ?? 'https://i.imgur.com/BWLZz9H.png',
        game: 'B'.repeat(100),
        isActive: true,
        muted: false,
      };

      render(
        <MemberList
          members={[longNameMember]}
          volumeLevels={{}}
          toggleMute={mockToggleMute}
        />
      );
      const nameElement = screen.getByText(longNameMember.name);
      const gameElement = screen.getByText(longNameMember.game);

      expect(nameElement).toBeInTheDocument();
      expect(gameElement).toBeInTheDocument();
      expect(nameElement).toHaveClass('truncate');
      expect(gameElement).toHaveClass('truncate');
    });

    it('handles special characters in names and games', () => {
      const specialCharMember: PartyMember = {
        id: '5',
        name: '🎮 Test 👾 User ⚡️',
        avatar: AVATARS[3] ?? 'https://i.imgur.com/oCuOi6l.png',
        game: '🎲 Special Game! 🎯',
        isActive: true,
        muted: false,
      };

      render(
        <MemberList
          members={[specialCharMember]}
          volumeLevels={{}}
          toggleMute={mockToggleMute}
        />
      );
      expect(screen.getByText(specialCharMember.name)).toBeInTheDocument();
      expect(screen.getByText(specialCharMember.game)).toBeInTheDocument();
    });
  });

  describe('Status Indicators', () => {
    it('shows correct active status', () => {
      render(
        <MemberList
          members={mockMembers}
          volumeLevels={mockVolumeLevels}
          toggleMute={mockToggleMute}
        />
      );

      const activeUserIcon = screen.getAllByTestId('microphone-icon')[0];
      const inactiveUserIcon = screen.getAllByTestId('microphone-icon')[1];

      expect(activeUserIcon).toHaveAttribute('data-volume', '2');
      expect(inactiveUserIcon).toHaveAttribute('data-volume', '0');
    });

    it('shows correct mute status', () => {
      render(
        <MemberList
          members={mockMembers}
          volumeLevels={mockVolumeLevels}
          toggleMute={mockToggleMute}
        />
      );

      const unmutedButton = screen.getByLabelText('Mute');
      const mutedButton = screen.getByLabelText('Unmute');

      expect(unmutedButton).toBeInTheDocument();
      expect(mutedButton).toBeInTheDocument();
    });

    it('handles undefined volume levels', () => {
      render(
        <MemberList
          members={mockMembers}
          volumeLevels={{}}
          toggleMute={mockToggleMute}
        />
      );

      const microphoneIcons = screen.getAllByTestId('microphone-icon');
      microphoneIcons.forEach((icon) => {
        expect(icon).toHaveAttribute('data-volume', '0');
      });
    });

    it('handles negative volume levels', () => {
      const volumeLevels: Record<string, number> = {
        '1': -10,
        '2': -20,
      };
      render(
        <MemberList
          members={mockMembers}
          volumeLevels={volumeLevels}
          toggleMute={mockToggleMute}
        />
      );

      const microphoneIcons = screen.getAllByTestId('microphone-icon');
      microphoneIcons.forEach((icon) => {
        expect(icon).toHaveAttribute('data-volume', '0');
      });
    });

    it('handles volume levels greater than 100', () => {
      const volumeLevels = {
        '1': 86,
        '2': 90,
      };
      render(
        <MemberList
          members={mockMembers}
          volumeLevels={volumeLevels}
          toggleMute={mockToggleMute}
          currentUserId="1"
        />
      );
      const microphoneIcons = screen.getAllByTestId('microphone-icon');
      microphoneIcons.forEach((icon) => {
        expect(icon).toHaveAttribute('data-volume', '3');
      });
    });
  });

  describe('Accessibility', () => {
    it('has correct ARIA labels', () => {
      render(
        <MemberList
          members={mockMembers}
          volumeLevels={mockVolumeLevels}
          toggleMute={mockToggleMute}
        />
      );

      expect(screen.getByRole('list')).toHaveAttribute('aria-label', 'Party members');

      const listItems = screen.getAllByRole('listitem');
      listItems.forEach((item) => {
        expect(item).toHaveAttribute('aria-label');
        expect(item).toHaveAttribute('tabindex', '0');
      });
    });

    it('provides volume level information to screen readers', () => {
      render(
        <MemberList
          members={mockMembers}
          volumeLevels={mockVolumeLevels}
          toggleMute={mockToggleMute}
        />
      );

      const microphoneIcons = screen.getAllByTestId('microphone-icon');
      microphoneIcons.forEach((icon) => {
        expect(icon).toHaveAttribute('data-volume');
      });
    });
  });
});
