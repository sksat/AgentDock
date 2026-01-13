export type SessionView = 'stream' | 'browser';

export interface ViewToggleProps {
  /** Currently active view */
  currentView: SessionView;
  /** Called when view is toggled */
  onToggle: (view: SessionView) => void;
}

/**
 * ViewToggle provides buttons to switch between message stream and browser view.
 */
export function ViewToggle({ currentView, onToggle }: ViewToggleProps) {
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
        className={`px-3 py-1 text-sm rounded transition-colors ${
          currentView === 'browser'
            ? 'bg-accent-primary text-white'
            : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
        }`}
      >
        Browser
      </button>
    </div>
  );
}
