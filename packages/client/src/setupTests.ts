import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock @tanstack/react-virtual for jsdom tests
// jsdom doesn't have a layout engine, so the virtualizer can't calculate
// which items to render. This mock renders all items without virtualization.
// For actual virtualization testing, use Playwright E2E tests.
vi.mock('@tanstack/react-virtual', async () => {
  const { useRef, useCallback, useMemo } = await import('react');

  interface VirtualItem {
    index: number;
    key: string | number;
    start: number;
    end: number;
    size: number;
  }

  return {
    useVirtualizer: <T extends Element>(options: {
      count: number;
      getScrollElement: () => T | null;
      estimateSize: (index: number) => number;
      overscan?: number;
      getItemKey?: (index: number) => string | number;
    }) => {
      const { count, estimateSize, getItemKey } = options;
      const measuredSizes = useRef<Map<number, number>>(new Map());

      // Calculate virtual items for all messages (no virtualization in mock)
      const virtualItems = useMemo((): VirtualItem[] => {
        const items: VirtualItem[] = [];
        let offset = 0;

        for (let i = 0; i < count; i++) {
          const size = measuredSizes.current.get(i) ?? estimateSize(i);
          // Use getItemKey if provided for stable keys, otherwise use index
          const key = getItemKey ? getItemKey(i) : i;
          items.push({
            index: i,
            key,
            start: offset,
            end: offset + size,
            size,
          });
          offset += size;
        }

        return items;
      }, [count, estimateSize, getItemKey]);

      // Calculate total size
      const totalSize = useMemo(() => {
        if (virtualItems.length === 0) return 0;
        const lastItem = virtualItems[virtualItems.length - 1];
        return lastItem.end;
      }, [virtualItems]);

      // Measure element callback
      const measureElement = useCallback((element: Element | null) => {
        if (!element) return;
        const index = parseInt(element.getAttribute('data-index') ?? '-1', 10);
        if (index >= 0) {
          const rect = element.getBoundingClientRect();
          if (rect.height > 0) {
            measuredSizes.current.set(index, rect.height);
          }
        }
      }, []);

      // Scroll to index - simulate scrolling behavior for jsdom tests
      // For align: 'end' at last index, this sets scrollTop = scrollHeight
      // which matches the old non-virtualized behavior that tests expect
      const scrollToIndex = useCallback((index: number, opts?: { align?: string; behavior?: string }) => {
        const scrollElement = options.getScrollElement();
        if (!scrollElement) return;

        if (opts?.align === 'end' && index === count - 1) {
          // Scrolling to end of last item = scroll to bottom
          scrollElement.scrollTop = scrollElement.scrollHeight;
        } else {
          // For other cases, calculate based on estimated sizes
          let targetOffset = 0;
          for (let i = 0; i < index; i++) {
            targetOffset += measuredSizes.current.get(i) ?? estimateSize(i);
          }
          scrollElement.scrollTop = Math.max(0, targetOffset);
        }
      }, [options, count, estimateSize]);

      return {
        getVirtualItems: () => virtualItems,
        getTotalSize: () => totalSize,
        measureElement,
        scrollToIndex,
      };
    },
  };
});

// Mock getBoundingClientRect for virtualization tests
// jsdom doesn't have layout calculations, so we need to provide dimensions
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  // Scroll container for MessageStream
  if (this.classList.contains('overflow-y-auto')) {
    return {
      top: 0, left: 0, bottom: 600, right: 800,
      width: 800, height: 600, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  }
  // Virtualized items
  if (this.hasAttribute('data-index')) {
    return {
      top: 0, left: 0, bottom: 100, right: 800,
      width: 800, height: 100, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  }
  // Message items
  if (this.getAttribute('data-testid') === 'message-item') {
    return {
      top: 0, left: 0, bottom: 100, right: 800,
      width: 800, height: 100, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  }
  // Fall back to original for other elements
  return originalGetBoundingClientRect.call(this);
};

// Mock scrollHeight and clientHeight for virtualization
Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
  configurable: true,
  get() {
    if (this.classList.contains('overflow-y-auto')) {
      return 10000; // Large scrollable area
    }
    return 0;
  },
});

Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get() {
    if (this.classList.contains('overflow-y-auto')) {
      return 600; // Viewport height
    }
    return 0;
  },
});

// Mock matchMedia for uplot tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver for uplot tests
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = MockResizeObserver;

// Mock Path2D for uplot tests
class MockPath2D {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_path?: string | MockPath2D) {}
  addPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  rect() {}
}
(window as unknown as { Path2D: typeof MockPath2D }).Path2D = MockPath2D;

// Mock HTMLCanvasElement.getContext for uplot tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
HTMLCanvasElement.prototype.getContext = function (): any {
  return {
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => ({ data: [] }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    fillText: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    arc: () => {},
    fill: () => {},
    measureText: () => ({ width: 0 }),
    transform: () => {},
    rect: () => {},
    clip: () => {},
    setLineDash: () => {},
    getLineDash: () => [],
  } as unknown as CanvasRenderingContext2D;
};
