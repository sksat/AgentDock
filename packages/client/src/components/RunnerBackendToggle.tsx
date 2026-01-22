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
        'flex items-center gap-2 px-2 py-1 rounded-lg whitespace-nowrap',
        'bg-bg-tertiary border border-border',
        'hover:bg-bg-tertiary/80 transition-colors',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <svg
        className="w-3.5 h-3.5 text-text-secondary flex-shrink-0"
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
      <span className="text-xs font-medium text-text-primary w-[52px]">{value}</span>
      <div
        data-testid="toggle-switch"
        className={clsx(
          'w-7 h-4 rounded-full p-0.5 transition-colors flex-shrink-0',
          value === 'podman' ? 'bg-accent-primary' : 'bg-gray-600'
        )}
      >
        <div
          className={clsx(
            'w-3 h-3 rounded-full bg-white shadow-sm transition-transform',
            value === 'podman' ? 'translate-x-3' : 'translate-x-0'
          )}
        />
      </div>
    </button>
  );
}
