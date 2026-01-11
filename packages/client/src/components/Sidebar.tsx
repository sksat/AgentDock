import { useState, useCallback, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import type { SessionStatus } from '@claude-bridge/shared';

export interface SidebarSession {
  id: string;
  name: string;
  status: SessionStatus;
  createdAt: string;
}

export interface SidebarProps {
  sessions: SidebarSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, name: string) => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onRenameSession,
}: SidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleDoubleClick = useCallback((session: SidebarSession) => {
    setRenamingId(session.id);
    setRenameValue(session.name);
  }, []);

  const handleRenameSubmit = useCallback(
    (sessionId: string) => {
      const trimmed = renameValue.trim();
      if (trimmed && trimmed !== sessions.find((s) => s.id === sessionId)?.name) {
        onRenameSession(sessionId, trimmed);
      }
      setRenamingId(null);
    },
    [renameValue, sessions, onRenameSession]
  );

  const handleRenameKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, sessionId: string) => {
      if (e.key === 'Enter') {
        handleRenameSubmit(sessionId);
      } else if (e.key === 'Escape') {
        setRenamingId(null);
      }
    },
    [handleRenameSubmit]
  );

  return (
    <aside className="w-64 h-full flex flex-col bg-bg-secondary border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-medium text-text-secondary">Sessions</h2>
        <button
          onClick={onCreateSession}
          aria-label="New Session"
          className={clsx(
            'w-8 h-8 flex items-center justify-center rounded-lg',
            'text-text-secondary hover:text-text-primary',
            'hover:bg-bg-tertiary',
            'focus:outline-none focus:ring-2 focus:ring-accent-primary/50',
            'transition-colors'
          )}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-secondary text-sm">
            No sessions
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                isRenaming={session.id === renamingId}
                renameValue={renameValue}
                onSelect={() => onSelectSession(session.id)}
                onDelete={() => onDeleteSession(session.id)}
                onDoubleClick={() => handleDoubleClick(session)}
                onRenameChange={setRenameValue}
                onRenameSubmit={() => handleRenameSubmit(session.id)}
                onRenameKeyDown={(e) => handleRenameKeyDown(e, session.id)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

interface SessionItemProps {
  session: SidebarSession;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  onSelect: () => void;
  onDelete: () => void;
  onDoubleClick: () => void;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

function SessionItem({
  session,
  isActive,
  isRenaming,
  renameValue,
  onSelect,
  onDelete,
  onDoubleClick,
  onRenameChange,
  onRenameSubmit,
  onRenameKeyDown,
}: SessionItemProps) {
  const statusColor = {
    idle: 'bg-text-secondary',
    running: 'bg-accent-primary animate-pulse',
    waiting_input: 'bg-accent-success',
    waiting_permission: 'bg-yellow-500',
  }[session.status];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      data-active={isActive || undefined}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left',
        'transition-colors group cursor-pointer',
        isActive
          ? 'bg-accent-primary/20 text-text-primary'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
      )}
    >
      {/* Status indicator */}
      <span
        data-testid={`status-${session.id}`}
        data-status={session.status}
        className={clsx('w-2 h-2 rounded-full flex-shrink-0', statusColor)}
      />

      {/* Session name */}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={onRenameKeyDown}
            onBlur={onRenameSubmit}
            autoFocus
            className={clsx(
              'w-full px-2 py-0.5 rounded text-sm',
              'bg-bg-tertiary text-text-primary',
              'border border-accent-primary',
              'focus:outline-none'
            )}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="block truncate text-sm">{session.name}</span>
        )}
      </div>

      {/* Delete button (shown on hover, not for active or running sessions) */}
      {!isActive && session.status === 'idle' && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${session.name}`}
          className={clsx(
            'w-6 h-6 flex items-center justify-center rounded',
            'text-text-secondary hover:text-accent-danger',
            'hover:bg-accent-danger/10',
            'opacity-0 group-hover:opacity-100',
            'focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-accent-danger/50',
            'transition-all'
          )}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
