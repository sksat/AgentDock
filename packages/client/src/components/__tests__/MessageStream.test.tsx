import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageStream, type MessageStreamItem } from '../MessageStream';

describe('MessageStream', () => {
  it('should render empty state when no messages', () => {
    render(<MessageStream messages={[]} />);

    expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
  });

  it('should render user message', () => {
    const messages: MessageStreamItem[] = [
      { type: 'user', content: 'Hello Claude', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText('Hello Claude')).toBeInTheDocument();
  });

  it('should render assistant text message', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: 'Hello! How can I help?', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText('Hello! How can I help?')).toBeInTheDocument();
  });

  it('should render tool use message', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool_use',
        content: { toolName: 'Bash', toolUseId: 'tool-1', input: { command: 'ls -la' } },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText('Bash')).toBeInTheDocument();
    expect(screen.getByText(/ls -la/)).toBeInTheDocument();
  });

  it('should render tool result message', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool_result',
        content: { toolUseId: 'tool-1', content: 'file1.txt\nfile2.txt', isError: false },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText(/file1.txt/)).toBeInTheDocument();
  });

  it('should render tool result error', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool_result',
        content: { toolUseId: 'tool-1', content: 'Command failed', isError: true },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    const errorElement = screen.getByText(/Command failed/);
    expect(errorElement).toBeInTheDocument();
    expect(errorElement.closest('[data-error="true"]')).toBeInTheDocument();
  });

  it('should render multiple messages in order', () => {
    const messages: MessageStreamItem[] = [
      { type: 'user', content: 'First message', timestamp: '2024-01-01T00:00:00Z' },
      { type: 'assistant', content: 'Second message', timestamp: '2024-01-01T00:00:01Z' },
      { type: 'user', content: 'Third message', timestamp: '2024-01-01T00:00:02Z' },
    ];
    render(<MessageStream messages={messages} />);

    const items = screen.getAllByTestId('message-item');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('First message');
    expect(items[1]).toHaveTextContent('Second message');
    expect(items[2]).toHaveTextContent('Third message');
  });
});

describe('ThinkingMessage persistence', () => {
  const STORAGE_KEY = 'claude-bridge:thinking-expanded';

  beforeEach(() => {
    localStorage.clear();
  });

  it('should render thinking message with content', () => {
    const messages: MessageStreamItem[] = [
      { type: 'thinking', content: 'Let me think about this...', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText('Let me think about this...')).toBeInTheDocument();
  });

  it('should read initial expanded state from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'false');

    const messages: MessageStreamItem[] = [
      { type: 'thinking', content: 'Thinking content', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    // Content should not be visible when collapsed
    expect(screen.queryByText('Thinking content')).not.toBeInTheDocument();
    // But the "Thinking" button should still be visible
    expect(screen.getByText('Thinking')).toBeInTheDocument();
  });

  it('should save expanded state to localStorage on toggle', () => {
    const messages: MessageStreamItem[] = [
      { type: 'thinking', content: 'Thinking content', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    // Initially expanded (default)
    expect(screen.getByText('Thinking content')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(screen.getByRole('button', { name: /Thinking/ }));

    // Content should be hidden
    expect(screen.queryByText('Thinking content')).not.toBeInTheDocument();
    // State should be saved to localStorage
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('should apply saved state to new thinking blocks', () => {
    localStorage.setItem(STORAGE_KEY, 'false');

    const messages: MessageStreamItem[] = [
      { type: 'thinking', content: 'First thinking', timestamp: '2024-01-01T00:00:00Z' },
      { type: 'thinking', content: 'Second thinking', timestamp: '2024-01-01T00:00:01Z' },
    ];
    render(<MessageStream messages={messages} />);

    // Both thinking blocks should be collapsed
    expect(screen.queryByText('First thinking')).not.toBeInTheDocument();
    expect(screen.queryByText('Second thinking')).not.toBeInTheDocument();
    // But their headers should be visible
    expect(screen.getAllByText('Thinking')).toHaveLength(2);
  });

  it('should toggle all thinking blocks when one is toggled (global setting)', () => {
    const messages: MessageStreamItem[] = [
      { type: 'thinking', content: 'First thinking', timestamp: '2024-01-01T00:00:00Z' },
      { type: 'thinking', content: 'Second thinking', timestamp: '2024-01-01T00:00:01Z' },
    ];
    render(<MessageStream messages={messages} />);

    // Initially both expanded
    expect(screen.getByText('First thinking')).toBeInTheDocument();
    expect(screen.getByText('Second thinking')).toBeInTheDocument();

    // Click the first thinking block's toggle
    const buttons = screen.getAllByRole('button', { name: /Thinking/ });
    fireEvent.click(buttons[0]);

    // Both should now be collapsed
    expect(screen.queryByText('First thinking')).not.toBeInTheDocument();
    expect(screen.queryByText('Second thinking')).not.toBeInTheDocument();
  });
});
