import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageStream, type MessageStreamItem } from '../MessageStream';

describe('MessageStream', () => {
  it('should render empty state when no messages', () => {
    render(<MessageStream messages={[]} />);

    expect(screen.getByText(/メッセージはまだありません/)).toBeInTheDocument();
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
