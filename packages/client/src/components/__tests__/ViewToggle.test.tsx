import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewToggle } from '../ViewToggle';

describe('ViewToggle', () => {
  describe('display', () => {
    it('should render stream and browser buttons', () => {
      render(
        <ViewToggle
          currentView="stream"
          onToggle={() => {}}
          browserActive={true}
        />
      );

      expect(screen.getByRole('button', { name: /stream/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /browser/i })).toBeInTheDocument();
    });

    it('should highlight stream button when currentView is stream', () => {
      render(
        <ViewToggle
          currentView="stream"
          onToggle={() => {}}
          browserActive={true}
        />
      );

      const streamButton = screen.getByRole('button', { name: /stream/i });
      expect(streamButton).toHaveClass('bg-accent-primary');
    });

    it('should highlight browser button when currentView is browser', () => {
      render(
        <ViewToggle
          currentView="browser"
          onToggle={() => {}}
          browserActive={true}
        />
      );

      const browserButton = screen.getByRole('button', { name: /browser/i });
      expect(browserButton).toHaveClass('bg-accent-primary');
    });
  });

  describe('interaction', () => {
    it('should call onToggle with "browser" when browser button is clicked', () => {
      const handleToggle = vi.fn();
      render(
        <ViewToggle
          currentView="stream"
          onToggle={handleToggle}
          browserActive={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /browser/i }));
      expect(handleToggle).toHaveBeenCalledWith('browser');
    });

    it('should call onToggle with "stream" when stream button is clicked', () => {
      const handleToggle = vi.fn();
      render(
        <ViewToggle
          currentView="browser"
          onToggle={handleToggle}
          browserActive={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /stream/i }));
      expect(handleToggle).toHaveBeenCalledWith('stream');
    });
  });

  describe('disabled state', () => {
    it('should disable browser button when browserActive is false', () => {
      render(
        <ViewToggle
          currentView="stream"
          onToggle={() => {}}
          browserActive={false}
        />
      );

      const browserButton = screen.getByRole('button', { name: /browser/i });
      expect(browserButton).toBeDisabled();
    });

    it('should not call onToggle when disabled browser button is clicked', () => {
      const handleToggle = vi.fn();
      render(
        <ViewToggle
          currentView="stream"
          onToggle={handleToggle}
          browserActive={false}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /browser/i }));
      expect(handleToggle).not.toHaveBeenCalled();
    });

    it('should enable browser button when browserActive is true', () => {
      render(
        <ViewToggle
          currentView="stream"
          onToggle={() => {}}
          browserActive={true}
        />
      );

      const browserButton = screen.getByRole('button', { name: /browser/i });
      expect(browserButton).not.toBeDisabled();
    });
  });
});
