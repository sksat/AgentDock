import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomePage } from './WelcomePage';
import type { SessionInfo, Repository } from '@agent-dock/shared';

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

    // selectedProject is null when no project selected
    expect(onSendMessage).toHaveBeenCalledWith('Hello Claude', undefined, null, undefined);
  });

  it('calls onSendMessage when pressing Enter', () => {
    const onSendMessage = vi.fn();
    render(<WelcomePage {...defaultProps} onSendMessage={onSendMessage} />);

    const textarea = screen.getByPlaceholderText('Describe your task...');
    fireEvent.change(textarea, { target: { value: 'Hello Claude' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    // selectedProject is null when no project selected
    expect(onSendMessage).toHaveBeenCalledWith('Hello Claude', undefined, null, undefined);
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

  describe('Project selector', () => {
    const mockRepositories: Repository[] = [
      { id: 'repo-1', name: 'My Project', path: '/home/user/project1', type: 'local-git-worktree', createdAt: '', updatedAt: '' },
      { id: 'repo-2', name: 'Other Project', path: '/home/user/project2', type: 'local', createdAt: '', updatedAt: '' },
    ];

    it('shows project selector', () => {
      render(<WelcomePage {...defaultProps} />);

      // Project selector shows "Select project..." placeholder
      expect(screen.getByText(/Select project/)).toBeInTheDocument();
    });

    it('shows repositories in dropdown', () => {
      render(<WelcomePage {...defaultProps} repositories={mockRepositories} />);

      // Open dropdown
      fireEvent.click(screen.getByText(/Select project/));

      // Should show repositories
      expect(screen.getByText('My Project')).toBeInTheDocument();
      expect(screen.getByText('Other Project')).toBeInTheDocument();
    });

    it('shows recent projects from session history', () => {
      render(<WelcomePage {...defaultProps} sessions={mockSessions} />);

      // Open dropdown
      fireEvent.click(screen.getByText(/Select project/));

      // Should show recent projects from sessions (displayed with ~ format)
      expect(screen.getByText('~/project1')).toBeInTheDocument();
      expect(screen.getByText('~/project2')).toBeInTheDocument();
    });

    it('selects repository from dropdown', () => {
      const onSendMessage = vi.fn();
      render(<WelcomePage {...defaultProps} repositories={mockRepositories} onSendMessage={onSendMessage} />);

      // Open dropdown and select repository
      fireEvent.click(screen.getByText(/Select project/));
      fireEvent.click(screen.getByText('My Project'));

      // Send message
      const textarea = screen.getByPlaceholderText('Describe your task...');
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      // Selected project is sent as repository type
      expect(onSendMessage).toHaveBeenCalledWith('Test message', undefined, { type: 'repository', repositoryId: 'repo-1' }, undefined);
    });

    it('sends null selectedProject when no project selected', () => {
      const onSendMessage = vi.fn();
      render(<WelcomePage {...defaultProps} onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText('Describe your task...');
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(onSendMessage).toHaveBeenCalledWith('Test message', undefined, null, undefined);
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
