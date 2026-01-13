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
  /** Current page title */
  browserTitle?: string;
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
  /** Called to navigate back */
  onNavigateBack?: () => void;
  /** Called to navigate forward */
  onNavigateForward?: () => void;
  /** Called to refresh the page */
  onRefresh?: () => void;
  /** Called when user enters a URL to navigate */
  onNavigate?: (url: string) => void;
}

/**
 * BrowserView displays a live browser screen stream and handles user interactions.
 * It renders frames as images on a canvas and captures mouse/keyboard events.
 */
export function BrowserView({
  frame,
  isActive,
  browserUrl,
  browserTitle,
  cursor,
  onMouseClick,
  onKeyPress,
  onScroll,
  onMouseMove,
  onStartBrowser,
  onStopBrowser,
  onNavigateBack,
  onNavigateForward,
  onRefresh,
  onNavigate,
}: BrowserViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);
  const browserWindowRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [editedUrl, setEditedUrl] = useState('');

  // Chrome height (title bar + nav bar) - approximate
  const CHROME_HEIGHT = 72;

  // Calculate canvas display size based on container size while maintaining aspect ratio
  useEffect(() => {
    const container = outerContainerRef.current;
    if (!container || !frame) return;

    const updateSize = () => {
      const containerRect = container.getBoundingClientRect();
      // Account for padding (p-4 = 16px * 2 = 32px) and chrome height
      const availableWidth = containerRect.width - 32;
      const availableHeight = containerRect.height - 32 - CHROME_HEIGHT;

      const frameWidth = frame.metadata.deviceWidth;
      const frameHeight = frame.metadata.deviceHeight;
      const aspectRatio = frameWidth / frameHeight;

      let displayWidth: number;
      let displayHeight: number;

      // Fit within available space while maintaining aspect ratio
      if (availableWidth / availableHeight > aspectRatio) {
        // Container is wider than frame aspect ratio - height is limiting
        displayHeight = Math.max(100, availableHeight);
        displayWidth = displayHeight * aspectRatio;
      } else {
        // Container is taller than frame aspect ratio - width is limiting
        displayWidth = Math.max(200, availableWidth);
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
  }, [frame, CHROME_HEIGHT]);

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

  // Handle URL bar click to start editing
  const handleUrlBarClick = useCallback(() => {
    if (!onNavigate) return;
    setEditedUrl(browserUrl || '');
    setIsEditingUrl(true);
    // Focus the input after state update
    setTimeout(() => urlInputRef.current?.select(), 0);
  }, [browserUrl, onNavigate]);

  // Handle URL input change
  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedUrl(e.target.value);
  }, []);

  // Handle URL input key down
  const handleUrlKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onNavigate && editedUrl.trim()) {
        // Add protocol if missing
        let url = editedUrl.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        onNavigate(url);
      }
      setIsEditingUrl(false);
    } else if (e.key === 'Escape') {
      setIsEditingUrl(false);
    }
    // Stop propagation to prevent browser view key handler from firing
    e.stopPropagation();
  }, [editedUrl, onNavigate]);

  // Handle URL input blur
  const handleUrlBlur = useCallback(() => {
    setIsEditingUrl(false);
  }, []);

  // Prevent browser back/forward navigation when browser view is active
  // Uses History API as fallback since mouse event interception is unreliable
  useEffect(() => {
    if (!isActive) return;

    const container = browserWindowRef.current;
    if (!container) return;

    // Track if mouse is over the container
    let isMouseOver = false;

    // Push history state to prevent back navigation
    const historyState = { browserViewActive: true, timestamp: Date.now() };
    history.pushState(historyState, '');

    // Handle popstate - if navigation was triggered while mouse is over browser view,
    // push state again to prevent leaving
    const handlePopState = () => {
      if (isMouseOver) {
        history.pushState(historyState, '');
      }
    };

    const handleMouseEnter = () => {
      isMouseOver = true;
    };

    const handleMouseLeave = () => {
      isMouseOver = false;
    };

    // Prevent back/forward mouse button navigation at window level
    const preventBackForward = (e: MouseEvent | PointerEvent) => {
      // button 3 = back, 4 = forward
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    // Add event listeners
    window.addEventListener('popstate', handlePopState);
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);

    // Use window-level listeners with capture for best chance of interception
    window.addEventListener('mousedown', preventBackForward, { capture: true });
    window.addEventListener('mouseup', preventBackForward, { capture: true });
    window.addEventListener('pointerdown', preventBackForward, { capture: true });
    window.addEventListener('pointerup', preventBackForward, { capture: true });
    window.addEventListener('auxclick', preventBackForward, { capture: true });

    return () => {
      window.removeEventListener('popstate', handlePopState);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mousedown', preventBackForward, { capture: true });
      window.removeEventListener('mouseup', preventBackForward, { capture: true });
      window.removeEventListener('pointerdown', preventBackForward, { capture: true });
      window.removeEventListener('pointerup', preventBackForward, { capture: true });
      window.removeEventListener('auxclick', preventBackForward, { capture: true });
    };
  }, [isActive]);

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

  // Helper to get display URL (truncate long URLs)
  const displayUrl = browserUrl || 'about:blank';
  const isSecure = displayUrl.startsWith('https://');

  return (
    <div ref={outerContainerRef} className="flex-1 flex items-center justify-center overflow-hidden bg-bg-secondary p-4">
      {/* Browser window container - unified chrome + canvas */}
      <div
        ref={browserWindowRef}
        className="flex flex-col rounded-lg border border-border shadow-lg overflow-hidden"
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
        }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Browser chrome */}
        <div className="bg-bg-tertiary flex-shrink-0" style={{ width: canvasSize?.width ?? 'auto' }}>
          {/* Title bar */}
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-border/50">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-sm">🌐</span>
              <span className="text-sm text-text-primary truncate">
                {browserTitle || 'New Tab'}
              </span>
            </div>
            <button
              onClick={onStopBrowser}
              className="p-1 rounded hover:bg-bg-secondary/50 text-text-secondary hover:text-accent-danger transition-colors"
              title="Close browser"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation bar */}
          <div className="px-2 py-1.5 flex items-center gap-1">
            {/* Navigation buttons */}
            <button
              onClick={onNavigateBack}
              disabled={!onNavigateBack}
              className="p-1.5 rounded hover:bg-bg-secondary/50 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Go back"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={onNavigateForward}
              disabled={!onNavigateForward}
              className="p-1.5 rounded hover:bg-bg-secondary/50 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Go forward"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={onRefresh}
              disabled={!onRefresh}
              className="p-1.5 rounded hover:bg-bg-secondary/50 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* URL bar */}
            <div
              className={`flex-1 flex items-center gap-2 px-3 py-1 bg-bg-primary rounded border mx-1 min-w-0 ${
                isEditingUrl ? 'border-accent-primary' : 'border-border'
              } ${onNavigate ? 'cursor-text' : ''}`}
              onClick={handleUrlBarClick}
            >
              {isSecure ? (
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-text-disabled flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {isEditingUrl ? (
                <input
                  ref={urlInputRef}
                  type="text"
                  value={editedUrl}
                  onChange={handleUrlChange}
                  onKeyDown={handleUrlKeyDown}
                  onBlur={handleUrlBlur}
                  className="flex-1 text-sm text-text-primary font-mono bg-transparent outline-none min-w-0"
                  placeholder="Enter URL..."
                />
              ) : (
                <span className="text-sm text-text-primary font-mono truncate">
                  {displayUrl}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onClick={handleClick}
          onWheel={handleWheel}
          onMouseMove={handleMouseMove}
          onContextMenu={handleContextMenu}
          className="block"
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
