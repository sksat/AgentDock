import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import clsx from 'clsx';

// Detect home directory from paths (e.g., /home/user or /Users/user)
function detectHomeDir(paths: string[]): string | null {
  for (const path of paths) {
    // Linux: /home/<user>/...
    const linuxMatch = path.match(/^(\/home\/[^/]+)/);
    if (linuxMatch) return linuxMatch[1];
    // macOS: /Users/<user>/...
    const macMatch = path.match(/^(\/Users\/[^/]+)/);
    if (macMatch) return macMatch[1];
  }
  return null;
}

// Format path for display (replace home dir with ~)
function formatPathDisplay(path: string, homeDir: string | null): string {
  if (!homeDir) return path;
  if (path.startsWith(homeDir)) {
    return '~' + path.slice(homeDir.length);
  }
  return path;
}

export interface WorkingDirectorySelectorProps {
  /** Current working directory value */
  value: string;
  /** Called when working directory changes */
  onChange: (dir: string) => void;
  /** List of recent directories to show in dropdown */
  recentDirectories?: string[];
  /** Placeholder text */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function WorkingDirectorySelector({
  value,
  onChange,
  recentDirectories = [],
  placeholder = 'Default (new directory)',
  disabled = false,
  className,
}: WorkingDirectorySelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect home directory from recent directories
  const homeDir = useMemo(() => detectHomeDir(recentDirectories), [recentDirectories]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle directory selection from dropdown
  const handleSelectDir = useCallback(
    (dir: string) => {
      onChange(dir);
      setIsDropdownOpen(false);
    },
    [onChange]
  );

  // Handle input focus
  const handleFocus = useCallback(() => {
    if (recentDirectories.length > 0) {
      setIsDropdownOpen(true);
    }
  }, [recentDirectories.length]);

  // Toggle dropdown
  const handleToggleDropdown = useCallback(() => {
    if (recentDirectories.length > 0) {
      setIsDropdownOpen((prev) => !prev);
    }
  }, [recentDirectories.length]);

  return (
    <div className={clsx('relative', className)} ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className={clsx(
            'w-full px-4 py-2 pr-10 rounded-lg',
            'bg-bg-tertiary text-text-primary placeholder:text-text-secondary',
            'border border-border',
            'focus:outline-none focus:ring-2 focus:ring-accent-primary/50',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        />
        {/* Dropdown arrow */}
        <button
          type="button"
          onClick={handleToggleDropdown}
          disabled={disabled || recentDirectories.length === 0}
          className={clsx(
            'absolute right-2 top-1/2 -translate-y-1/2 p-1',
            'text-text-secondary hover:text-text-primary',
            (disabled || recentDirectories.length === 0) && 'opacity-50 cursor-not-allowed'
          )}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Dropdown menu */}
      {isDropdownOpen && recentDirectories.length > 0 && (
        <div
          role="listbox"
          className="absolute z-10 w-full mt-1 py-1 bg-bg-secondary border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {recentDirectories.map((dir) => (
            <button
              key={dir}
              onClick={() => handleSelectDir(dir)}
              title={dir}
              className={clsx(
                'w-full px-4 py-2 text-left text-sm',
                'hover:bg-bg-tertiary transition-colors',
                value === dir ? 'text-accent-primary' : 'text-text-primary'
              )}
            >
              {formatPathDisplay(dir, homeDir)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
