import { useRef, useEffect, useCallback } from 'react';
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
  /** Called when user clicks on the browser view */
  onMouseClick: (position: { x: number; y: number }) => void;
  /** Called when user presses a key while focused */
  onKeyPress: (key: string) => void;
}

/**
 * BrowserView displays a live browser screen stream and handles user interactions.
 * It renders frames as images on a canvas and captures mouse/keyboard events.
 */
export function BrowserView({
  frame,
  isActive,
  browserUrl,
  onMouseClick,
  onKeyPress,
}: BrowserViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Inactive state
  if (!isActive && !frame) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-secondary text-text-secondary">
        <div className="text-center">
          <div className="text-4xl mb-2">🌐</div>
          <div>Browser not active</div>
          <div className="text-sm mt-1">Start a browser session to see the view</div>
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
      {/* URL bar */}
      {browserUrl && (
        <div className="px-3 py-2 bg-bg-tertiary border-b border-border flex items-center gap-2">
          <span className="text-text-secondary">🔒</span>
          <span className="text-sm text-text-primary font-mono truncate flex-1">
            {browserUrl}
          </span>
        </div>
      )}

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-auto p-4"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onClick={handleClick}
          className="border border-border rounded shadow-lg cursor-pointer max-w-full max-h-full"
          style={{
            aspectRatio: `${width} / ${height}`,
          }}
        />
      </div>
    </div>
  );
}
