import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCurrentTime } from '@/lib/hooks/useCurrentTime';

describe('useCurrentTime', () => {
  beforeEach(() => {
    // Mock all timer functions
    vi.useFakeTimers();
    // Set initial time to January 1, 2024, 10:30 AM
    vi.setSystemTime(new Date(2024, 0, 1, 10, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns current time initially', () => {
    const { result } = renderHook(() => useCurrentTime());
    expect(result.current).toEqual(new Date(2024, 0, 1, 10, 30, 0));
  });

  it('updates time every second', () => {
    const { result } = renderHook(() => useCurrentTime());

    // Initial time
    expect(result.current).toEqual(new Date(2024, 0, 1, 10, 30, 0));

    // Advance timer by one second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toEqual(new Date(2024, 0, 1, 10, 30, 1));

    // Advance timer by another second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toEqual(new Date(2024, 0, 1, 10, 30, 2));
  });

  it('handles multiple renders correctly', () => {
    const { result, rerender } = renderHook(() => useCurrentTime());

    // Initial time
    expect(result.current).toEqual(new Date(2024, 0, 1, 10, 30, 0));

    // Advance timer and rerender
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender();

    expect(result.current).toEqual(new Date(2024, 0, 1, 10, 30, 1));
  });

  it('maintains consistent interval timing', () => {
    const { result } = renderHook(() => useCurrentTime());

    // Check multiple intervals
    for (let i = 0; i < 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current).toEqual(new Date(2024, 0, 1, 10, 30, i + 1));
    }
  });

  it('handles date transitions correctly', () => {
    const { result } = renderHook(() => useCurrentTime());

    // Set time to 11:59:59 PM
    act(() => {
      vi.setSystemTime(new Date(2024, 0, 1, 23, 59, 59));
    });

    // Advance one second to midnight
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toEqual(new Date(2024, 0, 2, 0, 0, 0));
  });
});
