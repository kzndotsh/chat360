/// <reference types="@testing-library/jest-dom" />
import { render, screen } from '@testing-library/react';
import { RoomSkeleton } from '@/components/features/party/RoomSkeleton';
import { describe, it, expect } from 'vitest';

describe('RoomSkeleton', () => {
  describe('Structure', () => {
    it('renders all skeleton elements', () => {
      render(<RoomSkeleton />);

      // Main container
      expect(screen.getByTestId('room-skeleton')).toBeInTheDocument();

      // Video background
      expect(screen.getByTestId('video-background-skeleton')).toBeInTheDocument();

      // Header skeletons
      expect(screen.getByTestId('header-skeleton-left')).toBeInTheDocument();
      expect(screen.getByTestId('header-skeleton-center')).toBeInTheDocument();
      expect(screen.getByTestId('header-skeleton-right')).toBeInTheDocument();

      // Room card
      expect(screen.getByTestId('room-card')).toBeInTheDocument();

      // Header buttons
      expect(screen.getByTestId('header-button-skeleton-1')).toBeInTheDocument();
      expect(screen.getByTestId('header-button-skeleton-2')).toBeInTheDocument();
      expect(screen.getByTestId('header-button-skeleton-3')).toBeInTheDocument();

      // Party info
      expect(screen.getByTestId('party-icon-skeleton')).toBeInTheDocument();
      expect(screen.getByTestId('party-name-skeleton')).toBeInTheDocument();

      // Invite button
      expect(screen.getByTestId('invite-button-skeleton')).toBeInTheDocument();

      // Party options
      expect(screen.getByTestId('party-options-skeleton')).toBeInTheDocument();

      // Member list
      expect(screen.getByTestId('member-list')).toBeInTheDocument();

      // Member skeletons (7 members)
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
    it('has correct background colors', () => {
      render(<RoomSkeleton />);
      const roomCard = screen.getByTestId('room-card');
      expect(roomCard.className).toContain('bg-[#f0f0fa]');
    });

    it('has correct text color', () => {
      render(<RoomSkeleton />);
      const roomCard = screen.getByTestId('room-card');
      expect(roomCard.className).toContain('text-[#161718]');
    });
  });

  describe('Dark Mode', () => {
    it('has correct background colors in dark mode', () => {
      document.documentElement.classList.add('dark');
      render(<RoomSkeleton />);
      const roomCard = screen.getByTestId('room-card');
      expect(roomCard.className).toContain('bg-[#f0f0fa]');
      document.documentElement.classList.remove('dark');
    });
  });

  describe('Performance', () => {
    it('uses hardware acceleration for animations', () => {
      render(<RoomSkeleton />);
      const roomSkeleton = screen.getByTestId('room-skeleton');
      expect(roomSkeleton.className).toContain('will-change-transform');
    });

    it('maintains layout stability during animations', () => {
      render(<RoomSkeleton />);
      const memberList = screen.getByTestId('member-list');
      expect(memberList.className).toContain('max-h-[381px]');
      expect(memberList.className).toContain('overflow-y-auto');
    });
  });
});
