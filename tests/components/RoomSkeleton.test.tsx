/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { RoomSkeleton } from '@/components/features/party/RoomSkeleton';

describe('RoomSkeleton', () => {
  describe('Structure', () => {
    it('renders all skeleton elements', () => {
      render(<RoomSkeleton />);
      
      // Main container
      expect(screen.getByTestId('room-skeleton')).toBeInTheDocument();
      expect(screen.getByTestId('video-background-skeleton')).toBeInTheDocument();
      
      // Header
      expect(screen.getByTestId('header-skeleton-left')).toBeInTheDocument();
      expect(screen.getByTestId('header-skeleton-center')).toBeInTheDocument();
      expect(screen.getByTestId('header-skeleton-right')).toBeInTheDocument();
      
      // Header buttons
      expect(screen.getByTestId('header-button-skeleton-1')).toBeInTheDocument();
      expect(screen.getByTestId('header-button-skeleton-2')).toBeInTheDocument();
      expect(screen.getByTestId('header-button-skeleton-3')).toBeInTheDocument();
      
      // Party info
      expect(screen.getByTestId('party-icon-skeleton')).toBeInTheDocument();
      expect(screen.getByTestId('party-name-skeleton')).toBeInTheDocument();
      
      // Buttons and options
      expect(screen.getByTestId('invite-button-skeleton')).toBeInTheDocument();
      expect(screen.getByTestId('party-options-skeleton')).toBeInTheDocument();
      
      // Member list
      for (let i = 0; i < 7; i++) {
        expect(screen.getByTestId(`member-skeleton-${i}`)).toBeInTheDocument();
        expect(screen.getByTestId(`member-avatar-skeleton-${i}`)).toBeInTheDocument();
        expect(screen.getByTestId(`member-status-skeleton-${i}`)).toBeInTheDocument();
        expect(screen.getByTestId(`member-name-skeleton-${i}`)).toBeInTheDocument();
        expect(screen.getByTestId(`member-mic-skeleton-${i}`)).toBeInTheDocument();
        expect(screen.getByTestId(`member-game-skeleton-${i}`)).toBeInTheDocument();
      }
      
      // Controls
      for (let i = 1; i <= 4; i++) {
        expect(screen.getByTestId(`control-skeleton-${i}`)).toBeInTheDocument();
        expect(screen.getByTestId(`control-icon-skeleton-${i}`)).toBeInTheDocument();
        expect(screen.getByTestId(`control-text-skeleton-${i}`)).toBeInTheDocument();
      }
    });
  });

  describe('Styling', () => {
    it('applies correct aspect ratio to card', () => {
      render(<RoomSkeleton />);
      const card = document.querySelector('.aspect-[16/9.75]');
      expect(card).toBeInTheDocument();
    });

    it('applies responsive classes', () => {
      render(<RoomSkeleton />);
      const container = screen.getByTestId('room-skeleton');
      expect(container).toHaveClass('sm:p-6');
    });

    it('applies animation classes', () => {
      render(<RoomSkeleton />);
      const videoBackground = screen.getByTestId('video-background-skeleton');
      expect(videoBackground).toHaveClass('animate-pulse');
    });

    it('uses hardware acceleration', () => {
      render(<RoomSkeleton />);
      const container = screen.getByTestId('room-skeleton');
      expect(container).toHaveClass('will-change-transform');
    });
  });

  describe('Dark Mode', () => {
    it('uses appropriate colors for dark theme', () => {
      render(<RoomSkeleton />);
      
      // Check background colors
      const videoBackground = screen.getByTestId('video-background-skeleton');
      expect(videoBackground).toHaveClass('bg-gray-900');
      
      // Check header skeleton colors
      const headerLeft = screen.getByTestId('header-skeleton-left');
      expect(headerLeft).toHaveClass('bg-gray-700');
      
      // Check member skeleton colors
      const memberAvatar = screen.getByTestId('member-avatar-skeleton-0');
      expect(memberAvatar).toHaveClass('bg-gray-300');
    });

    it('maintains contrast in dark mode', () => {
      render(<RoomSkeleton />);
      
      // Check overlay opacity
      const overlay = document.querySelector('.opacity-55');
      expect(overlay).toBeInTheDocument();
      
      // Check text color
      const card = document.querySelector('.text-[#161718]');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('uses hardware acceleration for animations', () => {
      render(<RoomSkeleton />);
      const container = screen.getByTestId('room-skeleton');
      expect(container).toHaveClass('will-change-transform');
    });

    it('maintains layout stability during animations', () => {
      render(<RoomSkeleton />);
      const memberList = document.querySelector('.max-h-[381px]');
      expect(memberList).toBeInTheDocument();
      expect(memberList).toHaveClass('overflow-y-auto');
    });
  });
}); 