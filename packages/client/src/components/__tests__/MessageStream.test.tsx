/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('should render tool message', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: { toolName: 'Bash', toolUseId: 'tool-1', input: { command: 'ls -la' }, output: '', isComplete: false },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText('Bash')).toBeInTheDocument();
    // Command appears in both header and expanded content
    expect(screen.getAllByText(/ls -la/).length).toBeGreaterThan(0);
  });

  it('should render completed tool message with output', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: { toolName: 'Bash', toolUseId: 'tool-1', input: { command: 'ls' }, output: 'file1.txt\nfile2.txt', isComplete: true, isError: false },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText('Bash')).toBeInTheDocument();
    // Output is visible by default (expanded)
    expect(screen.getByText(/file1.txt/)).toBeInTheDocument();
  });

  it('should render tool error state', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: { toolName: 'Bash', toolUseId: 'tool-1', input: { command: 'bad-cmd' }, output: 'Command failed', isComplete: true, isError: true },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    // Should show error indicator (red dot)
    const statusDot = document.querySelector('.bg-accent-danger');
    expect(statusDot).toBeInTheDocument();
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
  const STORAGE_KEY = 'agent-dock:thinking-expanded';

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

describe('Auto-scroll behavior', () => {
  // Helper to mock scroll properties on container
  function mockScrollProperties(element: HTMLElement, props: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  }) {
    Object.defineProperty(element, 'scrollTop', {
      value: props.scrollTop,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(element, 'scrollHeight', {
      value: props.scrollHeight,
      configurable: true,
    });
    Object.defineProperty(element, 'clientHeight', {
      value: props.clientHeight,
      configurable: true,
    });
  }

  it('should auto-scroll to bottom when messages are added', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: 'Hello', timestamp: '2024-01-01T00:00:00Z' },
    ];
    const { container, rerender } = render(<MessageStream messages={messages} />);

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;
    const scrollToSpy = vi.fn();

    // Mock scrollTop setter
    let scrollTopValue = 0;
    Object.defineProperty(scrollContainer, 'scrollTop', {
      get: () => scrollTopValue,
      set: (v) => { scrollTopValue = v; scrollToSpy(v); },
      configurable: true,
    });
    Object.defineProperty(scrollContainer, 'scrollHeight', {
      value: 500,
      configurable: true,
    });

    // Add new message
    const newMessages = [
      ...messages,
      { type: 'assistant' as const, content: 'New message', timestamp: '2024-01-01T00:00:01Z' },
    ];
    rerender(<MessageStream messages={newMessages} />);

    // Should scroll to bottom
    expect(scrollToSpy).toHaveBeenCalledWith(500);
  });

  it('should disable auto-scroll when user scrolls up', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: 'Message 1', timestamp: '2024-01-01T00:00:00Z' },
      { type: 'assistant', content: 'Message 2', timestamp: '2024-01-01T00:00:01Z' },
    ];
    const { container, rerender } = render(<MessageStream messages={messages} />);

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

    // Mock scroll properties: user is NOT at bottom (scrolled up)
    mockScrollProperties(scrollContainer, {
      scrollTop: 100,
      scrollHeight: 500,
      clientHeight: 300,
    });

    // Simulate user scroll event
    fireEvent.scroll(scrollContainer);

    // Now add a new message
    let scrollTopValue = 100;
    const scrollToSpy = vi.fn();
    Object.defineProperty(scrollContainer, 'scrollTop', {
      get: () => scrollTopValue,
      set: (v) => { scrollTopValue = v; scrollToSpy(v); },
      configurable: true,
    });

    const newMessages = [
      ...messages,
      { type: 'assistant' as const, content: 'New message', timestamp: '2024-01-01T00:00:02Z' },
    ];
    rerender(<MessageStream messages={newMessages} />);

    // Should NOT auto-scroll because user scrolled up
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('should re-enable auto-scroll when user scrolls to bottom', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: 'Message 1', timestamp: '2024-01-01T00:00:00Z' },
    ];
    const { container, rerender } = render(<MessageStream messages={messages} />);

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

    // First: user scrolls up (disable auto-scroll)
    mockScrollProperties(scrollContainer, {
      scrollTop: 100,
      scrollHeight: 500,
      clientHeight: 300,
    });
    fireEvent.scroll(scrollContainer);

    // Then: user scrolls back to bottom (re-enable auto-scroll)
    mockScrollProperties(scrollContainer, {
      scrollTop: 200, // 500 - 300 = 200 means at bottom
      scrollHeight: 500,
      clientHeight: 300,
    });
    fireEvent.scroll(scrollContainer);

    // Now add a new message
    let scrollTopValue = 200;
    const scrollToSpy = vi.fn();
    Object.defineProperty(scrollContainer, 'scrollTop', {
      get: () => scrollTopValue,
      set: (v) => { scrollTopValue = v; scrollToSpy(v); },
      configurable: true,
    });
    Object.defineProperty(scrollContainer, 'scrollHeight', {
      value: 600, // New message increases height
      configurable: true,
    });

    const newMessages = [
      ...messages,
      { type: 'assistant' as const, content: 'New message', timestamp: '2024-01-01T00:00:01Z' },
    ];
    rerender(<MessageStream messages={newMessages} />);

    // Should auto-scroll again
    expect(scrollToSpy).toHaveBeenCalledWith(600);
  });

  it('should re-enable auto-scroll when user posts a message', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: 'Hello', timestamp: '2024-01-01T00:00:00Z' },
    ];
    const { container, rerender } = render(<MessageStream messages={messages} />);

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

    // User scrolls up (disable auto-scroll)
    mockScrollProperties(scrollContainer, {
      scrollTop: 50,
      scrollHeight: 500,
      clientHeight: 300,
    });
    fireEvent.scroll(scrollContainer);

    // User posts a message (should re-enable auto-scroll)
    let scrollTopValue = 50;
    const scrollToSpy = vi.fn();
    Object.defineProperty(scrollContainer, 'scrollTop', {
      get: () => scrollTopValue,
      set: (v) => { scrollTopValue = v; scrollToSpy(v); },
      configurable: true,
    });
    Object.defineProperty(scrollContainer, 'scrollHeight', {
      value: 600,
      configurable: true,
    });

    const newMessages = [
      ...messages,
      { type: 'user' as const, content: 'User reply', timestamp: '2024-01-01T00:00:01Z' },
    ];
    rerender(<MessageStream messages={newMessages} />);

    // Should auto-scroll because user posted
    expect(scrollToSpy).toHaveBeenCalledWith(600);
  });

  it('should not re-enable auto-scroll for assistant messages when scrolled up', () => {
    const messages: MessageStreamItem[] = [
      { type: 'user', content: 'Hello', timestamp: '2024-01-01T00:00:00Z' },
    ];
    const { container, rerender } = render(<MessageStream messages={messages} />);

    const scrollContainer = container.querySelector('.overflow-y-auto') as HTMLElement;

    // User scrolls up (disable auto-scroll)
    mockScrollProperties(scrollContainer, {
      scrollTop: 50,
      scrollHeight: 500,
      clientHeight: 300,
    });
    fireEvent.scroll(scrollContainer);

    // Assistant replies (should NOT re-enable auto-scroll)
    let scrollTopValue = 50;
    const scrollToSpy = vi.fn();
    Object.defineProperty(scrollContainer, 'scrollTop', {
      get: () => scrollTopValue,
      set: (v) => { scrollTopValue = v; scrollToSpy(v); },
      configurable: true,
    });

    const newMessages = [
      ...messages,
      { type: 'assistant' as const, content: 'Assistant reply', timestamp: '2024-01-01T00:00:01Z' },
    ];
    rerender(<MessageStream messages={newMessages} />);

    // Should NOT auto-scroll because it's not a user message
    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});

describe('QuestionMessage robustness', () => {
  it('should render question message with valid content', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'question',
        content: {
          answers: [
            { question: 'Which option?', answer: 'Option A' },
            { question: 'Are you sure?', answer: 'Yes' },
          ],
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText(/AskUserQuestion/)).toBeInTheDocument();
    expect(screen.getByText(/Which option\?/)).toBeInTheDocument();
    expect(screen.getByText(/Option A/)).toBeInTheDocument();
  });

  it('should not crash with null content', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'question',
        content: null as any, // Invalid: null content
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    // Should not throw
    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();

    // Should render fallback
    expect(screen.getByText(/AskUserQuestion/)).toBeInTheDocument();
    expect(screen.getByText(/User answered questions/)).toBeInTheDocument();
  });

  it('should not crash with undefined content', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'question',
        content: undefined as any, // Invalid: undefined content
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
    expect(screen.getByText(/AskUserQuestion/)).toBeInTheDocument();
  });

  it('should not crash with empty object content (missing answers)', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'question',
        content: {} as any, // Invalid: no answers property
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
    expect(screen.getByText(/AskUserQuestion/)).toBeInTheDocument();
    expect(screen.getByText(/User answered questions/)).toBeInTheDocument();
  });

  it('should not crash when answers is not an array', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'question',
        content: { answers: 'not an array' } as any, // Invalid: answers is string
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
    expect(screen.getByText(/AskUserQuestion/)).toBeInTheDocument();
  });

  it('should not crash when content has wrong structure from legacy data', () => {
    // This simulates old database data that might have different structure
    const messages: MessageStreamItem[] = [
      {
        type: 'question',
        content: { text: 'old format', requestId: 'req-1' } as any, // Legacy format
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
    expect(screen.getByText(/AskUserQuestion/)).toBeInTheDocument();
  });
});

describe('ToolMessage - Browser tool formatting', () => {
  it('should display external Playwright MCP navigate tool with browser info', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: {
          toolUseId: 'tool-1',
          toolName: 'mcp__plugin_playwright_playwright__browser_navigate',
          input: { url: 'https://example.com' },
          output: '',
          isComplete: true,
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    // Should show formatted tool name (getToolDisplayName converts mcp__*__* to readable form)
    // mcp__plugin_playwright_playwright__browser_navigate -> "browser navigate"
    expect(screen.getByText('browser navigate')).toBeInTheDocument();
    // Description should still show playwright info
    expect(screen.getByText(/playwright:navigate/)).toBeInTheDocument();
  });

  it('should display MCP tool with formatted tool name', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: {
          toolUseId: 'tool-1',
          toolName: 'mcp__other__some_tool',
          input: { param: 'value' },
          output: '',
          isComplete: true,
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    // Tool name should be formatted: mcp__other__some_tool -> "some tool"
    expect(screen.getByText('some tool')).toBeInTheDocument();
  });

  it('should show expanded content by default', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: {
          toolUseId: 'tool-1',
          toolName: 'mcp__plugin_playwright_playwright__browser_navigate',
          input: { url: 'https://example.com' },
          output: 'Navigation successful',
          isComplete: true,
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    // Should show Input/Output sections by default (expanded)
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.getByText('Navigation successful')).toBeInTheDocument();
  });
});

describe('TodoUpdateMessage', () => {
  it('should render todo update with valid content', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'todo_update',
        content: {
          toolUseId: 'todo-1',
          todos: [
            { content: 'Task 1', status: 'completed', activeForm: 'Completing Task 1' },
            { content: 'Task 2', status: 'in_progress', activeForm: 'Working on Task 2' },
            { content: 'Task 3', status: 'pending', activeForm: 'Task 3 pending' },
          ],
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText('ToDo')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument(); // 1 completed out of 3
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Working on Task 2')).toBeInTheDocument(); // Shows activeForm for in_progress
    expect(screen.getByText('Task 3')).toBeInTheDocument();
  });

  it('should show strikethrough for completed tasks', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'todo_update',
        content: {
          toolUseId: 'todo-1',
          todos: [
            { content: 'Completed task', status: 'completed', activeForm: 'Done' },
          ],
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    const completedText = screen.getByText('Completed task');
    expect(completedText).toHaveClass('line-through');
  });
});

describe('TodoUpdateMessage robustness', () => {
  it('should not crash with null content', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'todo_update',
        content: null as any,
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
    expect(screen.getByText(/TodoWrite/)).toBeInTheDocument();
  });

  it('should not crash with undefined content', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'todo_update',
        content: undefined as any,
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
    expect(screen.getByText(/TodoWrite/)).toBeInTheDocument();
  });

  it('should not crash with empty object (missing todos)', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'todo_update',
        content: {} as any,
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
    expect(screen.getByText(/TodoWrite/)).toBeInTheDocument();
  });

  it('should not crash when todos is not an array', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'todo_update',
        content: { toolUseId: 'todo-1', todos: 'not an array' } as any,
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
    expect(screen.getByText(/TodoWrite/)).toBeInTheDocument();
  });

  it('should handle empty todos array gracefully', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'todo_update',
        content: { toolUseId: 'todo-1', todos: [] },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
    expect(screen.getByText('ToDo')).toBeInTheDocument();
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });
});

describe('AssistantMessage Markdown rendering', () => {
  it('should render plain text correctly', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: 'Hello world', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('should render bold text with strong styling', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: 'This is **bold** text', timestamp: '2024-01-01T00:00:00Z' },
    ];
    const { container } = render(<MessageStream messages={messages} />);

    // Streamdown uses span with data-streamdown="strong" for bold text
    const strongElement = container.querySelector('[data-streamdown="strong"]');
    expect(strongElement).toBeInTheDocument();
    expect(strongElement?.textContent).toBe('bold');
  });

  it('should render italic text with emphasis styling', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: 'This is *italic* text', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    // Check that italic text is rendered (Streamdown may use <em> or span with data attribute)
    const italicText = screen.getByText('italic');
    expect(italicText).toBeInTheDocument();
    // Verify it has italic styling (either <em> tag or italic class)
    expect(
      italicText.tagName === 'EM' ||
      italicText.classList.contains('italic') ||
      italicText.closest('em')
    ).toBeTruthy();
  });

  it('should render inline code as <code>', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: 'Run `npm install` command', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    const codeElement = screen.getByText('npm install');
    expect(codeElement.tagName).toBe('CODE');
  });

  it('should render code blocks with <pre><code>', async () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'assistant',
        content: '```javascript\nconst x = 1;\n```',
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    const { container } = render(<MessageStream messages={messages} />);

    // Wait for async Shiki syntax highlighting to complete
    // Note: Shiki tokenizes code, so individual tokens may be in separate elements
    await waitFor(() => {
      const preElement = container.querySelector('pre');
      expect(preElement).toBeInTheDocument();
      const codeElement = container.querySelector('code');
      expect(codeElement).toBeInTheDocument();
      // Check that code content is rendered (may be tokenized into spans)
      expect(codeElement?.textContent).toContain('const');
      expect(codeElement?.textContent).toContain('1');
    }, { timeout: 3000 });
  });

  it('should render unordered lists as <ul><li>', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: '- Item 1\n- Item 2', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    const item1 = screen.getByText('Item 1');
    expect(item1.closest('li')).toBeInTheDocument();
    expect(item1.closest('ul')).toBeInTheDocument();
  });

  it('should render ordered lists as <ol><li>', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: '1. First\n2. Second', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    const item = screen.getByText('First');
    expect(item.closest('li')).toBeInTheDocument();
    expect(item.closest('ol')).toBeInTheDocument();
  });

  it('should render headings', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: '## Heading Level 2', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Heading Level 2');
  });

  it('should render links as <a> with href', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: 'Check out [this link](https://example.com)', timestamp: '2024-01-01T00:00:00Z' },
    ];
    render(<MessageStream messages={messages} />);

    const link = screen.getByRole('link', { name: 'this link' });
    // Streamdown may normalize URLs by adding a trailing slash
    expect(link.getAttribute('href')).toMatch(/^https:\/\/example\.com\/?$/);
  });

  // Streaming robustness tests
  it('should not crash with unterminated bold syntax', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: 'This is **incomplete', timestamp: '2024-01-01T00:00:00Z' },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
    expect(screen.getByTestId('message-item')).toBeInTheDocument();
  });

  it('should not crash with unterminated code block', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: '```javascript\nconst x = 1;', timestamp: '2024-01-01T00:00:00Z' },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
    expect(screen.getByTestId('message-item')).toBeInTheDocument();
  });

  it('should not crash with empty content', () => {
    const messages: MessageStreamItem[] = [
      { type: 'assistant', content: '', timestamp: '2024-01-01T00:00:00Z' },
    ];

    expect(() => render(<MessageStream messages={messages} />)).not.toThrow();
  });

  it('should handle content updates during streaming (re-render)', async () => {
    const messages1: MessageStreamItem[] = [
      { type: 'assistant', content: 'Hello', timestamp: '2024-01-01T00:00:00Z' },
    ];
    const { rerender, container } = render(<MessageStream messages={messages1} />);

    expect(screen.getByText('Hello')).toBeInTheDocument();

    // Simulate streaming update with completed bold text
    const messages2: MessageStreamItem[] = [
      { type: 'assistant', content: 'Hello **world**!', timestamp: '2024-01-01T00:00:00Z' },
    ];
    rerender(<MessageStream messages={messages2} />);

    // Wait for the markdown to be rendered and check strong element exists
    // Streamdown uses span with data-streamdown="strong" for bold text
    await waitFor(() => {
      const strongElement = container.querySelector('[data-streamdown="strong"]');
      expect(strongElement).toBeInTheDocument();
      expect(strongElement?.textContent).toBe('world');
    }, { timeout: 2000 });
  });
});

describe('Read tool output formatting', () => {
  it('should parse and display cat -n format with line numbers', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: {
          toolName: 'Read',
          toolUseId: 'read-1',
          input: { file_path: '/path/to/file.ts' },
          output: '   1\tconst foo = 1;\n   2\tconst bar = 2;',
          isComplete: true,
          isError: false,
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    // Line numbers should be displayed separately
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('const foo = 1;')).toBeInTheDocument();
    expect(screen.getByText('const bar = 2;')).toBeInTheDocument();
  });

  it('should handle line numbers with → separator', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: {
          toolName: 'Read',
          toolUseId: 'read-1',
          input: { file_path: '/path/to/file.ts' },
          output: '   1→const foo = 1;\n   2→const bar = 2;',
          isComplete: true,
          isError: false,
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('const foo = 1;')).toBeInTheDocument();
  });

  it('should fallback to pre for non-cat-n format output', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: {
          toolName: 'Read',
          toolUseId: 'read-1',
          input: { file_path: '/path/to/file.ts' },
          output: 'Some plain text output',
          isComplete: true,
          isError: false,
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    const { container } = render(<MessageStream messages={messages} />);

    expect(screen.getByText('Some plain text output')).toBeInTheDocument();
    // Should use <pre> element for non-parsed output
    const preElement = container.querySelector('pre');
    expect(preElement).toBeInTheDocument();
    expect(preElement?.textContent).toContain('Some plain text output');
  });

  it('should display error output in red with pre element', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: {
          toolName: 'Read',
          toolUseId: 'read-1',
          input: { file_path: '/nonexistent' },
          output: 'File not found',
          isComplete: true,
          isError: true,
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    const { container } = render(<MessageStream messages={messages} />);

    const preElement = container.querySelector('pre');
    expect(preElement).toBeInTheDocument();
    expect(preElement).toHaveClass('text-accent-danger');
  });

  it('should handle offset line numbers (not starting from 1)', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: {
          toolName: 'Read',
          toolUseId: 'read-1',
          input: { file_path: '/path/to/file.ts', offset: 100 },
          output: ' 100\tconst x = 1;\n 101\tconst y = 2;',
          isComplete: true,
          isError: false,
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
  });

  it('should handle empty lines in output', () => {
    const messages: MessageStreamItem[] = [
      {
        type: 'tool',
        content: {
          toolName: 'Read',
          toolUseId: 'read-1',
          input: { file_path: '/path/to/file.ts' },
          output: '   1\tconst x = 1;\n   2\t\n   3\tconst y = 2;',
          isComplete: true,
          isError: false,
        },
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    render(<MessageStream messages={messages} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
