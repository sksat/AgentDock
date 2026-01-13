import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserView } from '../BrowserView';
import type { ScreencastMetadata } from '@agent-dock/shared';

// Mock frame data (1x1 red pixel PNG in base64)
const mockFrameData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

const mockMetadata: ScreencastMetadata = {
  deviceWidth: 1280,
  deviceHeight: 720,
  timestamp: Date.now(),
};

// Different aspect ratio metadata for testing
const wideMetadata: ScreencastMetadata = {
  deviceWidth: 1920,
  deviceHeight: 1080,
  timestamp: Date.now(),
};

const defaultProps = {
  frame: null,
  isActive: false,
  cursor: undefined,
  onMouseClick: vi.fn(),
  onKeyPress: vi.fn(),
  onScroll: vi.fn(),
  onMouseMove: vi.fn(),
  onStartBrowser: vi.fn(),
  onStopBrowser: vi.fn(),
};

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock history.pushState
const originalPushState = history.pushState;
beforeEach(() => {
  history.pushState = vi.fn();
});
afterEach(() => {
  history.pushState = originalPushState;
});

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

  describe('scroll handling', () => {
    it('should call onScroll with delta values when wheel event fires', () => {
      const handleScroll = vi.fn();
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          onScroll={handleScroll}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeInTheDocument();

      fireEvent.wheel(canvas!, { deltaX: 10, deltaY: 20 });

      expect(handleScroll).toHaveBeenCalledWith({ deltaX: 10, deltaY: 20 });
    });

    it('should not call onScroll when not active', () => {
      const handleScroll = vi.fn();
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={false}
          onScroll={handleScroll}
        />
      );

      const canvas = container.querySelector('canvas');
      // When not active but has frame, still renders canvas
      if (canvas) {
        fireEvent.wheel(canvas, { deltaX: 10, deltaY: 20 });
        expect(handleScroll).not.toHaveBeenCalled();
      }
    });
  });

  describe('mouse move handling', () => {
    it('should call onMouseMove with coordinates when mouse moves over canvas', () => {
      const handleMouseMove = vi.fn();
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          onMouseMove={handleMouseMove}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeInTheDocument();

      fireEvent.mouseMove(canvas!, { clientX: 50, clientY: 100 });

      expect(handleMouseMove).toHaveBeenCalled();
      const { x, y } = handleMouseMove.mock.calls[0][0];
      expect(typeof x).toBe('number');
      expect(typeof y).toBe('number');
    });

    it('should not call onMouseMove when not active', () => {
      const handleMouseMove = vi.fn();
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={false}
          onMouseMove={handleMouseMove}
        />
      );

      const canvas = container.querySelector('canvas');
      if (canvas) {
        fireEvent.mouseMove(canvas, { clientX: 50, clientY: 100 });
        expect(handleMouseMove).not.toHaveBeenCalled();
      }
    });
  });

  describe('cursor synchronization', () => {
    it('should apply cursor style from props to canvas', () => {
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          cursor="pointer"
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toHaveStyle({ cursor: 'pointer' });
    });

    it('should use default cursor when cursor prop is undefined', () => {
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          cursor={undefined}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toHaveStyle({ cursor: 'default' });
    });

    it('should update cursor when prop changes', () => {
      const { container, rerender } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          cursor="default"
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toHaveStyle({ cursor: 'default' });

      rerender(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          cursor="text"
        />
      );

      expect(canvas).toHaveStyle({ cursor: 'text' });
    });
  });

  describe('context menu prevention', () => {
    it('should prevent context menu on right-click when active', () => {
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toBeInTheDocument();

      const event = new MouseEvent('contextmenu', { bubbles: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      canvas!.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('browser navigation prevention', () => {
    it('should push history state when browser view becomes active', () => {
      render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
        />
      );

      expect(history.pushState).toHaveBeenCalled();
    });

    it('should not push history state when inactive', () => {
      render(
        <BrowserView
          {...defaultProps}
          frame={null}
          isActive={false}
        />
      );

      expect(history.pushState).not.toHaveBeenCalled();
    });

    it('should add window event listeners for back/forward button capture when active', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
        />
      );

      // Should have added listeners for popstate, mousedown, mouseup, pointerdown, pointerup, auxclick
      const eventTypes = addEventListenerSpy.mock.calls.map(call => call[0]);
      expect(eventTypes).toContain('popstate');
      expect(eventTypes).toContain('mousedown');
      expect(eventTypes).toContain('mouseup');
      expect(eventTypes).toContain('auxclick');
    });

    it('should remove event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
        />
      );

      unmount();

      const eventTypes = removeEventListenerSpy.mock.calls.map(call => call[0]);
      expect(eventTypes).toContain('popstate');
      expect(eventTypes).toContain('mousedown');
      expect(eventTypes).toContain('mouseup');
    });
  });

  describe('keyboard event handling', () => {
    it('should call onKeyPress for various keys', () => {
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

      // Test various keys
      fireEvent.keyDown(wrapper!, { key: 'Enter' });
      expect(handleKeyPress).toHaveBeenCalledWith('Enter');

      fireEvent.keyDown(wrapper!, { key: 'Escape' });
      expect(handleKeyPress).toHaveBeenCalledWith('Escape');

      fireEvent.keyDown(wrapper!, { key: 'ArrowUp' });
      expect(handleKeyPress).toHaveBeenCalledWith('ArrowUp');
    });

    it('should not prevent default for Ctrl+key combinations', () => {
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

      const event = new KeyboardEvent('keydown', {
        key: 'c',
        ctrlKey: true,
        bubbles: true
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      wrapper!.dispatchEvent(event);

      // Ctrl+key should not prevent default (allow browser shortcuts)
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should not call onKeyPress when not active', () => {
      const handleKeyPress = vi.fn();
      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={false}
          onKeyPress={handleKeyPress}
        />
      );

      // When not active but has frame, the component might still render
      // but shouldn't respond to key events
      const wrapper = container.querySelector('[tabindex]');
      if (wrapper) {
        fireEvent.keyDown(wrapper, { key: 'a' });
        expect(handleKeyPress).not.toHaveBeenCalled();
      }
    });
  });

  describe('canvas dimensions', () => {
    it('should set canvas buffer dimensions from frame metadata', () => {
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

    it('should update canvas dimensions when frame metadata changes', () => {
      const { container, rerender } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toHaveAttribute('width', '1280');
      expect(canvas).toHaveAttribute('height', '720');

      rerender(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: wideMetadata }}
          isActive={true}
        />
      );

      expect(canvas).toHaveAttribute('width', '1920');
      expect(canvas).toHaveAttribute('height', '1080');
    });
  });

  describe('URL bar display', () => {
    it('should show about:blank when no URL is provided', () => {
      render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          browserUrl={undefined}
        />
      );

      expect(screen.getByText('about:blank')).toBeInTheDocument();
    });

    it('should display the provided URL', () => {
      render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
          browserUrl="https://example.com/page"
        />
      );

      expect(screen.getByText('https://example.com/page')).toBeInTheDocument();
    });
  });

  describe('robustness', () => {
    it('should handle frame with different dimensions gracefully', () => {
      const smallMetadata: ScreencastMetadata = {
        deviceWidth: 320,
        deviceHeight: 240,
        timestamp: Date.now(),
      };

      const { container } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: smallMetadata }}
          isActive={true}
        />
      );

      const canvas = container.querySelector('canvas');
      expect(canvas).toHaveAttribute('width', '320');
      expect(canvas).toHaveAttribute('height', '240');
    });

    it('should not crash when clicking canvas with no bounding rect', () => {
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

      // This should not throw even if canvas rect is unusual
      expect(() => {
        fireEvent.click(canvas!, { clientX: 0, clientY: 0 });
      }).not.toThrow();
    });

    it('should handle rapid frame updates without crashing', () => {
      const { rerender } = render(
        <BrowserView
          {...defaultProps}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
          isActive={true}
        />
      );

      // Simulate rapid frame updates
      for (let i = 0; i < 10; i++) {
        expect(() => {
          rerender(
            <BrowserView
              {...defaultProps}
              frame={{
                data: mockFrameData,
                metadata: { ...mockMetadata, timestamp: Date.now() + i }
              }}
              isActive={true}
            />
          );
        }).not.toThrow();
      }
    });
  });

  describe('state transitions', () => {
    it('should transition from inactive to loading to active', () => {
      const { rerender } = render(
        <BrowserView {...defaultProps} isActive={false} frame={null} />
      );

      // Initially inactive
      expect(screen.getByText(/Browser not active/i)).toBeInTheDocument();

      // Transition to loading (active but no frame)
      rerender(
        <BrowserView {...defaultProps} isActive={true} frame={null} />
      );
      expect(screen.getByText(/Loading browser view/i)).toBeInTheDocument();

      // Transition to active with frame
      rerender(
        <BrowserView
          {...defaultProps}
          isActive={true}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
        />
      );
      expect(screen.queryByText(/Loading browser view/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Stop Browser/i })).toBeInTheDocument();
    });

    it('should handle stop and restart correctly', () => {
      const { rerender } = render(
        <BrowserView
          {...defaultProps}
          isActive={true}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
        />
      );

      // Active state
      expect(screen.getByRole('button', { name: /Stop Browser/i })).toBeInTheDocument();

      // Stop browser
      rerender(
        <BrowserView {...defaultProps} isActive={false} frame={null} />
      );
      expect(screen.getByRole('button', { name: /Start Browser/i })).toBeInTheDocument();

      // Restart browser
      rerender(
        <BrowserView
          {...defaultProps}
          isActive={true}
          frame={{ data: mockFrameData, metadata: mockMetadata }}
        />
      );
      expect(screen.getByRole('button', { name: /Stop Browser/i })).toBeInTheDocument();
    });
  });
});
