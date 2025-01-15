import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XboxIntro } from '@/components/features/party/XboxIntro';
import { logger } from '@/lib/utils/logger';

// Mock logger
vi.mock('@/lib/utils/logger');

describe('XboxIntro', () => {
  const mockOnIntroEnd = vi.fn();
  let mockVideo: Partial<HTMLVideoElement> & {
    play: ReturnType<typeof vi.fn>;
    error: MediaError | null;
    readyState: number;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock video element methods and properties
    mockVideo = {
      play: vi.fn(),
      pause: vi.fn(),
      load: vi.fn(),
      muted: false,
      currentTime: 0,
      duration: 10,
      ended: false,
      readyState: 4, // HAVE_ENOUGH_DATA
      error: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    // Mock createElement to return our mock video
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'video') {
        return mockVideo as HTMLVideoElement;
      }
      return document.createElement(tagName);
    });
  });

  describe('Video Loading', () => {
    it('loads video with correct source', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      const video = screen.getByTestId('intro-video');
      expect(video).toHaveAttribute('src', expect.stringContaining('xbox-intro.mp4'));
    });

    it('handles video load error', () => {
      mockVideo.error = {
        code: 1,
        message: 'Failed to load video',
        MEDIA_ERR_ABORTED: 1,
        MEDIA_ERR_NETWORK: 2,
        MEDIA_ERR_DECODE: 3,
        MEDIA_ERR_SRC_NOT_SUPPORTED: 4
      };
      mockVideo.readyState = 0; // HAVE_NOTHING
      
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      const video = screen.getByTestId('intro-video');
      fireEvent.error(video);
      
      expect(logger.error).toHaveBeenCalled();
      expect(mockOnIntroEnd).toHaveBeenCalled();
    });

    it('handles network interruption during load', () => {
      mockVideo.readyState = 2; // HAVE_CURRENT_DATA
      mockVideo.error = {
        code: 2,
        message: 'Network error',
        MEDIA_ERR_ABORTED: 1,
        MEDIA_ERR_NETWORK: 2,
        MEDIA_ERR_DECODE: 3,
        MEDIA_ERR_SRC_NOT_SUPPORTED: 4
      };
      
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      const video = screen.getByTestId('intro-video');
      fireEvent.error(video);
      
      expect(logger.error).toHaveBeenCalled();
      expect(mockOnIntroEnd).toHaveBeenCalled();
    });

    it('handles invalid video source', () => {
      mockVideo.error = {
        code: 4,
        message: 'Source not supported',
        MEDIA_ERR_ABORTED: 1,
        MEDIA_ERR_NETWORK: 2,
        MEDIA_ERR_DECODE: 3,
        MEDIA_ERR_SRC_NOT_SUPPORTED: 4
      };
      
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      const video = screen.getByTestId('intro-video');
      fireEvent.error(video);
      
      expect(logger.error).toHaveBeenCalled();
      expect(mockOnIntroEnd).toHaveBeenCalled();
    });
  });

  describe('Playback Control', () => {
    it('attempts to play video on mount', async () => {
      mockVideo.play.mockResolvedValue(undefined);
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      expect(mockVideo.play).toHaveBeenCalled();
    });

    it('falls back to muted playback if autoplay fails', async () => {
      const playError = new Error('Play failed');
      mockVideo.play
        .mockRejectedValueOnce(playError)
        .mockResolvedValueOnce(undefined);
      
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      await act(async () => {
        await Promise.resolve();
      });
      
      expect(mockVideo.muted).toBe(true);
      expect(mockVideo.play).toHaveBeenCalledTimes(2);
    });

    it('handles play interruption', async () => {
      mockVideo.play.mockRejectedValue(new Error('Play interrupted'));
      
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      await act(async () => {
        await Promise.resolve();
      });
      
      expect(logger.error).toHaveBeenCalled();
    });

    it('calls onIntroEnd when video ends', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      const video = screen.getByTestId('intro-video');
      fireEvent.ended(video);
      
      expect(mockOnIntroEnd).toHaveBeenCalled();
    });

    it('handles skip button click', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      const skipButton = screen.getByRole('button', { name: /skip/i });
      fireEvent.click(skipButton);
      
      expect(mockOnIntroEnd).toHaveBeenCalled();
      expect(mockVideo.pause).toHaveBeenCalled();
    });

    it('toggles mute state', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      const muteButton = screen.getByRole('button', { name: /mute/i });
      fireEvent.click(muteButton);
      
      expect(mockVideo.muted).toBe(true);
      
      fireEvent.click(muteButton);
      expect(mockVideo.muted).toBe(false);
    });
  });

  describe('Accessibility', () => {
    it('has accessible video controls', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      const video = screen.getByTestId('intro-video');
      expect(video).toHaveAttribute('aria-label', expect.stringContaining('intro'));
      
      const skipButton = screen.getByRole('button', { name: /skip/i });
      expect(skipButton).toHaveAttribute('aria-label');
      
      const muteButton = screen.getByRole('button', { name: /mute/i });
      expect(muteButton).toHaveAttribute('aria-label');
    });

    it('provides keyboard navigation', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      const skipButton = screen.getByRole('button', { name: /skip/i });
      const muteButton = screen.getByRole('button', { name: /mute/i });
      
      skipButton.focus();
      fireEvent.keyDown(skipButton, { key: 'Enter' });
      expect(mockOnIntroEnd).toHaveBeenCalled();
      
      muteButton.focus();
      fireEvent.keyDown(muteButton, { key: ' ' });
      expect(mockVideo.muted).toBe(true);
    });

    it('handles reduced motion preference', () => {
      // Mock matchMedia
      window.matchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));
      
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      expect(mockOnIntroEnd).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('pauses and unloads video on unmount', () => {
      const { unmount } = render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      unmount();
      
      expect(mockVideo.pause).toHaveBeenCalled();
      expect(mockVideo.removeEventListener).toHaveBeenCalled();
    });

    it('removes event listeners on unmount', () => {
      const { unmount } = render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      unmount();
      
      expect(mockVideo.removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
      expect(mockVideo.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('handles unmount during playback', async () => {
      mockVideo.play.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      const { unmount } = render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      await act(async () => {
        unmount();
      });
      
      expect(mockVideo.pause).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('preloads video for better performance', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      const video = screen.getByTestId('intro-video');
      expect(video).toHaveAttribute('preload', 'auto');
    });

    it('uses appropriate video format', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      
      const video = screen.getByTestId('intro-video');
      expect(video).toHaveAttribute('src', expect.stringMatching(/\.(mp4|webm)$/));
    });
  });
}); 