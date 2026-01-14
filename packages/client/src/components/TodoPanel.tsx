import { useState } from 'react';
import clsx from 'clsx';
import type { TodoItem as TodoItemType } from '@anthropic/claude-bridge-shared';
import { TodoItem } from './TodoItem';

// Chevron Left icon
const ChevronLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

// Chevron Right icon
const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

// List icon (for ToDo)
const ListIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

// History icon
const HistoryIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

export interface TodoHistoryEntry {
  id: string;
  timestamp: string;
  todos: TodoItemType[];
}

interface TodoPanelProps {
  current: TodoItemType[];
  history: TodoHistoryEntry[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  /** Called when a task is clicked to scroll to its last update in the stream */
  onScrollToUpdate?: (toolUseId: string) => void;
}

/**
 * Describe what changed in a history entry compared to the previous one.
 * Returns a human-readable description using task numbers (1-indexed).
 * Example: "task 1: started", "task 2: completed", "task 3: added"
 * For the first entry, returns "ToDo list created" instead of listing all added tasks.
 */
function describeChanges(
  entry: TodoHistoryEntry,
  prevEntry: TodoHistoryEntry | undefined
): string {
  // First entry: all tasks are new, show simple message
  if (!prevEntry) {
    return 'ToDo created';
  }

  const changes: string[] = [];

  for (let i = 0; i < entry.todos.length; i++) {
    const task = entry.todos[i];
    if (!task.content) continue;

    const taskNum = i + 1; // 1-indexed for display
    const prevTask = prevEntry.todos.find((t) => t.content === task.content);

    if (!prevTask) {
      // New task added
      changes.push(`task ${taskNum}: added`);
    } else if (prevTask.status !== task.status) {
      // Status changed
      const statusLabel = {
        pending: 'pending',
        in_progress: 'started',
        completed: 'completed',
      };
      changes.push(`task ${taskNum}: ${statusLabel[task.status] || task.status}`);
    }
  }

  // Check for removed tasks (use previous index)
  for (let i = 0; i < prevEntry.todos.length; i++) {
    const prevTask = prevEntry.todos[i];
    if (!prevTask.content) continue;
    const stillExists = entry.todos.some((t) => t.content === prevTask.content);
    if (!stillExists) {
      changes.push(`task ${i + 1}: removed`);
    }
  }

  return changes.length > 0 ? changes.join(', ') : 'Updated tasks';
}

/**
 * Find the history entry where a task was last updated (status changed).
 * Returns the toolUseId of that entry, or undefined if not found.
 */
function findLastUpdateForTask(
  taskContent: string,
  history: TodoHistoryEntry[]
): string | undefined {
  // Walk through history from newest to oldest
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    const task = entry.todos.find((t) => t.content === taskContent);
    if (!task) continue;

    // Check if this is where the status changed
    if (i > 0) {
      const prevEntry = history[i - 1];
      const prevTask = prevEntry.todos.find((t) => t.content === taskContent);
      // If task didn't exist before or status changed, this is the update point
      if (!prevTask || prevTask.status !== task.status) {
        return entry.id;
      }
    } else {
      // First entry where task appears
      return entry.id;
    }
  }
  // Fallback to latest entry
  return history.length > 0 ? history[history.length - 1].id : undefined;
}

export function TodoPanel({
  current,
  history,
  isExpanded,
  onToggleExpanded,
  onScrollToUpdate,
}: TodoPanelProps) {
  const [showHistory, setShowHistory] = useState(false);

  // Filter out invalid todos
  const validTodos = (current || []).filter(
    (todo): todo is TodoItemType => todo != null && typeof todo === 'object'
  );

  // Don't render if no todos
  if (validTodos.length === 0) {
    return null;
  }

  const completedCount = validTodos.filter((t) => t.status === 'completed').length;
  const totalCount = validTodos.length;

  // Filter out invalid history entries
  const validHistory = (history || []).filter(
    (entry): entry is TodoHistoryEntry =>
      entry != null &&
      typeof entry === 'object' &&
      Array.isArray(entry.todos)
  );

  if (!isExpanded) {
    // Collapsed state: clickable tab in top-right
    // Position: top-28 (112px) = below global header (48px) + session usage bar (~40px) + margin
    // Both collapsed and expanded states share the same top position for visual consistency
    return (
      <button
        onClick={onToggleExpanded}
        className="fixed right-0 top-28 z-50 flex items-center gap-2 bg-bg-secondary border border-r-0 border-border rounded-l-lg px-2 py-2 hover:bg-bg-tertiary transition-colors shadow-lg"
        aria-label="ToDo"
      >
        <ChevronLeftIcon />
        <span className="text-accent-primary"><ListIcon /></span>
        <span className="text-xs font-medium text-text-primary">
          {completedCount}/{totalCount}
        </span>
      </button>
    );
  }

  // Expanded state: overlay panel (fixed position, max height above input area)
  // Position: top-28 (112px) = below global header (48px) + session usage bar (~40px) + margin
  // Max height: 100vh - 18rem = leaves ~176px at bottom for input area
  // This ensures the panel doesn't overlap with the session's cost display bar or input area
  return (
    <aside className="fixed right-0 top-28 w-80 z-40 flex flex-col bg-bg-secondary border-l border-border shadow-xl rounded-bl-lg max-h-[calc(100vh-18rem)]">
      {/* Header: [ListIcon] ToDo [count] [history] ... [collapse] */}
      {/* History button is placed next to count for quick access to update history */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-accent-primary"><ListIcon /></span>
          <span className="font-medium text-text-primary">ToDo</span>
          <span className="text-xs text-text-secondary bg-bg-tertiary px-2 py-0.5 rounded">
            {completedCount}/{totalCount}
          </span>
          {validHistory.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={clsx(
                'p-1 rounded hover:bg-bg-tertiary transition-colors',
                showHistory && 'bg-bg-tertiary text-accent-primary'
              )}
              aria-label="History"
              title="View history"
            >
              <HistoryIcon />
            </button>
          )}
        </div>
        <button
          onClick={onToggleExpanded}
          className="p-1.5 rounded hover:bg-bg-tertiary transition-colors"
          aria-label="Collapse"
          title="Collapse panel"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!showHistory ? (
          // Current todos
          <div className="p-3 space-y-1">
            {validTodos.map((todo, index) => (
              <TodoItem
                key={index}
                todo={todo}
                // Only enable click-to-scroll for tasks with content
                onClick={onScrollToUpdate && todo.content ? () => {
                  const toolUseId = findLastUpdateForTask(todo.content, validHistory);
                  if (toolUseId) {
                    onScrollToUpdate(toolUseId);
                  }
                } : undefined}
              />
            ))}
          </div>
        ) : (
          // History view
          <div className="p-3 space-y-3">
            {validHistory.length === 0 ? (
              <div className="text-sm text-text-secondary text-center py-4">
                No history yet
              </div>
            ) : (
              validHistory.map((entry, index) => {
                const prevEntry = index > 0 ? validHistory[index - 1] : undefined;
                const changeDescription = describeChanges(entry, prevEntry);

                return (
                <div
                  key={entry.id}
                  className="border border-border rounded-lg overflow-hidden"
                >
                  {/* History entry header - shows what changed, clickable to scroll */}
                  <button
                    onClick={() => onScrollToUpdate?.(entry.id)}
                    className={clsx(
                      'w-full px-3 py-2 bg-bg-tertiary text-xs flex items-center justify-between gap-2 text-left',
                      onScrollToUpdate && 'hover:bg-bg-secondary cursor-pointer transition-colors'
                    )}
                    disabled={!onScrollToUpdate}
                  >
                    <span className="text-text-primary truncate">{changeDescription}</span>
                    <span className="text-text-secondary flex-shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </button>
                  <div className="p-2 space-y-1">
                    {entry.todos.map((todo, idx) => (
                      <TodoItem key={idx} todo={todo} />
                    ))}
                  </div>
                </div>
              );
              })
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
