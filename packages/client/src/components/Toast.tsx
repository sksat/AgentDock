import { useEffect, useCallback } from 'react';
import clsx from 'clsx';

export interface ToastProps {
  message: string;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  duration?: number; // Auto-close duration in ms, 0 = no auto-close
  type?: 'info' | 'success' | 'warning' | 'error';
}

export function Toast({
  message,
  title,
  isOpen,
  onClose,
  duration = 5000,
  type = 'info',
}: ToastProps) {
  // Auto-close after duration
  useEffect(() => {
    if (!isOpen || duration === 0) return;

    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [isOpen, duration, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const typeStyles = {
    info: 'border-accent-primary/50 bg-accent-primary/10',
    success: 'border-accent-success/50 bg-accent-success/10',
    warning: 'border-accent-warning/50 bg-accent-warning/10',
    error: 'border-accent-danger/50 bg-accent-danger/10',
  };

  const iconColors = {
    info: 'text-accent-primary',
    success: 'text-accent-success',
    warning: 'text-accent-warning',
    error: 'text-accent-danger',
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 animate-slide-up">
      <div
        className={clsx(
          'rounded-lg border shadow-lg backdrop-blur-sm',
          'min-w-[280px] max-w-[400px]',
          typeStyles[type]
        )}
      >
        <div className="flex items-start gap-3 p-4">
          {/* Icon */}
          <div className={clsx('flex-shrink-0 mt-0.5', iconColors[type])}>
            {type === 'info' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {type === 'success' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {type === 'warning' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            {type === 'error' && (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {title && (
              <h4 className="font-medium text-text-primary mb-1">{title}</h4>
            )}
            <p className="text-sm text-text-secondary whitespace-pre-line">{message}</p>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded hover:bg-bg-tertiary transition-colors text-text-secondary hover:text-text-primary"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
