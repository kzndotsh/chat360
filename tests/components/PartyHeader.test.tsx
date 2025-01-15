import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PartyHeader } from '@/components/features/party/PartyHeader';
import { logger } from '@/lib/utils/logger';

// Mock logger
vi.mock('@/lib/utils/logger');

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn()
};
Object.assign(navigator, {
  clipboard: mockClipboard
});

describe('PartyHeader', () => {
  describe('Rendering', () => {
    it('renders header with correct title', () => {
      render(<PartyHeader membersCount={2} />);
      expect(screen.getByText('Party Chat')).toBeInTheDocument();
    });

    it('displays correct member count', () => {
      render(<PartyHeader membersCount={2} />);
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('handles zero members', () => {
      render(<PartyHeader membersCount={0} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('handles large number of members', () => {
      render(<PartyHeader membersCount={100} />);
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('handles undefined member count', () => {
      render(<PartyHeader membersCount={0} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('Copy Functionality', () => {
    beforeEach(() => {
      mockClipboard.writeText.mockReset();
    });

    it('copies CA link when copy button is clicked', async () => {
      render(<PartyHeader membersCount={2} />);
      
      const copyButton = screen.getByRole('button', { name: /copy/i });
      await fireEvent.click(copyButton);
      
      expect(mockClipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('ca://'));
    });

    it('handles clipboard API failure', async () => {
      mockClipboard.writeText.mockRejectedValueOnce(new Error('Clipboard error'));
      
      render(<PartyHeader membersCount={2} />);
      
      const copyButton = screen.getByRole('button', { name: /copy/i });
      await fireEvent.click(copyButton);
      
      expect(logger.error).toHaveBeenCalled();
    });

    it('shows success feedback when copy succeeds', async () => {
      render(<PartyHeader membersCount={2} />);
      
      const copyButton = screen.getByRole('button', { name: /copy/i });
      await fireEvent.click(copyButton);
      
      expect(screen.getByText(/copied/i)).toBeInTheDocument();
    });

    it('shows error feedback when copy fails', async () => {
      mockClipboard.writeText.mockRejectedValueOnce(new Error('Clipboard error'));
      
      render(<PartyHeader membersCount={2} />);
      
      const copyButton = screen.getByRole('button', { name: /copy/i });
      await fireEvent.click(copyButton);
      
      expect(screen.getByText(/failed/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has accessible copy button', () => {
      render(<PartyHeader membersCount={2} />);
      
      const copyButton = screen.getByRole('button', { name: /copy/i });
      expect(copyButton).toHaveAttribute('aria-label');
    });

    it('provides feedback for screen readers', async () => {
      render(<PartyHeader membersCount={2} />);
      
      const copyButton = screen.getByRole('button', { name: /copy/i });
      await fireEvent.click(copyButton);
      
      expect(copyButton).toHaveAttribute('aria-live', 'polite');
    });

    it('maintains focus after copy', async () => {
      render(<PartyHeader membersCount={2} />);
      
      const copyButton = screen.getByRole('button', { name: /copy/i });
      copyButton.focus();
      await fireEvent.click(copyButton);
      
      expect(document.activeElement).toBe(copyButton);
    });

    it('handles keyboard interaction', async () => {
      render(<PartyHeader membersCount={2} />);
      
      const copyButton = screen.getByRole('button', { name: /copy/i });
      copyButton.focus();
      await fireEvent.keyDown(copyButton, { key: 'Enter' });
      
      expect(mockClipboard.writeText).toHaveBeenCalled();
    });
  });

  describe('Responsive Design', () => {
    it('maintains layout on small screens', () => {
      render(<PartyHeader membersCount={2} />);
      
      const header = screen.getByRole('banner');
      expect(header).toHaveClass('flex');
      expect(header).toHaveClass('items-center');
      expect(header).toHaveClass('justify-between');
    });

    it('handles long member counts', () => {
      render(<PartyHeader membersCount={1000} />);
      
      const memberCount = screen.getByText('1000');
      expect(memberCount).toHaveClass('truncate');
    });
  });

  describe('Error Handling', () => {
    it('handles missing clipboard API', async () => {
      const originalClipboard = navigator.clipboard;
      // @ts-expect-error Testing clipboard API absence
      delete navigator.clipboard;
      
      render(<PartyHeader membersCount={2} />);
      
      const copyButton = screen.getByRole('button', { name: /copy/i });
      await fireEvent.click(copyButton);
      
      expect(logger.error).toHaveBeenCalled();
      expect(screen.getByText(/failed/i)).toBeInTheDocument();
      
      // Restore clipboard
      Object.assign(navigator, { clipboard: originalClipboard });
    });
  });

  describe('Performance', () => {
    it('memoizes member count', () => {
      const { rerender } = render(<PartyHeader membersCount={2} />);
      const initialCount = screen.getByText('2');
      
      // Rerender with same count
      rerender(<PartyHeader membersCount={2} />);
      const updatedCount = screen.getByText('2');
      
      expect(initialCount).toBe(updatedCount);
    });

    it('handles rapid copy button clicks', async () => {
      render(<PartyHeader membersCount={2} />);
      
      const copyButton = screen.getByRole('button', { name: /copy/i });
      
      // Click multiple times rapidly
      await fireEvent.click(copyButton);
      await fireEvent.click(copyButton);
      await fireEvent.click(copyButton);
      
      expect(mockClipboard.writeText).toHaveBeenCalledTimes(3);
    });
  });
}); 