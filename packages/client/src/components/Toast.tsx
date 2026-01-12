import { useEffect } from 'react';
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

  const dotColors = {
    info: 'bg-accent-primary',
    success: 'bg-accent-success',
    warning: 'bg-accent-warning',
    error: 'bg-accent-danger',
  };

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div
        className={clsx(
          'rounded-lg bg-bg-secondary/95 backdrop-blur-sm shadow-lg border border-border',
          'px-4 py-2.5 flex items-center gap-3'
        )}
        onClick={onClose}
        role="button"
        tabIndex={0}
      >
        {/* Status dot */}
        <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', dotColors[type])} />

        {/* Content */}
        <div className="flex items-baseline gap-2">
          {title && (
            <span className="text-text-primary font-medium">{title}</span>
          )}
          <span className="text-text-secondary text-sm whitespace-pre-line">{message}</span>
        </div>
      </div>
    </div>
  );
}
