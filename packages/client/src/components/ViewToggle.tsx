export type SessionView = 'stream' | 'browser';

export interface ViewToggleProps {
  /** Currently active view */
  currentView: SessionView;
  /** Called when view is toggled */
  onToggle: (view: SessionView) => void;
  /** Whether the browser session is active (enables/disables browser button) */
  browserActive: boolean;
}

/**
 * ViewToggle provides buttons to switch between message stream and browser view.
 * The browser button is disabled when no browser session is active.
 */
export function ViewToggle({ currentView, onToggle, browserActive }: ViewToggleProps) {
  return (
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
  );
}
