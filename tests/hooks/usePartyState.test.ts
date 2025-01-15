import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePartyState } from '@/lib/hooks/usePartyState';
import * as Sentry from '@sentry/react';
import { supabase } from '@/lib/api/supabase';
import AgoraRTC, { IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

// Define mocks
const mockTrack = {
  setEnabled: vi.fn(),
  stop: vi.fn(),
  close: vi.fn(),
  getVolumeLevel: vi.fn().mockReturnValue(0.5),
} as unknown as IMicrophoneAudioTrack;

const mockClient = {
  join: vi.fn().mockResolvedValue(undefined),
  leave: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockResolvedValue(undefined),
  unpublish: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  off: vi.fn(),
  removeAllListeners: vi.fn(),
  remoteUsers: [],
  localAudioTrack: null,
};

// Mock modules
vi.mock('@/lib/api/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('agora-rtc-sdk-ng', () => ({
  default: {
    createClient: vi.fn(() => mockClient),
    createMicrophoneAudioTrack: vi.fn().mockResolvedValue(mockTrack),
    setLogLevel: vi.fn(),
  },
}));

describe('usePartyState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Mock fetch for token endpoint
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'mock-token',
          privileges: {
            privilegeExpireTimestamp: Date.now() + 3600000, // 1 hour from now
          },
        }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => usePartyState());

    expect(result.current.members).toEqual([]);
    expect(result.current.currentUser).toBeNull();
    expect(result.current.isMuted).toBeFalsy();
    expect(result.current.micPermissionDenied).toBeFalsy();
    expect(result.current.isConnected).toBeFalsy();
  });

  it('should handle joining a party', async () => {
    const { result } = renderHook(() => usePartyState());

    await act(async () => {
      await result.current.joinParty('TestUser', 'avatar.png', 'Playing');
    });

    expect(mockClient.join).toHaveBeenCalled();
    expect(mockClient.publish).toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledWith('party_members');
  });

  it('should handle leaving a party', async () => {
    const { result } = renderHook(() => usePartyState());

    // First join the party
    await act(async () => {
      await result.current.joinParty('TestUser', 'avatar.png', 'Playing');
    });

    // Then leave
    await act(async () => {
      await result.current.leaveParty();
    });

    expect(mockClient.leave).toHaveBeenCalled();
    expect(mockClient.unpublish).toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledWith('party_members');
  });

  it('should handle toggling mute', async () => {
    const { result } = renderHook(() => usePartyState());

    await act(async () => {
      await result.current.joinParty('TestUser', 'avatar.png', 'Playing');
      await result.current.toggleMute();
    });

    expect(mockTrack.setEnabled).toHaveBeenCalledWith(false);
    expect(result.current.isMuted).toBeTruthy();
  });

  it('should handle editing profile', async () => {
    const { result } = renderHook(() => usePartyState());

    await act(async () => {
      await result.current.joinParty('TestUser', 'avatar.png', 'Playing');
      await result.current.editProfile('NewName', 'new-avatar.png', 'NewStatus');
    });

    expect(supabase.from).toHaveBeenCalledWith('party_members');
  });

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() => usePartyState());
    unmount();

    expect(mockClient.leave).toHaveBeenCalled();
    expect(supabase.removeChannel).toHaveBeenCalled();
  });

  it('should handle microphone permission denial', async () => {
    // Mock microphone permission denial
    vi.mocked(AgoraRTC.createMicrophoneAudioTrack).mockImplementationOnce(() =>
      Promise.reject(new Error('Permission denied'))
    );

    const { result } = renderHook(() => usePartyState());

    await act(async () => {
      try {
        await result.current.joinParty('TestUser', 'avatar.png', 'Playing');
      } catch {
        // Expected error
      }
    });

    expect(result.current.micPermissionDenied).toBeTruthy();
  });

  it('should update volume levels', async () => {
    const { result } = renderHook(() => usePartyState());

    await act(async () => {
      await result.current.joinParty('TestUser', 'avatar.png', 'Playing');
    });

    // Simulate volume level update
    mockClient.on.mock.calls.find(([event]) => event === 'volume-indicator')?.[1]([
      { uid: 'test-uid', level: 50 },
    ]);

    expect(Object.keys(result.current.volumeLevels).length).toBeGreaterThan(0);
  });

  it('handles join failure gracefully', async () => {
    vi.mocked(AgoraRTC.createMicrophoneAudioTrack).mockImplementationOnce(() =>
      Promise.reject(new Error('Failed to get microphone'))
    );

    const { result } = renderHook(() => usePartyState());

    await act(async () => {
      await expect(
        result.current.joinParty('Test User', 'test-avatar.png', 'Test Game')
      ).rejects.toThrow();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.currentUser).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
