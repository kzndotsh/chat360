import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCurrentTime } from '@/lib/hooks/useCurrentTime';

describe('useCurrentTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set initial time to a known value
    vi.setSystemTime(new Date(2024, 0, 1, 10, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns current time initially', () => {
    const { result } = renderHook(() => useCurrentTime());
    
    expect(result.current).toEqual(new Date(2024, 0, 1, 10, 30, 0));
  });

  it('updates time every second', () => {
    const { result } = renderHook(() => useCurrentTime());
    
    // Advance timer by 1 second
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

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useCurrentTime());
    
    unmount();
    
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('handles multiple renders correctly', () => {
    const { result, rerender } = renderHook(() => useCurrentTime());
    
    // First render
    expect(result.current).toEqual(new Date(2024, 0, 1, 10, 30, 0));
    
    // Advance time and rerender
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    rerender();
    
    expect(result.current).toEqual(new Date(2024, 0, 1, 10, 30, 1));
  });

  it('maintains consistent interval timing', () => {
    const { result } = renderHook(() => useCurrentTime());
    
    // Advance time by 5 seconds
    for (let i = 1; i <= 5; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current).toEqual(new Date(2024, 0, 1, 10, 30, i));
    }
  });

  it('handles date transitions correctly', () => {
    // Set time to just before midnight
    vi.setSystemTime(new Date(2024, 0, 1, 23, 59, 59));
    
    const { result } = renderHook(() => useCurrentTime());
    
    // Advance to midnight
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    
    expect(result.current).toEqual(new Date(2024, 0, 2, 0, 0, 0));
  });
}); 