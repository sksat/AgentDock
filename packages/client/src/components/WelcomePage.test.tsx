import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomePage } from './WelcomePage';
import type { SessionInfo } from '@agent-dock/shared';

describe('WelcomePage', () => {
  const mockSessions: SessionInfo[] = [
    {
      id: 'session-1',
      name: 'Session 1',
      status: 'idle',
      createdAt: new Date().toISOString(),
      workingDir: '/home/user/project1',
    },
    {
      id: 'session-2',
      name: 'Session 2',
      status: 'running',
      createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      workingDir: '/home/user/project2',
    },
    {
      id: 'session-3',
      name: 'Session 3',
      status: 'waiting_permission',
      createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      workingDir: '/home/user/project1', // Same as session-1
    },
  ];

  const defaultProps = {
    sessions: [] as SessionInfo[],
    isConnected: true,
    onSendMessage: vi.fn(),
    onSelectSession: vi.fn(),
  };

  it('renders the welcome headline', () => {
    render(<WelcomePage {...defaultProps} />);

    expect(screen.getByText('What do you want to get done?')).toBeInTheDocument();
    expect(screen.getByText('Enter a message to start a new session')).toBeInTheDocument();
  });

  it('renders the input area with placeholder', () => {
    render(<WelcomePage {...defaultProps} />);

    const textarea = screen.getByPlaceholderText('Describe your task...');
    expect(textarea).toBeInTheDocument();
  });

  it('calls onSendMessage when submitting via button', () => {
    const onSendMessage = vi.fn();
    render(<WelcomePage {...defaultProps} onSendMessage={onSendMessage} />);

    const textarea = screen.getByPlaceholderText('Describe your task...');
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });

    // InputArea uses Send (Enter) title for the send button
    const sendButton = screen.getByTitle('Send (Enter)');
    fireEvent.click(sendButton);

    expect(onSendMessage).toHaveBeenCalledWith('Hello Claude', undefined, undefined, undefined);
  });

  it('calls onSendMessage when pressing Enter', () => {
    const onSendMessage = vi.fn();
    render(<WelcomePage {...defaultProps} onSendMessage={onSendMessage} />);

    const textarea = screen.getByPlaceholderText('Describe your task...');
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSendMessage).toHaveBeenCalledWith('Hello Claude', undefined, undefined, undefined);
  });

  it('does not call onSendMessage when pressing Shift+Enter', () => {
    const onSendMessage = vi.fn();
    render(<WelcomePage {...defaultProps} onSendMessage={onSendMessage} />);

    const textarea = screen.getByPlaceholderText('Describe your task...');
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('clears input after sending', () => {
    const onSendMessage = vi.fn();
    render(<WelcomePage {...defaultProps} onSendMessage={onSendMessage} />);

    const textarea = screen.getByPlaceholderText('Describe your task...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(textarea.value).toBe('');
  });

  it('disables input when not connected', () => {
    render(<WelcomePage {...defaultProps} isConnected={false} />);

    const textarea = screen.getByPlaceholderText('Describe your task...');
    expect(textarea).toBeDisabled();
  });

  it('does not send empty message', () => {
    const onSendMessage = vi.fn();
    render(<WelcomePage {...defaultProps} onSendMessage={onSendMessage} />);

    // Try sending empty message via Enter
    const textarea = screen.getByPlaceholderText('Describe your task...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('does not send whitespace-only message', () => {
    const onSendMessage = vi.fn();
    render(<WelcomePage {...defaultProps} onSendMessage={onSendMessage} />);

    const textarea = screen.getByPlaceholderText('Describe your task...');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSendMessage).not.toHaveBeenCalled();
  });

  describe('Directory selector', () => {
    it('shows working directory input', () => {
      render(<WelcomePage {...defaultProps} />);

      // Working directory selector is in status bar, identified by placeholder
      expect(screen.getByPlaceholderText('Default (new directory)')).toBeInTheDocument();
    });

    it('shows dropdown with recent directories when focused', () => {
      render(<WelcomePage {...defaultProps} sessions={mockSessions} />);

      const dirInput = screen.getByPlaceholderText('Default (new directory)');
      fireEvent.focus(dirInput);

      // Should show unique directories from sessions (displayed with ~ format)
      expect(screen.getByText('~/project1')).toBeInTheDocument();
      expect(screen.getByText('~/project2')).toBeInTheDocument();
      // Full path should be in title attribute
      expect(screen.getByTitle('/home/user/project1')).toBeInTheDocument();
    });

    it('selects directory from dropdown', () => {
      const onSendMessage = vi.fn();
      render(<WelcomePage {...defaultProps} sessions={mockSessions} onSendMessage={onSendMessage} />);

      // Open dropdown
      const dirInput = screen.getByPlaceholderText('Default (new directory)');
      fireEvent.focus(dirInput);

      // Select a directory (click by displayed text)
      fireEvent.click(screen.getByText('~/project1'));

      // Input displays shortened path (~/...) but full path is used internally
      expect(dirInput).toHaveValue('~/project1');

      // Send message
      const textarea = screen.getByPlaceholderText('Describe your task...');
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      // Full path is sent to the server
      expect(onSendMessage).toHaveBeenCalledWith('Test message', undefined, '/home/user/project1', undefined);
    });

    it('allows typing custom directory', () => {
      const onSendMessage = vi.fn();
      render(<WelcomePage {...defaultProps} onSendMessage={onSendMessage} />);

      // Type custom path
      const dirInput = screen.getByPlaceholderText('Default (new directory)');
      fireEvent.change(dirInput, { target: { value: '/custom/path' } });

      // Send message
      const textarea = screen.getByPlaceholderText('Describe your task...');
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(onSendMessage).toHaveBeenCalledWith('Test message', undefined, '/custom/path', undefined);
    });

    it('sends undefined workingDir when empty', () => {
      const onSendMessage = vi.fn();
      render(<WelcomePage {...defaultProps} onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText('Describe your task...');
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(onSendMessage).toHaveBeenCalledWith('Test message', undefined, undefined, undefined);
    });
  });

  describe('Robustness', () => {
    it('should not crash with empty sessions', () => {
      expect(() => render(<WelcomePage {...defaultProps} sessions={[]} />)).not.toThrow();
    });

    it('should not crash with undefined session fields', () => {
      const partialSession: SessionInfo = {
        id: 'session-1',
        name: 'Test',
        status: 'idle',
        createdAt: new Date().toISOString(),
        workingDir: '/tmp',
      };

      expect(() =>
        render(<WelcomePage {...defaultProps} sessions={[partialSession]} />)
      ).not.toThrow();
    });
  });

  describe('Feature parity (session-start mode)', () => {
    it('should have model selection available', () => {
      const onModelChange = vi.fn();
      render(
        <WelcomePage
          {...defaultProps}
          defaultModel="claude-sonnet-4-5-20250929"
          onModelChange={onModelChange}
        />
      );
      expect(screen.getByText('sonnet')).toBeInTheDocument();
    });

    it('should have permission mode control', () => {
      render(
        <WelcomePage
          {...defaultProps}
          permissionMode="ask"
          onPermissionModeChange={() => {}}
        />
      );
      expect(screen.getByText('Ask before edits')).toBeInTheDocument();
    });

    it('should have image attachment button', () => {
      render(<WelcomePage {...defaultProps} />);
      expect(screen.getByTitle('Attach image')).toBeInTheDocument();
    });

    it('should have slash commands button', () => {
      render(<WelcomePage {...defaultProps} />);
      expect(screen.getByTitle('Slash commands')).toBeInTheDocument();
    });
  });
});
