import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProcessStatusIndicator } from '../ProcessStatusIndicator';

describe('ProcessStatusIndicator', () => {
  describe('display', () => {
    it('should render running indicator when isVibing is true', () => {
      render(<ProcessStatusIndicator isVibing={true} onStop={() => {}} />);

      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    it('should render idle indicator when isVibing is false', () => {
      render(<ProcessStatusIndicator isVibing={false} onStop={() => {}} />);

      expect(screen.getByText('Idle')).toBeInTheDocument();
    });

    it('should show stop button only when isVibing is true', () => {
      const { rerender } = render(
        <ProcessStatusIndicator isVibing={true} onStop={() => {}} />
      );

      expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();

      rerender(<ProcessStatusIndicator isVibing={false} onStop={() => {}} />);

      expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument();
    });

    it('should show pulsing dot when running', () => {
      render(<ProcessStatusIndicator isVibing={true} onStop={() => {}} />);

      const dot = document.querySelector('.animate-pulse');
      expect(dot).toBeInTheDocument();
    });
  });

  describe('stop button interaction', () => {
    it('should show confirmation dialog when stop button is clicked', () => {
      render(<ProcessStatusIndicator isVibing={true} onStop={() => {}} />);

      fireEvent.click(screen.getByRole('button', { name: /stop/i }));

      expect(screen.getByText(/stop claude code process\?/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should call onStop when confirmation is accepted', () => {
      const handleStop = vi.fn();
      render(<ProcessStatusIndicator isVibing={true} onStop={handleStop} />);

      // Click stop button to open dialog
      const stopButtons = screen.getAllByRole('button', { name: /stop/i });
      fireEvent.click(stopButtons[0]);

      // Click confirm button in dialog (it's the second Stop button now)
      const allStopButtons = screen.getAllByRole('button', { name: /stop/i });
      // The confirm button is inside the dialog (last one)
      const confirmButton = allStopButtons[allStopButtons.length - 1];
      fireEvent.click(confirmButton);

      expect(handleStop).toHaveBeenCalledTimes(1);
    });

    it('should not call onStop when confirmation is cancelled', () => {
      const handleStop = vi.fn();
      render(<ProcessStatusIndicator isVibing={true} onStop={handleStop} />);

      // Click stop button
      fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));

      // Click cancel button
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(handleStop).not.toHaveBeenCalled();
    });

    it('should hide confirmation dialog after cancel', () => {
      render(<ProcessStatusIndicator isVibing={true} onStop={() => {}} />);

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: /^stop$/i }));
      expect(screen.getByText(/stop claude code process\?/i)).toBeInTheDocument();

      // Cancel
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      // Dialog should be hidden
      expect(screen.queryByText(/stop claude code process\?/i)).not.toBeInTheDocument();
    });

    it('should hide confirmation dialog after confirmation', () => {
      const handleStop = vi.fn();
      render(<ProcessStatusIndicator isVibing={true} onStop={handleStop} />);

      // Open dialog
      const stopButtons = screen.getAllByRole('button', { name: /stop/i });
      fireEvent.click(stopButtons[0]);

      // Confirm
      const allStopButtons = screen.getAllByRole('button', { name: /stop/i });
      const confirmButton = allStopButtons[allStopButtons.length - 1];
      fireEvent.click(confirmButton);

      // Dialog should be hidden
      expect(screen.queryByText(/stop claude code process\?/i)).not.toBeInTheDocument();
    });
  });

  describe('robustness', () => {
    it('should handle undefined isVibing by treating as false', () => {
      // TypeScript prevents undefined, but test runtime safety
      render(
        <ProcessStatusIndicator
          isVibing={undefined as unknown as boolean}
          onStop={() => {}}
        />
      );

      expect(screen.getByText('Idle')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument();
    });

    it('should not crash with rapid state changes', () => {
      const { rerender } = render(
        <ProcessStatusIndicator isVibing={true} onStop={() => {}} />
      );

      // Rapid toggling
      for (let i = 0; i < 10; i++) {
        rerender(
          <ProcessStatusIndicator isVibing={i % 2 === 0} onStop={() => {}} />
        );
      }

      // Should still be in a valid state (either Running or Idle is present)
      const hasValidState =
        screen.queryByText('Running') !== null ||
        screen.queryByText('Idle') !== null;
      expect(hasValidState).toBe(true);
    });
  });
});
