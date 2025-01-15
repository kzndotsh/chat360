import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Clock from '@/components/features/party/Clock';
import { useCurrentTime } from '@/lib/hooks/useCurrentTime';

vi.mock('@/lib/hooks/useCurrentTime');

describe('Clock', () => {
  describe('Time Display', () => {
    it('displays current time in 12-hour format', () => {
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T14:30:00'));
      render(<Clock />);

      expect(screen.getByRole('time')).toHaveTextContent('2:30 PM');
    });
  });

  describe('Time Updates', () => {
    it('updates when time changes', () => {
      const firstDate = new Date('2024-01-15T14:30:00');
      const secondDate = new Date('2024-01-15T14:35:00');

      vi.mocked(useCurrentTime).mockReturnValue(firstDate);
      const { rerender } = render(<Clock />);
      expect(screen.getByRole('time')).toHaveTextContent('2:30 PM');

      vi.mocked(useCurrentTime).mockReturnValue(secondDate);
      rerender(<Clock />);
      expect(screen.getByRole('time')).toHaveTextContent('2:35 PM');
    });

    it('handles date change at midnight', () => {
      const beforeMidnight = new Date('2024-01-15T23:59:00');
      const afterMidnight = new Date('2024-01-16T00:01:00');

      vi.mocked(useCurrentTime).mockReturnValue(beforeMidnight);
      const { rerender } = render(<Clock />);
      expect(screen.getByRole('time')).toHaveTextContent('11:59 PM');

      vi.mocked(useCurrentTime).mockReturnValue(afterMidnight);
      rerender(<Clock />);
      expect(screen.getByRole('time')).toHaveTextContent('12:01 AM');
    });
  });

  describe('Performance', () => {
    it('re-renders only when time changes', () => {
      const date = new Date('2024-01-15T14:30:00');
      vi.mocked(useCurrentTime).mockReturnValue(date);

      const { rerender } = render(<Clock />);
      const firstRender = screen.getByRole('time');

      // Same time, should not re-render
      rerender(<Clock />);
      const secondRender = screen.getByRole('time');
      expect(firstRender).toBe(secondRender);

      // Different time, should re-render
      vi.mocked(useCurrentTime).mockReturnValue(new Date('2024-01-15T14:31:00'));
      rerender(<Clock />);
      const thirdRender = screen.getByRole('time');
      expect(firstRender).not.toBe(thirdRender);
    });
  });
});
