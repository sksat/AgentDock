import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserView } from '../BrowserView';
import type { ScreencastMetadata } from '@agent-dock/shared';

// Mock frame data (1x1 red pixel PNG in base64)
const mockFrameData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

const mockMetadata: ScreencastMetadata = {
  deviceWidth: 1280,
  deviceHeight: 720,
  timestamp: Date.now(),
};

const defaultProps = {
  frame: null,
  isActive: false,
  onMouseClick: () => {},
  onKeyPress: () => {},
  onStartBrowser: () => {},
  onStopBrowser: () => {},
};

describe('BrowserView', () => {
  describe('display', () => {
    it('should render inactive state with Start Browser button when no frame', () => {
      render(<BrowserView {...defaultProps} />);
      expect(screen.getByText(/Browser not active/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Start Browser/i })).toBeInTheDocument();
    });

    it('should display browser URL when provided', () => {
      render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          browserUrl="https://example.com"
        />
      );
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
    });

    it('should render canvas element when frame is provided', () => {
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
        />
      );
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should set canvas size based on metadata', () => {
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
        />
      );
      const canvas = container.querySelector('canvas');
      expect(canvas).toHaveAttribute('width', '1280');
      expect(canvas).toHaveAttribute('height', '720');
    });

    it('should show Stop Browser button when active', () => {
      render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
        />
      );
      expect(screen.getByRole('button', { name: /Stop Browser/i })).toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('should call onMouseClick with coordinates when canvas is clicked', () => {
      const handleClick = vi.fn();
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          onMouseClick={handleClick}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeInTheDocument();

      // Simulate click at position (100, 200)
      fireEvent.click(canvas!, {
        clientX: 100,
        clientY: 200,
      });

      expect(handleClick).toHaveBeenCalled();
      const { x, y } = handleClick.mock.calls[0][0];
      // Coordinates should be relative to canvas
      expect(typeof x).toBe('number');
      expect(typeof y).toBe('number');
    });

    it('should call onKeyPress when key is pressed while focused', () => {
      const handleKeyPress = vi.fn();
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          onKeyPress={handleKeyPress}
        />
      );

      const wrapper = container.querySelector('[tabindex]');
      expect(wrapper).toBeInTheDocument();

      fireEvent.keyDown(wrapper!, { key: 'a' });

      expect(handleKeyPress).toHaveBeenCalledWith('a');
    });

    it('should call onStartBrowser when Start Browser button is clicked', () => {
      const handleStartBrowser = vi.fn();
      render(
        <BrowserView
          {...defaultProps}
          onStartBrowser={handleStartBrowser}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Start Browser/i }));
      expect(handleStartBrowser).toHaveBeenCalled();
    });

    it('should call onStopBrowser when Stop Browser button is clicked', () => {
      const handleStopBrowser = vi.fn();
      render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          onStopBrowser={handleStopBrowser}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /Stop Browser/i }));
      expect(handleStopBrowser).toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('should show loading indicator when active but no frame yet', () => {
      render(
        <BrowserView
          {...defaultProps}
          isActive={true}
        />
      );
      // Should show some loading state, not "not active"
      expect(screen.queryByText(/Browser not active/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Loading browser view/i)).toBeInTheDocument();
    });
  });
});
