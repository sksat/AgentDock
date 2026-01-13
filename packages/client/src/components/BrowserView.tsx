import { useRef, useEffect, useCallback, useState } from 'react';
import type { ScreencastMetadata } from '@agent-dock/shared';

export interface BrowserViewFrame {
  data: string;
  metadata: ScreencastMetadata;
}

export interface BrowserViewProps {
  /** Current frame data (null if no frame yet) */
  frame: BrowserViewFrame | null;
  /** Whether the browser session is active */
  isActive: boolean;
  /** Current browser URL */
  browserUrl?: string;
  /** Current cursor style from remote browser */
  cursor?: string;
  /** Called when user clicks on the browser view */
  onMouseClick: (position: { x: number; y: number }) => void;
  /** Called when user presses a key while focused */
  onKeyPress: (key: string) => void;
  /** Called when user scrolls on the browser view */
  onScroll: (delta: { deltaX: number; deltaY: number }) => void;
  /** Called when user moves mouse on the browser view */
  onMouseMove: (position: { x: number; y: number }) => void;
  /** Called to start browser session */
  onStartBrowser: () => void;
  /** Called to stop browser session */
  onStopBrowser: () => void;
}

/**
 * BrowserView displays a live browser screen stream and handles user interactions.
 * It renders frames as images on a canvas and captures mouse/keyboard events.
 */
export function BrowserView({
  frame,
  isActive,
  browserUrl,
  cursor,
  onMouseClick,
  onKeyPress,
  onScroll,
  onMouseMove,
  onStartBrowser,
  onStopBrowser,
}: BrowserViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);

  // Calculate canvas display size based on container size while maintaining aspect ratio
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !frame) return;

    const updateSize = () => {
      const containerRect = container.getBoundingClientRect();
      // Account for padding (p-4 = 16px * 2 = 32px)
      const availableWidth = containerRect.width - 32;
      const availableHeight = containerRect.height - 32;

      const frameWidth = frame.metadata.deviceWidth;
      const frameHeight = frame.metadata.deviceHeight;
      const aspectRatio = frameWidth / frameHeight;

      let displayWidth: number;
      let displayHeight: number;

      // Fit within available space while maintaining aspect ratio
      if (availableWidth / availableHeight > aspectRatio) {
        // Container is wider than frame aspect ratio - height is limiting
        displayHeight = availableHeight;
        displayWidth = displayHeight * aspectRatio;
      } else {
        // Container is taller than frame aspect ratio - width is limiting
        displayWidth = availableWidth;
        displayHeight = displayWidth / aspectRatio;
      }

      setCanvasSize({ width: Math.floor(displayWidth), height: Math.floor(displayHeight) });
    };

    // Initial size calculation
    updateSize();

    // Update on resize
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [frame]);

  // Draw frame to canvas when it changes
  useEffect(() => {
    if (!frame || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = `data:image/jpeg;base64,${frame.data}`;
  }, [frame]);

  // Handle canvas click
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isActive || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      // Calculate click position relative to canvas
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      onMouseClick({ x: Math.round(x), y: Math.round(y) });
    },
    [isActive, onMouseClick]
  );

  // Handle key press
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isActive) return;

      // Prevent default for most keys to avoid browser shortcuts
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
      }

      onKeyPress(e.key);
    },
    [isActive, onKeyPress]
  );

  // Handle scroll (wheel event)
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!isActive) return;

      e.preventDefault();
      onScroll({ deltaX: e.deltaX, deltaY: e.deltaY });
    },
    [isActive, onScroll]
  );

  // Handle mouse move
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isActive || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      // Calculate position relative to canvas
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      onMouseMove({ x: Math.round(x), y: Math.round(y) });
    },
    [isActive, onMouseMove]
  );

  // Prevent context menu on right-click
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isActive) return;
      e.preventDefault();
    },
    [isActive]
  );

  // Set up native event listeners for auxiliary button capture
  // React's synthetic events don't always capture browser navigation gestures
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Prevent back/forward mouse button navigation
    const handleMouseDown = (e: MouseEvent) => {
      // button 3 = back, 4 = forward
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Some browsers use auxclick for navigation
    const handleAuxClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    container.addEventListener('mousedown', handleMouseDown, { capture: true });
    container.addEventListener('mouseup', handleMouseUp, { capture: true });
    container.addEventListener('auxclick', handleAuxClick, { capture: true });

    return () => {
      container.removeEventListener('mousedown', handleMouseDown, { capture: true });
      container.removeEventListener('mouseup', handleMouseUp, { capture: true });
      container.removeEventListener('auxclick', handleAuxClick, { capture: true });
    };
  }, []);

  // Inactive state - show Start Browser button
  if (!isActive && !frame) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-secondary text-text-secondary">
        <div className="text-center">
          <div className="text-6xl mb-4">🌐</div>
          <div className="text-lg mb-2">Browser not active</div>
          <div className="text-sm mb-6 text-text-disabled">
            Start a browser session to view and interact with web pages
          </div>
          <button
            onClick={onStartBrowser}
            className="px-6 py-3 rounded-lg bg-accent-primary text-white hover:bg-accent-primary/80 transition-colors font-medium"
          >
            Start Browser
          </button>
        </div>
      </div>
    );
  }

  // Loading state (active but no frame yet)
  if (isActive && !frame) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-secondary text-text-secondary">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-2">⏳</div>
          <div>Loading browser view...</div>
        </div>
      </div>
    );
  }

  const width = frame?.metadata.deviceWidth ?? 1280;
  const height = frame?.metadata.deviceHeight ?? 720;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-secondary">
      {/* URL bar with Stop button */}
      <div className="px-3 py-2 bg-bg-tertiary border-b border-border flex items-center gap-2">
        <span className="text-text-secondary">🔒</span>
        <span className="text-sm text-text-primary font-mono truncate flex-1">
          {browserUrl || 'about:blank'}
        </span>
        <button
          onClick={onStopBrowser}
          className="px-2 py-1 text-xs rounded bg-accent-danger/20 text-accent-danger hover:bg-accent-danger/30 transition-colors"
        >
          Stop Browser
        </button>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden p-4 min-h-0"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onClick={handleClick}
          onWheel={handleWheel}
          onMouseMove={handleMouseMove}
          onContextMenu={handleContextMenu}
          className="border border-border rounded shadow-lg"
          style={{
            width: canvasSize?.width ?? 'auto',
            height: canvasSize?.height ?? 'auto',
            cursor: cursor || 'default',
          }}
        />
      </div>
    </div>
  );
}
