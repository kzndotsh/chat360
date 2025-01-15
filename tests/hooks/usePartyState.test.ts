import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePartyState } from '@/lib/hooks/usePartyState';
import * as Sentry from '@sentry/react';
import { supabase } from '@/lib/api/supabase';
import AgoraRTC from 'agora-rtc-sdk-ng';

vi.mock('agora-rtc-sdk-ng', () => ({
  default: {
    createClient: vi.fn(() => ({
      join: vi.fn(),
      leave: vi.fn(),
      publish: vi.fn(),
      on: vi.fn(),
      removeAllListeners: vi.fn()
    })),
    createMicrophoneAudioTrack: vi.fn(),
    setLogLevel: vi.fn()
  }
}));

// Mock dependencies
vi.mock('@/lib/api/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis()
    })),
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null })
    }))
  }
}));

describe('usePartyState', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.clearAllMocks();
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

    expect(supabase.from).toHaveBeenCalledWith('party_members');
    expect(AgoraRTC.createMicrophoneAudioTrack).toHaveBeenCalled();
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

    expect(supabase.from).toHaveBeenCalledWith('party_members');
  });

  it('should handle toggling mute', async () => {
    const { result } = renderHook(() => usePartyState());

    await act(async () => {
      await result.current.joinParty('TestUser', 'avatar.png', 'Playing');
      await result.current.toggleMute();
    });

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

    // Wait for volume detection interval
    await new Promise(resolve => setTimeout(resolve, 300));

    expect(Object.keys(result.current.volumeLevels).length).toBeGreaterThan(0);
  });

  it('handles join failure gracefully', async () => {
    vi.mocked(AgoraRTC.createMicrophoneAudioTrack).mockImplementationOnce(() => Promise.reject(new Error('Failed to get microphone')));
    
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