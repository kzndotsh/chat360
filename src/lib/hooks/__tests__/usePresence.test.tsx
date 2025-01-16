import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePresence } from '../usePresence';
import { supabase } from '@/lib/api/supabase';
import { RealtimePresenceState } from '@supabase/supabase-js';

type SubscriptionCallback = (
  status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'
) => void;

type MockChannel = {
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  track: ReturnType<typeof vi.fn>;
  untrack: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  presenceState: ReturnType<typeof vi.fn>;
  state: string;
};

// Mock supabase
vi.mock('@/lib/api/supabase', () => ({
  supabase: {
    channel: vi.fn(),
    getChannels: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

describe('usePresence', () => {
  const mockMember = {
    id: 'test-id',
    name: 'Test User',
    avatar: 'test-avatar',
    game: 'Test Game',
    is_active: true,
    muted: false,
    created_at: '2024-01-15T00:00:00.000Z',
    last_seen: '2024-01-15T00:00:00.000Z',
  };

  const mockChannel: MockChannel = {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    track: vi.fn(),
    untrack: vi.fn(),
    on: vi.fn(),
    presenceState: vi.fn(),
    state: 'closed',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (supabase.channel as ReturnType<typeof vi.fn>).mockReturnValue(mockChannel);
    (supabase.getChannels as ReturnType<typeof vi.fn>).mockReturnValue([]);

    // Reset channel state
    mockChannel.state = 'closed';

    // Setup default subscribe behavior
    mockChannel.subscribe.mockImplementation(async (callback: SubscriptionCallback) => {
      if (callback) {
        await callback('SUBSCRIBED');
      }
      mockChannel.state = 'joined';
      return mockChannel;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize presence successfully', async () => {
    const { result } = renderHook(() => usePresence());

    const mockPresenceState = {
      [mockMember.id]: [
        {
          presence_ref: 'test-ref',
          id: mockMember.id,
          name: mockMember.name,
          avatar: mockMember.avatar,
          game: mockMember.game,
          online_at: mockMember.last_seen,
        },
      ],
    } as unknown as RealtimePresenceState;

    mockChannel.presenceState.mockReturnValue(mockPresenceState);

    await act(async () => {
      await result.current.initialize(mockMember);
    });

    expect(mockChannel.subscribe).toHaveBeenCalled();
    expect(mockChannel.track).toHaveBeenCalledWith({
      id: mockMember.id,
      name: mockMember.name,
      avatar: mockMember.avatar,
      game: mockMember.game,
      online_at: expect.any(String),
    });
    expect(result.current.members).toHaveLength(1);
    expect(result.current.members[0]).toMatchObject({
      ...mockMember,
      created_at: expect.any(String),
    });
  });

  it('should clean up presence successfully', async () => {
    const { result } = renderHook(() => usePresence());

    await act(async () => {
      await result.current.initialize(mockMember);
    });

    // Then clean up
    await act(async () => {
      await result.current.cleanup();
    });

    expect(mockChannel.untrack).toHaveBeenCalled();
    expect(mockChannel.unsubscribe).toHaveBeenCalled();
    expect(result.current.members).toHaveLength(0);
  });

  it('should handle subscription failure', async () => {
    const { result } = renderHook(() => usePresence());

    // Override subscribe behavior for this test
    mockChannel.subscribe.mockImplementation(async (callback: SubscriptionCallback) => {
      if (callback) {
        await callback('CHANNEL_ERROR');
      }
      return mockChannel;
    });

    await act(async () => {
      try {
        await result.current.initialize(mockMember);
      } catch {
        // Expected to throw
      }
    });

    expect(mockChannel.track).not.toHaveBeenCalled();
    expect(result.current.members).toHaveLength(0);
  });

  it('should prevent multiple initializations', async () => {
    const { result } = renderHook(() => usePresence());

    await act(async () => {
      await result.current.initialize(mockMember);
    });

    // Try to initialize again
    await act(async () => {
      await result.current.initialize(mockMember);
    });

    // Should only be called once
    expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);
    expect(mockChannel.track).toHaveBeenCalledTimes(1);
  });

  it('should handle cleanup during initialization', async () => {
    const { result } = renderHook(() => usePresence());

    // Override subscribe behavior for this test
    mockChannel.subscribe.mockImplementation(async (callback: SubscriptionCallback) => {
      if (callback) {
        await callback('SUBSCRIBED');
        // Simulate cleanup happening during initialization
        await result.current.cleanup();
      }
      return mockChannel;
    });

    await act(async () => {
      await result.current.initialize(mockMember);
    });

    expect(mockChannel.track).not.toHaveBeenCalled();
    expect(result.current.members).toHaveLength(0);
  });
});
