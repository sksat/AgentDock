import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar, type SidebarSession } from './Sidebar';
import type { SessionUsageInfo } from '@agent-dock/shared';

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
        globalUsage={null}
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
        globalUsage={null}
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
        globalUsage={null}
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
        globalUsage={null}
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
        globalUsage={null}
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
        globalUsage={null}
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
        globalUsage={null}
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
        globalUsage={null}
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

describe('Sidebar collapse', () => {
  const STORAGE_KEY = 'agent-dock:sidebar-collapsed';

  const mockSessions: SidebarSession[] = [
    {
      id: 'session-1',
      name: 'Session 1',
      status: 'idle',
      createdAt: '2024-01-01T00:00:00Z',
    },
  ];

  const defaultProps = {
    sessions: mockSessions,
    activeSessionId: 'session-1',
    globalUsage: null,
    onSelectSession: vi.fn(),
    onCreateSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onRenameSession: vi.fn(),
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('should render collapse toggle button', () => {
    render(<Sidebar {...defaultProps} />);

    expect(screen.getByRole('button', { name: /collapse/i })).toBeInTheDocument();
  });

  it('should toggle collapsed state on button click', () => {
    render(<Sidebar {...defaultProps} />);

    const collapseButton = screen.getByRole('button', { name: /collapse/i });

    // Initially expanded - session name should be visible
    expect(screen.getByText('Session 1')).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(collapseButton);

    // Session name should not be visible (only icon)
    expect(screen.queryByText('Session 1')).not.toBeInTheDocument();
  });

  it('should show only icons when collapsed', () => {
    render(<Sidebar {...defaultProps} />);

    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    fireEvent.click(collapseButton);

    // Should have collapsed width indicator
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
  });

  it('should persist collapsed state to localStorage', () => {
    render(<Sidebar {...defaultProps} />);

    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    fireEvent.click(collapseButton);

    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('should restore collapsed state from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'true');

    render(<Sidebar {...defaultProps} />);

    // Should start collapsed
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByText('Session 1')).not.toBeInTheDocument();
  });

  it('should expand when clicking collapse button while collapsed', () => {
    localStorage.setItem(STORAGE_KEY, 'true');

    render(<Sidebar {...defaultProps} />);

    const expandButton = screen.getByRole('button', { name: /expand/i });
    fireEvent.click(expandButton);

    // Should now be expanded
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).not.toHaveAttribute('data-collapsed', 'true');
    expect(screen.getByText('Session 1')).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });
});

describe('Session cost display', () => {
  const mockUsage: SessionUsageInfo = {
    ccusageSessionId: '-home-user-project',
    totalCost: 12.34,
    totalTokens: 1000000,
    inputTokens: 500000,
    outputTokens: 100000,
    cacheCreationTokens: 200000,
    cacheReadTokens: 200000,
    lastActivity: '2026-01-13',
    modelsUsed: ['claude-opus-4-5-20251101'],
  };

  const sessionsWithUsage: SidebarSession[] = [
    {
      id: 'session-1',
      name: 'Session 1',
      status: 'idle',
      createdAt: '2024-01-01T00:00:00Z',
      usage: mockUsage,
    },
    {
      id: 'session-2',
      name: 'Session 2',
      status: 'running',
      createdAt: '2024-01-02T00:00:00Z',
      // No usage data
    },
  ];

  const defaultProps = {
    sessions: sessionsWithUsage,
    activeSessionId: 'session-1',
    globalUsage: null,
    onSelectSession: vi.fn(),
    onCreateSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onRenameSession: vi.fn(),
  };

  it('should display session cost when usage data is available', () => {
    render(<Sidebar {...defaultProps} />);

    // Should show $12.34 formatted cost
    expect(screen.getByText('$12.34')).toBeInTheDocument();
  });

  it('should not display cost for sessions without usage data', () => {
    render(<Sidebar {...defaultProps} />);

    // Session 2 should not have a cost display
    const session2Item = screen.getByTestId('session-item-session-2');
    expect(session2Item).not.toHaveTextContent('$');
  });

  it('should format cost appropriately for small amounts', () => {
    const smallUsage: SessionUsageInfo = {
      ...mockUsage,
      totalCost: 0.05,
    };
    const sessionsWithSmallCost: SidebarSession[] = [
      {
        id: 'session-1',
        name: 'Session 1',
        status: 'idle',
        createdAt: '2024-01-01T00:00:00Z',
        usage: smallUsage,
      },
    ];

    render(<Sidebar {...defaultProps} sessions={sessionsWithSmallCost} />);

    expect(screen.getByText('$0.05')).toBeInTheDocument();
  });

  it('should format cost appropriately for large amounts', () => {
    const largeUsage: SessionUsageInfo = {
      ...mockUsage,
      totalCost: 1234.56,
    };
    const sessionsWithLargeCost: SidebarSession[] = [
      {
        id: 'session-1',
        name: 'Session 1',
        status: 'idle',
        createdAt: '2024-01-01T00:00:00Z',
        usage: largeUsage,
      },
    ];

    render(<Sidebar {...defaultProps} sessions={sessionsWithLargeCost} />);

    expect(screen.getByText('$1234.56')).toBeInTheDocument();
  });

  it('should not show cost when sidebar is collapsed', () => {
    localStorage.setItem('agent-dock:sidebar-collapsed', 'true');

    render(<Sidebar {...defaultProps} />);

    // Cost should not be visible when collapsed
    expect(screen.queryByText('$12.34')).not.toBeInTheDocument();

    localStorage.clear();
  });
});
