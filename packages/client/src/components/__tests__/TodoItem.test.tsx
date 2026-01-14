import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TodoItem } from '../TodoItem';
import type { TodoItem as TodoItemType } from '@agent-dock/shared';

describe('TodoItem', () => {
  it('should render pending todo', () => {
    const todo: TodoItemType = {
      content: 'Write tests',
      status: 'pending',
      activeForm: 'Writing tests',
    };
    render(<TodoItem todo={todo} />);

    expect(screen.getByText('Write tests')).toBeInTheDocument();
  });

  it('should render in_progress todo with activeForm text', () => {
    const todo: TodoItemType = {
      content: 'Implement feature',
      status: 'in_progress',
      activeForm: 'Implementing feature',
    };
    render(<TodoItem todo={todo} />);

    // Should display activeForm instead of content for in_progress
    expect(screen.getByText('Implementing feature')).toBeInTheDocument();
    expect(screen.queryByText('Implement feature')).not.toBeInTheDocument();
  });

  it('should render completed todo with strikethrough', () => {
    const todo: TodoItemType = {
      content: 'Review code',
      status: 'completed',
      activeForm: 'Reviewing code',
    };
    render(<TodoItem todo={todo} />);

    expect(screen.getByText('Review code')).toBeInTheDocument();
    const text = screen.getByText('Review code');
    expect(text).toHaveClass('line-through');
  });

  it('should fallback to content when activeForm is missing for in_progress', () => {
    const todo = {
      content: 'Do something',
      status: 'in_progress' as const,
      activeForm: '', // empty activeForm
    };
    render(<TodoItem todo={todo} />);

    // Should fallback to content
    expect(screen.getByText('Do something')).toBeInTheDocument();
  });
});

describe('TodoItem robustness', () => {
  it('should not crash with missing content', () => {
    const todo = {
      content: '',
      status: 'pending' as const,
      activeForm: '',
    };

    expect(() => render(<TodoItem todo={todo} />)).not.toThrow();
  });

  it('should not crash with undefined activeForm', () => {
    const todo = {
      content: 'Task',
      status: 'in_progress' as const,
      activeForm: undefined as unknown as string,
    };

    expect(() => render(<TodoItem todo={todo} />)).not.toThrow();
    expect(screen.getByText('Task')).toBeInTheDocument();
  });

  it('should handle unknown status gracefully', () => {
    const todo = {
      content: 'Task',
      status: 'unknown' as any,
      activeForm: 'Doing task',
    };

    expect(() => render(<TodoItem todo={todo} />)).not.toThrow();
    expect(screen.getByText('Task')).toBeInTheDocument();
  });
});
