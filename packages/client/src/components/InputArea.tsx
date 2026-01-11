import { useState, useCallback, type KeyboardEvent } from 'react';
import clsx from 'clsx';

export interface InputAreaProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputArea({
  onSend,
  disabled = false,
  placeholder = 'メッセージを入力...',
}: InputAreaProps) {
  const [value, setValue] = useState('');

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) {
      onSend(trimmed);
      setValue('');
    }
  }, [value, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="flex gap-3 p-4 bg-bg-secondary border-t border-border">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        className={clsx(
          'flex-1 resize-none rounded-lg px-4 py-3',
          'bg-bg-tertiary text-text-primary placeholder:text-text-secondary',
          'border border-border focus:border-accent-primary focus:outline-none',
          'transition-colors',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />
      <button
        onClick={handleSend}
        disabled={disabled}
        aria-label="送信"
        className={clsx(
          'px-6 py-3 rounded-lg font-medium',
          'bg-accent-primary text-white',
          'hover:bg-accent-primary/90',
          'focus:outline-none focus:ring-2 focus:ring-accent-primary/50',
          'transition-colors',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        送信
      </button>
    </div>
  );
}
