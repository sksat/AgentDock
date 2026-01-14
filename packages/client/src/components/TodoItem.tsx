import clsx from 'clsx';
import type { TodoItem as TodoItemType } from '@anthropic/claude-bridge-shared';

interface TodoItemProps {
  todo: TodoItemType;
  compact?: boolean;
  /** Called when the task is clicked (used for scrolling to the task's update in the stream) */
  onClick?: () => void;
}

// Checkbox icons
const CheckboxEmpty = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
  </svg>
);

const CheckboxInProgress = () => (
  <svg className="w-4 h-4 animate-pulse" fill="none" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth={2} />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </svg>
);

const CheckboxChecked = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} fill="currentColor" fillOpacity={0.1} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
  </svg>
);

export function TodoItem({ todo, compact = false, onClick }: TodoItemProps) {
  const { content, status, activeForm } = todo;

  // For in_progress, show activeForm if available, otherwise fallback to content
  const displayText =
    status === 'in_progress' && activeForm ? activeForm : content;

  const statusIcon = {
    pending: <span className="text-text-secondary"><CheckboxEmpty /></span>,
    in_progress: <span className="text-accent-warning"><CheckboxInProgress /></span>,
    completed: <span className="text-accent-success"><CheckboxChecked /></span>,
  };

  const isClickable = !!onClick;

  return (
    <div
      className={clsx(
        'flex items-start gap-2 rounded',
        compact ? 'py-0.5' : 'py-1.5 px-2 hover:bg-bg-tertiary',
        isClickable && 'cursor-pointer'
      )}
      data-testid="todo-indicator"
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <span className="flex-shrink-0 mt-0.5">
        {statusIcon[status] || statusIcon.pending}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className={clsx(
            'text-sm break-words',
            status === 'completed' && 'line-through text-text-secondary'
          )}
        >
          {displayText || content || '(empty task)'}
        </div>
      </div>
    </div>
  );
}
