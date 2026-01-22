import { useCallback } from 'react';
import clsx from 'clsx';
import type { RunnerBackend } from '@agent-dock/shared';

export interface RunnerBackendToggleProps {
  /** Current runner backend value */
  value: RunnerBackend;
  /** Called when runner backend changes */
  onChange: (backend: RunnerBackend) => void;
  /** Whether Podman is available on the server */
  podmanAvailable?: boolean;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function RunnerBackendToggle({
  value,
  onChange,
  podmanAvailable = false,
  disabled = false,
  className,
}: RunnerBackendToggleProps) {
  const handleToggle = useCallback(() => {
    onChange(value === 'native' ? 'podman' : 'native');
  }, [value, onChange]);

  // Don't render if Podman is not available
  if (!podmanAvailable) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={disabled}
      title={value === 'podman' ? 'Running with Podman' : 'Running natively'}
      className={clsx(
        'flex items-center gap-3 px-3 py-2 rounded-lg',
        'bg-bg-tertiary border border-border',
        'hover:bg-bg-tertiary/80 transition-colors',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <svg
          className="w-4 h-4 text-text-secondary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
        <span className="text-sm font-medium text-text-primary">{value}</span>
      </div>
      <div
        data-testid="toggle-switch"
        className={clsx(
          'w-9 h-5 rounded-full p-0.5 transition-colors',
          value === 'podman' ? 'bg-accent-primary' : 'bg-gray-600'
        )}
      >
        <div
          className={clsx(
            'w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
            value === 'podman' ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </div>
    </button>
  );
}
