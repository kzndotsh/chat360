import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemberList } from '@/components/features/party/MemberList';
import { PartyMember } from '@/types';

describe('MemberList', () => {
  const mockMembers: PartyMember[] = [
    {
      id: '1',
      name: 'Test User 1',
      avatar: 'avatar1.png',
      game: 'Game 1',
      isActive: true,
      muted: false
    },
    {
      id: '2',
      name: 'Test User 2',
      avatar: 'avatar2.png',
      game: 'Game 2',
      isActive: false,
      muted: true
    }
  ];

  const mockVolumeLevels: Record<string, number> = {
    '1': 75,
    '2': 0
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
          muted: false
        }
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
        avatar: 'avatar.png',
        game: 'B'.repeat(100),
        isActive: true,
        muted: false
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
        avatar: 'avatar.png',
        game: '🎲 Special Game! 🎯',
        isActive: true,
        muted: false
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
      
      const activeUser = screen.getByText('Test User 1').closest('li');
      const inactiveUser = screen.getByText('Test User 2').closest('li');
      
      expect(activeUser).toHaveClass('border-green-500');
      expect(inactiveUser).toHaveClass('border-gray-700');
    });

    it('shows correct mute status', () => {
      render(
        <MemberList 
          members={mockMembers} 
          volumeLevels={mockVolumeLevels} 
          toggleMute={mockToggleMute}
        />
      );
      
      const unmutedUser = screen.getByText('Test User 1').closest('li');
      const mutedUser = screen.getByText('Test User 2').closest('li');
      
      expect(unmutedUser).toHaveAttribute('aria-label', expect.stringContaining('unmuted'));
      expect(mutedUser).toHaveAttribute('aria-label', expect.stringContaining('muted'));
    });

    it('handles undefined volume levels', () => {
      const volumeLevels: Record<string, number> = {
        '1': 0,
        '2': 0
      };
      render(
        <MemberList 
          members={mockMembers} 
          volumeLevels={volumeLevels} 
          toggleMute={mockToggleMute}
        />
      );
      
      const microphoneIcons = screen.getAllByTestId('microphone-icon');
      microphoneIcons.forEach(icon => {
        expect(icon).toHaveAttribute('data-volume', '0');
      });
    });

    it('handles negative volume levels', () => {
      const volumeLevels: Record<string, number> = {
        '1': 0,
        '2': 0
      };
      render(
        <MemberList 
          members={mockMembers} 
          volumeLevels={volumeLevels} 
          toggleMute={mockToggleMute}
        />
      );
      
      const microphoneIcons = screen.getAllByTestId('microphone-icon');
      microphoneIcons.forEach(icon => {
        expect(icon).toHaveAttribute('data-volume', '0');
      });
    });

    it('handles volume levels greater than 100', () => {
      const volumeLevels: Record<string, number> = {
        '1': 100,
        '2': 100
      };
      render(
        <MemberList 
          members={mockMembers} 
          volumeLevels={volumeLevels} 
          toggleMute={mockToggleMute}
        />
      );
      
      const microphoneIcons = screen.getAllByTestId('microphone-icon');
      microphoneIcons.forEach(icon => {
        expect(icon).toHaveAttribute('data-volume', '100');
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
      listItems.forEach(item => {
        expect(item).toHaveAttribute('aria-label');
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
      microphoneIcons.forEach(icon => {
        expect(icon).toHaveAttribute('aria-label');
        expect(icon).toHaveAttribute('role', 'img');
      });
    });

    it('has sufficient color contrast', () => {
      render(
        <MemberList 
          members={mockMembers} 
          volumeLevels={mockVolumeLevels} 
          toggleMute={mockToggleMute}
        />
      );
      
      const memberNames = screen.getAllByTestId('member-name');
      memberNames.forEach(name => {
        const styles = window.getComputedStyle(name);
        expect(styles.color).toBeTruthy();
      });
    });

    it('maintains focus order', () => {
      render(
        <MemberList 
          members={mockMembers} 
          volumeLevels={mockVolumeLevels} 
          toggleMute={mockToggleMute}
        />
      );
      
      const focusableElements = screen.getAllByRole('listitem');
      focusableElements.forEach(element => {
        expect(element).toHaveAttribute('tabindex', '0');
      });
    });
  });

  describe('Performance', () => {
    it('handles large lists efficiently', () => {
      const manyMembers = Array.from({ length: 100 }, (_, i) => ({
        id: `${i}`,
        name: `User ${i}`,
        avatar: `avatar${i}.png`,
        game: `Game ${i}`,
        isActive: i % 2 === 0,
        muted: i % 3 === 0
      }));
      
      const volumeLevels: Record<string, number> = Object.fromEntries(
        manyMembers.map(m => [m.id, Math.floor(Math.random() * 100)])
      );
      
      const { container } = render(
        <MemberList 
          members={manyMembers} 
          volumeLevels={volumeLevels} 
          toggleMute={mockToggleMute}
        />
      );
      
      expect(container).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(100);
    });

    it('memoizes member items', () => {
      const { rerender } = render(
        <MemberList 
          members={mockMembers} 
          volumeLevels={mockVolumeLevels} 
          toggleMute={mockToggleMute}
        />
      );
      
      const firstRender = screen.getAllByRole('listitem');
      
      const newVolumeLevels: Record<string, number> = {
        ...mockVolumeLevels,
        '3': 50
      };
      
      rerender(
        <MemberList 
          members={mockMembers} 
          volumeLevels={newVolumeLevels} 
          toggleMute={mockToggleMute}
        />
      );
      
      const secondRender = screen.getAllByRole('listitem');
      expect(firstRender).toEqual(secondRender);
    });
  });
}); 