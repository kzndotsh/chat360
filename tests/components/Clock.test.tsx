import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Clock from '@/components/features/party/Clock';
import { useCurrentTime } from '@/lib/hooks/useCurrentTime';

// Mock the useCurrentTime hook
vi.mock('@/lib/hooks/useCurrentTime');

describe('Clock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Time Display', () => {
    it('displays current time in correct format', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T14:30:00'));
      
      render(<Clock />);
      expect(screen.getByText('2:30 PM')).toBeInTheDocument();
    });

    it('handles midnight (12 AM)', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T00:00:00'));
      
      render(<Clock />);
      expect(screen.getByText('12:00 AM')).toBeInTheDocument();
    });

    it('handles noon (12 PM)', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T12:00:00'));
      
      render(<Clock />);
      expect(screen.getByText('12:00 PM')).toBeInTheDocument();
    });

    it('pads single-digit minutes', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T09:05:00'));
      
      render(<Clock />);
      expect(screen.getByText('9:05 AM')).toBeInTheDocument();
    });

    it('handles time just before midnight', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T23:59:59'));
      
      render(<Clock />);
      expect(screen.getByText('11:59 PM')).toBeInTheDocument();
    });

    it('handles time just after midnight', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T00:00:01'));
      
      render(<Clock />);
      expect(screen.getByText('12:00 AM')).toBeInTheDocument();
    });
  });

  describe('Time Updates', () => {
    it('updates when time changes', () => {
      const firstTime = new Date('2024-01-15T14:30:00');
      const secondTime = new Date('2024-01-15T14:31:00');
      
      vi.mocked(useCurrentTime)
        .mockReturnValueOnce(firstTime)
        .mockReturnValueOnce(secondTime);
      
      const { rerender } = render(<Clock />);
      expect(screen.getByText('2:30 PM')).toBeInTheDocument();
      
      rerender(<Clock />);
      expect(screen.getByText('2:31 PM')).toBeInTheDocument();
    });

    it('handles rapid time updates', () => {
      const times = Array.from({ length: 10 }, (_, i) => {
        const date = new Date('2024-01-15T14:30:00');
        date.setSeconds(i);
        return date;
      });
      
      const { rerender } = render(<Clock />);
      
      times.forEach(time => {
        vi.mocked(useCurrentTime).mockReturnValue(time);
        rerender(<Clock />);
        expect(screen.getByText('2:30 PM')).toBeInTheDocument();
      });
    });

    it('handles date change at midnight', () => {
      const beforeMidnight = new Date('2024-01-15T23:59:59');
      const afterMidnight = new Date('2024-01-16T00:00:00');
      
      vi.mocked(useCurrentTime)
        .mockReturnValueOnce(beforeMidnight)
        .mockReturnValueOnce(afterMidnight);
      
      const { rerender } = render(<Clock />);
      expect(screen.getByText('11:59 PM')).toBeInTheDocument();
      
      rerender(<Clock />);
      expect(screen.getByText('12:00 AM')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible role', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T14:30:00'));
      
      render(<Clock />);
      const clock = screen.getByRole('time');
      expect(clock).toBeInTheDocument();
    });

    it('has accessible name', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T14:30:00'));
      
      render(<Clock />);
      const clock = screen.getByRole('time');
      expect(clock).toHaveAttribute('aria-label', 'Current time');
    });

    it('has datetime attribute', () => {
      const currentTime = new Date('2024-01-15T14:30:00');
      vi.mocked(useCurrentTime).mockReturnValue(currentTime);
      
      render(<Clock />);
      const clock = screen.getByRole('time');
      expect(clock).toHaveAttribute('datetime', currentTime.toISOString());
    });

    it('updates aria-live when time changes', () => {
      const firstTime = new Date('2024-01-15T14:30:00');
      const secondTime = new Date('2024-01-15T14:31:00');
      
      vi.mocked(useCurrentTime)
        .mockReturnValueOnce(firstTime)
        .mockReturnValueOnce(secondTime);
      
      const { rerender } = render(<Clock />);
      const clock = screen.getByRole('time');
      expect(clock).toHaveAttribute('aria-live', 'polite');
      
      rerender(<Clock />);
      expect(clock).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('Performance', () => {
    it('memoizes time display', () => {
      const currentTime = new Date('2024-01-15T14:30:00');
      vi.mocked(useCurrentTime).mockReturnValue(currentTime);
      
      const { rerender } = render(<Clock />);
      const firstRender = screen.getByRole('time');
      
      rerender(<Clock />);
      const secondRender = screen.getByRole('time');
      
      expect(firstRender).toBe(secondRender);
    });

    it('only updates when minute changes', () => {
      const sameMinute = Array.from({ length: 5 }, () => new Date('2024-01-15T14:30:00'));
      
      const { rerender } = render(<Clock />);
      const initialTime = screen.getByText('2:30 PM');
      
      sameMinute.forEach(time => {
        vi.mocked(useCurrentTime).mockReturnValue(time);
        rerender(<Clock />);
        const currentTime = screen.getByText('2:30 PM');
        expect(currentTime).toBe(initialTime);
      });
    });
  });

  describe('Styling', () => {
    it('applies correct font styles', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T14:30:00'));
      
      render(<Clock />);
      const clock = screen.getByRole('time');
      expect(clock).toHaveClass('font-mono');
      expect(clock).toHaveClass('text-lg');
    });

    it('maintains consistent width', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T14:30:00'));
      
      render(<Clock />);
      const clock = screen.getByRole('time');
      expect(clock).toHaveClass('tabular-nums');
    });

    it('has sufficient color contrast', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T14:30:00'));
      
      render(<Clock />);
      const clock = screen.getByRole('time');
      expect(clock).toHaveClass('text-white');
    });
  });

  describe('Error Handling', () => {
    it('handles invalid date from hook', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('invalid'));
      
      render(<Clock />);
      expect(screen.getByText('--:-- --')).toBeInTheDocument();
    });

    it('handles null date from hook', () => {
      // @ts-expect-error Testing null date
      vi.mocked(useCurrentTime).mockReturnValue(null);
      
      render(<Clock />);
      expect(screen.getByText('--:-- --')).toBeInTheDocument();
    });

    it('handles undefined date from hook', () => {
      // @ts-expect-error Testing undefined date
      vi.mocked(useCurrentTime).mockReturnValue(undefined);
      
      render(<Clock />);
      expect(screen.getByText('--:-- --')).toBeInTheDocument();
    });
  });
}); 