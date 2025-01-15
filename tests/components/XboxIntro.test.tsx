import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XboxIntro } from '@/components/features/party/XboxIntro';
import { logger } from '@/lib/utils/logger';
import { INTRO_VIDEO_URL } from '@/lib/config/constants';

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('XboxIntro', () => {
  const mockOnIntroEnd = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Video Loading', () => {
    it('loads video with correct source and attributes', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      const video = screen.getByRole('video');
      expect(video).toHaveAttribute('src', INTRO_VIDEO_URL);
      expect(video).toHaveAttribute('playsInline');
      expect(video).not.toHaveAttribute('loop');
      expect(video).toHaveClass('h-full w-full object-cover');
    });
  });

  describe('Playback Control', () => {
    it('attempts to play video on mount', async () => {
      const playMock = vi.fn().mockResolvedValue(undefined);
      HTMLMediaElement.prototype.play = playMock;

      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(playMock).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Video playing with sound.', expect.any(Object));
    });

    it('falls back to muted playback if autoplay fails', async () => {
      const playMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('Autoplay failed'))
        .mockResolvedValueOnce(undefined);
      HTMLMediaElement.prototype.play = playMock;

      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);

      await act(async () => {
        await Promise.resolve();
      });

      expect(playMock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Autoplay with sound failed:'),
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith('Video playing muted.', expect.any(Object));
    });

    it('calls onIntroEnd when video ends', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      const video = screen.getByRole('video');
      fireEvent.ended(video);
      expect(mockOnIntroEnd).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Video ended.', expect.any(Object));
    });

    it('handles skip button click', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      const skipButton = screen.getByRole('button', { name: /skip intro/i });
      fireEvent.click(skipButton);
      expect(mockOnIntroEnd).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Intro skipped.', expect.any(Object));
    });

    it('toggles mute state', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      const muteButton = screen.getByRole('button', { name: /mute/i });
      const video = screen.getByRole('video') as HTMLVideoElement;

      expect(video.muted).toBe(false);
      fireEvent.click(muteButton);
      expect(video.muted).toBe(true);
      expect(muteButton).toHaveAttribute('aria-pressed', 'true');
      expect(logger.info).toHaveBeenCalledWith(
        'Mute toggled to true.',
        expect.objectContaining({
          component: 'XboxIntro.tsx',
          action: 'toggleMute',
        })
      );
    });
  });

  describe('Accessibility', () => {
    it('has accessible controls', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);

      expect(screen.getByRole('button', { name: /mute/i })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      expect(screen.getByRole('button', { name: /skip intro/i })).toBeInTheDocument();
    });

    it('provides feedback for screen readers when toggling mute', () => {
      render(<XboxIntro onIntroEnd={mockOnIntroEnd} />);
      const muteButton = screen.getByRole('button', { name: /mute/i });

      expect(muteButton).toHaveAttribute('aria-label', 'Mute');
      fireEvent.click(muteButton);
      expect(muteButton).toHaveAttribute('aria-label', 'Unmute');
    });
  });
});
