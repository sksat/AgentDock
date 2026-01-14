import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TodoPanel } from '../TodoPanel';
import type { TodoItem } from '@anthropic/claude-bridge-shared';

const createTodo = (overrides: Partial<TodoItem> = {}): TodoItem => ({
  content: 'Test task',
  status: 'pending',
  activeForm: 'Testing task',
  ...overrides,
});

describe('TodoPanel', () => {
  it('should render collapsed state with task count', () => {
    const todos: TodoItem[] = [
      createTodo({ content: 'Task 1', status: 'completed' }),
      createTodo({ content: 'Task 2', status: 'in_progress' }),
      createTodo({ content: 'Task 3', status: 'pending' }),
    ];

    render(
      <TodoPanel
        current={todos}
        history={[]}
        isExpanded={false}
        onToggleExpanded={vi.fn()}
      />
    );

    // Should show task count (1/3 completed)
    expect(screen.getByText('1/3')).toBeInTheDocument();
    // Should show expand button
    expect(screen.getByRole('button', { name: /todo/i })).toBeInTheDocument();
  });

  it('should render expanded state with all todos', () => {
    const todos: TodoItem[] = [
      createTodo({ content: 'Task 1', status: 'pending' }),
      createTodo({ content: 'Task 2', status: 'in_progress', activeForm: 'Working on Task 2' }),
      createTodo({ content: 'Task 3', status: 'completed' }),
    ];

    render(
      <TodoPanel
        current={todos}
        history={[]}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
      />
    );

    // Should show all tasks
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Working on Task 2')).toBeInTheDocument();
    expect(screen.getByText('Task 3')).toBeInTheDocument();
  });

  it('should call onToggleExpanded when clicked', () => {
    const onToggle = vi.fn();

    render(
      <TodoPanel
        current={[createTodo()]}
        history={[]}
        isExpanded={false}
        onToggleExpanded={onToggle}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /todo/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('should toggle history view when history button is clicked', () => {
    const todos: TodoItem[] = [createTodo({ content: 'Current task' })];
    const history = [
      {
        id: 'hist-1',
        timestamp: '2024-01-01T00:00:00Z',
        todos: [createTodo({ content: 'Old task 1', status: 'pending' })],
      },
      {
        id: 'hist-2',
        timestamp: '2024-01-01T01:00:00Z',
        todos: [createTodo({ content: 'Old task 2', status: 'pending' })],
      },
    ];

    render(
      <TodoPanel
        current={todos}
        history={history}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
      />
    );

    // Initially shows current todos
    expect(screen.getByText('Current task')).toBeInTheDocument();

    // Click history button
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    // Should show history entries with change descriptions
    // First entry shows "ToDo created", second entry shows changes
    expect(screen.getByText('ToDo created')).toBeInTheDocument();
    expect(screen.getByText(/task 1: added.*task 1: removed/)).toBeInTheDocument();
  });

  it('should not render when no todos', () => {
    const { container } = render(
      <TodoPanel
        current={[]}
        history={[]}
        isExpanded={false}
        onToggleExpanded={vi.fn()}
      />
    );

    // Should render nothing or minimal content
    expect(container.firstChild).toBeNull();
  });
});

describe('TodoPanel robustness', () => {
  it('should not crash with empty todos array', () => {
    expect(() =>
      render(
        <TodoPanel
          current={[]}
          history={[]}
          isExpanded={true}
          onToggleExpanded={vi.fn()}
        />
      )
    ).not.toThrow();
  });

  it('should not crash with null/undefined in current array', () => {
    const todos = [
      createTodo({ content: 'Valid task' }),
      null as unknown as TodoItem,
      undefined as unknown as TodoItem,
    ];

    expect(() =>
      render(
        <TodoPanel
          current={todos}
          history={[]}
          isExpanded={true}
          onToggleExpanded={vi.fn()}
        />
      )
    ).not.toThrow();

    // Valid task should still render
    expect(screen.getByText('Valid task')).toBeInTheDocument();
  });

  it('should not crash with malformed history entries', () => {
    const history = [
      {
        id: 'valid',
        timestamp: '2024-01-01T00:00:00Z',
        todos: [createTodo()],
      },
      null as any,
      { id: 'missing-todos' } as any,
      { id: 'invalid-todos', timestamp: '2024-01-01T00:00:00Z', todos: 'not-array' } as any,
    ];

    expect(() =>
      render(
        <TodoPanel
          current={[createTodo()]}
          history={history}
          isExpanded={true}
          onToggleExpanded={vi.fn()}
        />
      )
    ).not.toThrow();
  });

  it('should handle todos with missing properties', () => {
    const todos = [
      { content: 'Missing status' } as TodoItem,
      { status: 'pending' } as TodoItem,
      {} as TodoItem,
    ];

    expect(() =>
      render(
        <TodoPanel
          current={todos}
          history={[]}
          isExpanded={true}
          onToggleExpanded={vi.fn()}
        />
      )
    ).not.toThrow();
  });
});

describe('TodoPanel progress calculation', () => {
  it('should show correct progress for mixed statuses', () => {
    const todos: TodoItem[] = [
      createTodo({ status: 'completed' }),
      createTodo({ status: 'completed' }),
      createTodo({ status: 'in_progress' }),
      createTodo({ status: 'pending' }),
      createTodo({ status: 'pending' }),
    ];

    render(
      <TodoPanel
        current={todos}
        history={[]}
        isExpanded={false}
        onToggleExpanded={vi.fn()}
      />
    );

    // 2 completed out of 5
    expect(screen.getByText('2/5')).toBeInTheDocument();
  });

  it('should show all completed when all done', () => {
    const todos: TodoItem[] = [
      createTodo({ status: 'completed' }),
      createTodo({ status: 'completed' }),
    ];

    render(
      <TodoPanel
        current={todos}
        history={[]}
        isExpanded={false}
        onToggleExpanded={vi.fn()}
      />
    );

    expect(screen.getByText('2/2')).toBeInTheDocument();
  });
});

describe('TodoPanel layout', () => {
  // Layout requirements:
  // - Panel positioned below global header (48px) + session usage bar (~40px)
  // - Both collapsed button and expanded panel share the same top position (top-28 = 112px)
  // - History button placed next to progress count for quick access

  it('should show history button next to progress count in expanded state', () => {
    const todos: TodoItem[] = [createTodo({ content: 'Task 1' })];
    const history = [
      {
        id: 'hist-1',
        timestamp: '2024-01-01T00:00:00Z',
        todos: [createTodo({ content: 'Old task' })],
      },
    ];

    render(
      <TodoPanel
        current={todos}
        history={history}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
      />
    );

    // History button should be present and accessible
    const historyButton = screen.getByRole('button', { name: /history/i });
    expect(historyButton).toBeInTheDocument();

    // Progress count should also be visible
    expect(screen.getByText('0/1')).toBeInTheDocument();
  });

  it('should have collapse button separate from header content', () => {
    const todos: TodoItem[] = [createTodo({ content: 'Task 1' })];

    render(
      <TodoPanel
        current={todos}
        history={[]}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
      />
    );

    // Collapse button should be present
    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    expect(collapseButton).toBeInTheDocument();

    // ToDo header should be visible
    expect(screen.getByText('ToDo')).toBeInTheDocument();
  });

  it('should use fixed positioning for overlay behavior', () => {
    const todos: TodoItem[] = [createTodo({ content: 'Task 1' })];

    const { container } = render(
      <TodoPanel
        current={todos}
        history={[]}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
      />
    );

    // The aside element should have fixed positioning class
    const aside = container.querySelector('aside');
    expect(aside).toHaveClass('fixed');
  });
});

describe('TodoPanel click-to-scroll', () => {
  // When a task is clicked in the panel, it should scroll to the task's last update in the stream

  it('should call onScrollToUpdate when a task is clicked', () => {
    const onScrollToUpdate = vi.fn();
    const todos: TodoItem[] = [createTodo({ content: 'Task 1', status: 'completed' })];
    const history = [
      {
        id: 'update-1',
        timestamp: '2024-01-01T00:00:00Z',
        todos: [createTodo({ content: 'Task 1', status: 'pending' })],
      },
      {
        id: 'update-2',
        timestamp: '2024-01-01T01:00:00Z',
        todos: [createTodo({ content: 'Task 1', status: 'completed' })],
      },
    ];

    render(
      <TodoPanel
        current={todos}
        history={history}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
        onScrollToUpdate={onScrollToUpdate}
      />
    );

    // Click on the task
    fireEvent.click(screen.getByText('Task 1'));

    // Should call onScrollToUpdate with the ID of the last update where status changed
    expect(onScrollToUpdate).toHaveBeenCalledWith('update-2');
  });

  it('should find the correct update when task status changed in history', () => {
    const onScrollToUpdate = vi.fn();
    const todos: TodoItem[] = [
      createTodo({ content: 'Task A', status: 'completed', activeForm: 'Completing Task A' }),
      createTodo({ content: 'Task B', status: 'in_progress', activeForm: 'Working on Task B' }),
    ];
    const history = [
      {
        id: 'update-1',
        timestamp: '2024-01-01T00:00:00Z',
        todos: [
          createTodo({ content: 'Task A', status: 'pending', activeForm: 'Task A pending' }),
          createTodo({ content: 'Task B', status: 'pending', activeForm: 'Task B pending' }),
        ],
      },
      {
        id: 'update-2',
        timestamp: '2024-01-01T01:00:00Z',
        todos: [
          createTodo({ content: 'Task A', status: 'in_progress', activeForm: 'Working on Task A' }),
          createTodo({ content: 'Task B', status: 'pending', activeForm: 'Task B pending' }),
        ],
      },
      {
        id: 'update-3',
        timestamp: '2024-01-01T02:00:00Z',
        todos: [
          createTodo({ content: 'Task A', status: 'completed', activeForm: 'Completing Task A' }),
          createTodo({ content: 'Task B', status: 'in_progress', activeForm: 'Working on Task B' }),
        ],
      },
    ];

    render(
      <TodoPanel
        current={todos}
        history={history}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
        onScrollToUpdate={onScrollToUpdate}
      />
    );

    // Click on Task A - should scroll to update-3 (where it became completed)
    fireEvent.click(screen.getByText('Task A'));
    expect(onScrollToUpdate).toHaveBeenCalledWith('update-3');

    onScrollToUpdate.mockClear();

    // Click on Task B - should scroll to update-3 (where it became in_progress)
    fireEvent.click(screen.getByText('Working on Task B')); // in_progress shows activeForm
    expect(onScrollToUpdate).toHaveBeenCalledWith('update-3');
  });

  it('should make task items clickable when onScrollToUpdate is provided', () => {
    const todos: TodoItem[] = [createTodo({ content: 'Task 1' })];
    const history = [
      { id: 'update-1', timestamp: '2024-01-01T00:00:00Z', todos },
    ];

    const { container } = render(
      <TodoPanel
        current={todos}
        history={history}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
        onScrollToUpdate={vi.fn()}
      />
    );

    // Task item should have cursor-pointer class
    const todoItem = container.querySelector('[data-testid="todo-indicator"]');
    expect(todoItem).toHaveClass('cursor-pointer');
  });

  it('should not make task items clickable when onScrollToUpdate is not provided', () => {
    const todos: TodoItem[] = [createTodo({ content: 'Task 1' })];

    const { container } = render(
      <TodoPanel
        current={todos}
        history={[]}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
      />
    );

    // Task item should NOT have cursor-pointer class
    const todoItem = container.querySelector('[data-testid="todo-indicator"]');
    expect(todoItem).not.toHaveClass('cursor-pointer');
  });

  it('should not make empty tasks clickable even when onScrollToUpdate is provided', () => {
    const todos: TodoItem[] = [
      createTodo({ content: '', status: 'pending' }),
    ];
    const history = [
      { id: 'update-1', timestamp: '2024-01-01T00:00:00Z', todos },
    ];

    const { container } = render(
      <TodoPanel
        current={todos}
        history={history}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
        onScrollToUpdate={vi.fn()}
      />
    );

    // Empty task should NOT have cursor-pointer class
    const todoItem = container.querySelector('[data-testid="todo-indicator"]');
    expect(todoItem).not.toHaveClass('cursor-pointer');
  });

  it('should call onScrollToUpdate when history entry header is clicked', () => {
    const onScrollToUpdate = vi.fn();
    const history = [
      {
        id: 'update-abc',
        timestamp: '2024-01-01T00:00:00Z',
        todos: [createTodo({ content: 'Task 1', status: 'pending' })],
      },
      {
        id: 'update-def',
        timestamp: '2024-01-01T01:00:00Z',
        todos: [createTodo({ content: 'Task 1', status: 'in_progress' })],
      },
    ];
    const currentTodos = [createTodo({ content: 'Task 1', status: 'in_progress' })];

    render(
      <TodoPanel
        current={currentTodos}
        history={history}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
        onScrollToUpdate={onScrollToUpdate}
      />
    );

    // Switch to history view
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    // History entries now show change descriptions
    // First entry: "ToDo created" (initial creation)
    // Second entry: "task 1: started" (task 1 status changed to in_progress)
    fireEvent.click(screen.getByText('ToDo created'));
    expect(onScrollToUpdate).toHaveBeenCalledWith('update-abc');

    onScrollToUpdate.mockClear();

    fireEvent.click(screen.getByText('task 1: started'));
    expect(onScrollToUpdate).toHaveBeenCalledWith('update-def');
  });

  it('should show human-readable change descriptions in history view', () => {
    const history = [
      {
        id: 'update-1',
        timestamp: '2024-01-01T00:00:00Z',
        todos: [
          createTodo({ content: 'Task A', status: 'pending' }),
          createTodo({ content: 'Task B', status: 'pending' }),
        ],
      },
      {
        id: 'update-2',
        timestamp: '2024-01-01T01:00:00Z',
        todos: [
          createTodo({ content: 'Task A', status: 'in_progress' }),
          createTodo({ content: 'Task B', status: 'pending' }),
        ],
      },
      {
        id: 'update-3',
        timestamp: '2024-01-01T02:00:00Z',
        todos: [
          createTodo({ content: 'Task A', status: 'completed' }),
          createTodo({ content: 'Task B', status: 'completed' }),
        ],
      },
    ];
    const currentTodos = history[2].todos;

    render(
      <TodoPanel
        current={currentTodos}
        history={history}
        isExpanded={true}
        onToggleExpanded={vi.fn()}
      />
    );

    // Switch to history view
    fireEvent.click(screen.getByRole('button', { name: /history/i }));

    // Should show change descriptions
    // First entry shows "ToDo created", subsequent entries show specific changes
    expect(screen.getByText('ToDo created')).toBeInTheDocument();
    expect(screen.getByText('task 1: started')).toBeInTheDocument();
    expect(screen.getByText('task 1: completed, task 2: completed')).toBeInTheDocument();
  });
});
