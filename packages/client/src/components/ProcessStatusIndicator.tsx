import { useState, useCallback, useRef, useEffect } from 'react';

export interface ProcessStatusIndicatorProps {
  /** Whether the CLI process is currently doing autonomous work */
  isVibing: boolean;
  /** Called when user confirms stop action */
  onStop: () => void;
}

export function ProcessStatusIndicator({
  isVibing,
  onStop,
}: ProcessStatusIndicatorProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Close confirmation on click outside
  useEffect(() => {
    if (!showConfirm) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        confirmRef.current &&
        !confirmRef.current.contains(e.target as Node)
      ) {
        setShowConfirm(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showConfirm]);

  const handleStopClick = useCallback(() => {
    setShowConfirm(true);
  }, []);

  const handleConfirm = useCallback(() => {
    setShowConfirm(false);
    onStop();
  }, [onStop]);

  const handleCancel = useCallback(() => {
    setShowConfirm(false);
  }, []);

  // Treat undefined/falsy as idle
  if (isVibing) {
    return (
      <div className="relative flex items-center gap-2">
        {/* Status indicator */}
        <span className="flex items-center gap-1.5 px-2 py-1 bg-accent-success/10 text-accent-success rounded-md">
          <span className="w-2 h-2 rounded-full bg-accent-success animate-pulse" />
          <span className="font-medium text-xs">Running</span>
        </span>

        {/* Stop button */}
        <button
          onClick={handleStopClick}
          className="px-2 py-1 text-xs font-medium bg-accent-danger/10 text-accent-danger hover:bg-accent-danger/20 rounded-md transition-colors"
          title="Stop Claude Code process"
        >
          Stop
        </button>

        {/* Confirmation dropdown */}
        {showConfirm && (
          <div
            ref={confirmRef}
            className="absolute top-full left-0 mt-1 z-50 p-3 bg-bg-secondary border border-border rounded-lg shadow-lg min-w-[200px]"
          >
            <p className="text-sm text-text-primary mb-3">
              Stop Claude Code process?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleCancel}
                className="px-3 py-1 text-xs bg-bg-tertiary text-text-secondary hover:bg-bg-primary rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-3 py-1 text-xs bg-accent-danger text-white hover:bg-accent-danger/90 rounded-md transition-colors"
              >
                Stop
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Idle state
  return (
    <span className="flex items-center gap-1.5 px-2 py-1 bg-bg-tertiary text-text-secondary rounded-md">
      <span className="w-2 h-2 rounded-full bg-text-secondary" />
      <span className="font-medium text-xs">Idle</span>
    </span>
  );
}
