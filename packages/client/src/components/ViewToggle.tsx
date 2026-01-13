export type SessionView = 'stream' | 'browser';

export interface ViewToggleProps {
  /** Currently active view */
  currentView: SessionView;
  /** Called when view is toggled */
  onToggle: (view: SessionView) => void;
  /** Whether the browser session is active (enables/disables browser button) */
  browserActive: boolean;
  /** Called to start browser session */
  onStartBrowser?: () => void;
  /** Called to stop browser session */
  onStopBrowser?: () => void;
}

/**
 * ViewToggle provides buttons to switch between message stream and browser view.
 * The browser button is disabled when no browser session is active.
 */
export function ViewToggle({ currentView, onToggle, browserActive, onStartBrowser, onStopBrowser }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 bg-bg-tertiary rounded-md p-1">
        <button
          onClick={() => onToggle('stream')}
          className={`px-3 py-1 text-sm rounded transition-colors ${
            currentView === 'stream'
              ? 'bg-accent-primary text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
          }`}
        >
          Stream
        </button>
        <button
          onClick={() => onToggle('browser')}
          disabled={!browserActive}
          className={`px-3 py-1 text-sm rounded transition-colors ${
            currentView === 'browser'
              ? 'bg-accent-primary text-white'
              : browserActive
                ? 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                : 'text-text-disabled cursor-not-allowed'
          }`}
        >
          Browser
        </button>
      </div>
      {/* Browser control button */}
      {!browserActive ? (
        <button
          onClick={onStartBrowser}
          className="px-2 py-1 text-xs rounded bg-accent-success/20 text-accent-success hover:bg-accent-success/30 transition-colors"
        >
          Start Browser
        </button>
      ) : (
        <button
          onClick={onStopBrowser}
          className="px-2 py-1 text-xs rounded bg-accent-danger/20 text-accent-danger hover:bg-accent-danger/30 transition-colors"
        >
          Stop Browser
        </button>
      )}
    </div>
  );
}
