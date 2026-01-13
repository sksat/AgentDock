import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('BrowserView', () => {
  describe('display', () => {
    it('should render inactive state when no frame', () => {
      render(
        <BrowserView
          frame={null}
          isActive={false}
          onMouseClick={() => {}}
          onKeyPress={() => {}}
        />
      );
      expect(screen.getByText(/Browser not active/i)).toBeInTheDocument();
    });

    it('should display browser URL when provided', () => {
      render(
        <BrowserView
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          browserUrl="https://example.com"
          onMouseClick={() => {}}
          onKeyPress={() => {}}
        />
      );
      expect(screen.getByText('https://example.com')).toBeInTheDocument();
    });

    it('should render canvas element when frame is provided', () => {
      const { container } = render(
        <BrowserView
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          onMouseClick={() => {}}
          onKeyPress={() => {}}
        />
      );
      const canvas = container.querySelector('canvas');
      expect(canvas).toBeInTheDocument();
    });

    it('should set canvas size based on metadata', () => {
      const { container } = render(
        <BrowserView
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          onMouseClick={() => {}}
          onKeyPress={() => {}}
        />
      );
      const canvas = container.querySelector('canvas');
      expect(canvas).toHaveAttribute('width', '1280');
      expect(canvas).toHaveAttribute('height', '720');
    });
  });

  describe('interaction', () => {
    it('should call onMouseClick with coordinates when canvas is clicked', () => {
      const handleClick = vi.fn();
      const { container } = render(
        <BrowserView
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          onMouseClick={handleClick}
          onKeyPress={() => {}}
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
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          onMouseClick={() => {}}
          onKeyPress={handleKeyPress}
        />
      );

      const wrapper = container.querySelector('[tabindex]');
      expect(wrapper).toBeInTheDocument();

      fireEvent.keyDown(wrapper!, { key: 'a' });

      expect(handleKeyPress).toHaveBeenCalledWith('a');
    });

    it('should not call handlers when inactive', () => {
      const handleClick = vi.fn();
      const handleKeyPress = vi.fn();
      render(
        <BrowserView
          frame={null}
          isActive={false}
          onMouseClick={handleClick}
          onKeyPress={handleKeyPress}
        />
      );

      // Try to interact with inactive view
      const overlay = screen.getByText(/Browser not active/i);
      fireEvent.click(overlay);
      fireEvent.keyDown(overlay, { key: 'a' });

      expect(handleClick).not.toHaveBeenCalled();
      expect(handleKeyPress).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('should show loading indicator when active but no frame yet', () => {
      render(
        <BrowserView
          frame={null}
          isActive={true}
          onMouseClick={() => {}}
          onKeyPress={() => {}}
        />
      );
      // Should show some loading state, not "not active"
      expect(screen.queryByText(/Browser not active/i)).not.toBeInTheDocument();
    });
  });
});
