import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar, type SidebarSession } from './Sidebar';

describe('Sidebar', () => {
  const mockSessions: SidebarSession[] = [
    {
      id: 'session-1',
      name: 'Session 1',
      status: 'idle',
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'session-2',
      name: 'Session 2',
      status: 'running',
      createdAt: '2024-01-02T00:00:00Z',
    },
  ];

  it('renders session list', () => {
    render(
      <Sidebar
        sessions={mockSessions}
        activeSessionId="session-1"
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onDeleteSession={() => {}}
        onRenameSession={() => {}}
      />
    );

    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(screen.getByText('Session 2')).toBeInTheDocument();
  });

  it('highlights active session', () => {
    render(
      <Sidebar
        sessions={mockSessions}
        activeSessionId="session-1"
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onDeleteSession={() => {}}
        onRenameSession={() => {}}
      />
    );

    const session1 = screen.getByText('Session 1').closest('[role="button"]');
    const session2 = screen.getByText('Session 2').closest('[role="button"]');

    expect(session1).toHaveAttribute('data-active', 'true');
    expect(session2).not.toHaveAttribute('data-active');
  });

  it('calls onSelectSession when clicking a session', () => {
    const onSelectSession = vi.fn();
    render(
      <Sidebar
        sessions={mockSessions}
        activeSessionId="session-1"
        onSelectSession={onSelectSession}
        onCreateSession={() => {}}
        onDeleteSession={() => {}}
        onRenameSession={() => {}}
      />
    );

    fireEvent.click(screen.getByText('Session 2'));

    expect(onSelectSession).toHaveBeenCalledWith('session-2');
  });

  it('calls onCreateSession when clicking new session button', () => {
    const onCreateSession = vi.fn();
    render(
      <Sidebar
        sessions={mockSessions}
        activeSessionId="session-1"
        onSelectSession={() => {}}
        onCreateSession={onCreateSession}
        onDeleteSession={() => {}}
        onRenameSession={() => {}}
      />
    );

    fireEvent.click(screen.getByLabelText('New Session'));

    expect(onCreateSession).toHaveBeenCalled();
  });

  it('shows status indicator for running sessions', () => {
    render(
      <Sidebar
        sessions={mockSessions}
        activeSessionId="session-1"
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onDeleteSession={() => {}}
        onRenameSession={() => {}}
      />
    );

    const runningIndicator = screen.getByTestId('status-session-2');
    expect(runningIndicator).toHaveAttribute('data-status', 'running');
  });

  it('shows delete button for inactive idle sessions', () => {
    const sessionsWithIdle: SidebarSession[] = [
      ...mockSessions,
      {
        id: 'session-3',
        name: 'Session 3',
        status: 'idle',
        createdAt: '2024-01-03T00:00:00Z',
      },
    ];
    const onDeleteSession = vi.fn();
    render(
      <Sidebar
        sessions={sessionsWithIdle}
        activeSessionId="session-1"
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onDeleteSession={onDeleteSession}
        onRenameSession={() => {}}
      />
    );

    // Session 3 should have a delete button (not active, idle status)
    const deleteButton = screen.getByLabelText('Delete Session 3');
    expect(deleteButton).toBeInTheDocument();

    fireEvent.click(deleteButton);
    expect(onDeleteSession).toHaveBeenCalledWith('session-3');
  });

  it('shows empty state when no sessions', () => {
    render(
      <Sidebar
        sessions={[]}
        activeSessionId={null}
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onDeleteSession={() => {}}
        onRenameSession={() => {}}
      />
    );

    expect(screen.getByText('No sessions')).toBeInTheDocument();
  });

  it('allows renaming session on double click', () => {
    const onRenameSession = vi.fn();
    render(
      <Sidebar
        sessions={mockSessions}
        activeSessionId="session-1"
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onDeleteSession={() => {}}
        onRenameSession={onRenameSession}
      />
    );

    // Double click to enter rename mode
    const sessionItem = screen.getByText('Session 1');
    fireEvent.doubleClick(sessionItem);

    // Should show input field
    const input = screen.getByDisplayValue('Session 1');
    expect(input).toBeInTheDocument();

    // Change name and submit
    fireEvent.change(input, { target: { value: 'Renamed Session' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameSession).toHaveBeenCalledWith('session-1', 'Renamed Session');
  });
});
