import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSession } from '../useSession';

describe('useSession', () => {
  describe('Session-bound popups', () => {
    it('should only show pendingQuestion for active session', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create two sessions
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
            { id: 'session-2', name: 'Session 2', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      expect(result.current.activeSessionId).toBe('session-1');

      // Receive ask_user_question for session-1 (active)
      act(() => {
        result.current.handleServerMessage({
          type: 'ask_user_question',
          sessionId: 'session-1',
          requestId: 'req-1',
          questions: [{ question: 'Test?', header: 'Test', options: [], multiSelect: false }],
        });
      });

      // Should show pendingQuestion for active session
      expect(result.current.pendingQuestion).not.toBeNull();
      expect(result.current.pendingQuestion?.requestId).toBe('req-1');
    });

    it('should NOT show pendingQuestion when question is for different session', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create two sessions
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
            { id: 'session-2', name: 'Session 2', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive ask_user_question for session-2 (inactive)
      act(() => {
        result.current.handleServerMessage({
          type: 'ask_user_question',
          sessionId: 'session-2',
          requestId: 'req-2',
          questions: [{ question: 'Test?', header: 'Test', options: [], multiSelect: false }],
        });
      });

      // Should NOT show pendingQuestion for different session
      expect(result.current.pendingQuestion).toBeNull();
    });

    it('should show correct pendingQuestion when switching sessions', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create two sessions
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
            { id: 'session-2', name: 'Session 2', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive question for session-1
      act(() => {
        result.current.handleServerMessage({
          type: 'ask_user_question',
          sessionId: 'session-1',
          requestId: 'req-1',
          questions: [{ question: 'Question for session 1?', header: 'Q1', options: [], multiSelect: false }],
        });
      });

      expect(result.current.pendingQuestion?.requestId).toBe('req-1');

      // Receive question for session-2 (while still on session-1)
      act(() => {
        result.current.handleServerMessage({
          type: 'ask_user_question',
          sessionId: 'session-2',
          requestId: 'req-2',
          questions: [{ question: 'Question for session 2?', header: 'Q2', options: [], multiSelect: false }],
        });
      });

      // Still showing session-1's question
      expect(result.current.pendingQuestion?.requestId).toBe('req-1');

      // Switch to session-2
      act(() => {
        result.current.selectSession('session-2');
      });

      // Should now show session-2's question
      expect(result.current.pendingQuestion?.requestId).toBe('req-2');

      // Switch back to session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Should show session-1's question again
      expect(result.current.pendingQuestion?.requestId).toBe('req-1');
    });

    it('should only show pendingPermission for active session', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create two sessions
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
            { id: 'session-2', name: 'Session 2', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive permission_request for session-1 (active)
      act(() => {
        result.current.handleServerMessage({
          type: 'permission_request',
          sessionId: 'session-1',
          requestId: 'perm-1',
          toolName: 'Bash',
          input: { command: 'ls' },
        });
      });

      // Should show pendingPermission for active session
      expect(result.current.pendingPermission).not.toBeNull();
      expect(result.current.pendingPermission?.requestId).toBe('perm-1');
    });

    it('should NOT show pendingPermission when request is for different session', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create two sessions
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
            { id: 'session-2', name: 'Session 2', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive permission_request for session-2 (inactive)
      act(() => {
        result.current.handleServerMessage({
          type: 'permission_request',
          sessionId: 'session-2',
          requestId: 'perm-2',
          toolName: 'Bash',
          input: { command: 'ls' },
        });
      });

      // Should NOT show pendingPermission for different session
      expect(result.current.pendingPermission).toBeNull();
    });

    it('should show correct pendingPermission when switching sessions', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create two sessions
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
            { id: 'session-2', name: 'Session 2', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive permission for session-1
      act(() => {
        result.current.handleServerMessage({
          type: 'permission_request',
          sessionId: 'session-1',
          requestId: 'perm-1',
          toolName: 'Bash',
          input: { command: 'ls' },
        });
      });

      expect(result.current.pendingPermission?.requestId).toBe('perm-1');

      // Receive permission for session-2 (while still on session-1)
      act(() => {
        result.current.handleServerMessage({
          type: 'permission_request',
          sessionId: 'session-2',
          requestId: 'perm-2',
          toolName: 'Edit',
          input: { file: 'test.txt' },
        });
      });

      // Still showing session-1's permission
      expect(result.current.pendingPermission?.requestId).toBe('perm-1');

      // Switch to session-2
      act(() => {
        result.current.selectSession('session-2');
      });

      // Should now show session-2's permission
      expect(result.current.pendingPermission?.requestId).toBe('perm-2');

      // Switch back to session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Should show session-1's permission again
      expect(result.current.pendingPermission?.requestId).toBe('perm-1');
    });

    it('should clear pending question when answered', () => {
      const { result } = renderHook(() => useSession());

      // Setup mock send function
      let sentMessage: unknown = null;
      act(() => {
        result.current.setSend((msg) => {
          sentMessage = msg;
        });
      });

      // Setup: Create session
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive question for session-1
      act(() => {
        result.current.handleServerMessage({
          type: 'ask_user_question',
          sessionId: 'session-1',
          requestId: 'req-1',
          questions: [{ question: 'Test?', header: 'Test', options: [], multiSelect: false }],
        });
      });

      expect(result.current.pendingQuestion).not.toBeNull();

      // Answer the question
      act(() => {
        result.current.respondToQuestion('req-1', { answer: 'yes' });
      });

      // Should clear pendingQuestion for this session
      expect(result.current.pendingQuestion).toBeNull();

      // Should have sent the response with correct sessionId
      expect(sentMessage).toEqual({
        type: 'question_response',
        sessionId: 'session-1',
        requestId: 'req-1',
        answers: { answer: 'yes' },
      });
    });

    it('should add question message to stream when answered', () => {
      const { result } = renderHook(() => useSession());

      // Setup mock send function
      act(() => {
        result.current.setSend(() => {});
      });

      // Setup: Create session
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive question for session-1
      act(() => {
        result.current.handleServerMessage({
          type: 'ask_user_question',
          sessionId: 'session-1',
          requestId: 'req-1',
          questions: [{ question: 'Which option?', header: 'Choice', options: [], multiSelect: false }],
        });
      });

      // Answer the question
      act(() => {
        result.current.respondToQuestion('req-1', { Choice: 'Option A' });
      });

      // Should have added a question message to the stream
      const questionMessages = result.current.messages.filter((m) => m.type === 'question');
      expect(questionMessages).toHaveLength(1);

      const content = questionMessages[0].content as { answers: Array<{ question: string; answer: string }> };
      expect(content.answers).toHaveLength(1);
      expect(content.answers[0].question).toBe('Which option?');
      expect(content.answers[0].answer).toBe('Option A');
    });

    it('should clear pending permission when answered', () => {
      const { result } = renderHook(() => useSession());

      // Setup mock send function
      let sentMessage: unknown = null;
      act(() => {
        result.current.setSend((msg) => {
          sentMessage = msg;
        });
      });

      // Setup: Create session
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive permission for session-1
      act(() => {
        result.current.handleServerMessage({
          type: 'permission_request',
          sessionId: 'session-1',
          requestId: 'perm-1',
          toolName: 'Bash',
          input: { command: 'ls' },
        });
      });

      expect(result.current.pendingPermission).not.toBeNull();

      // Answer the permission
      act(() => {
        result.current.respondToPermission('perm-1', { behavior: 'allow', updatedInput: { command: 'ls' } });
      });

      // Should clear pendingPermission for this session
      expect(result.current.pendingPermission).toBeNull();

      // Should have sent the response with correct sessionId
      expect(sentMessage).toEqual({
        type: 'permission_response',
        sessionId: 'session-1',
        requestId: 'perm-1',
        response: { behavior: 'allow', updatedInput: { command: 'ls' } },
      });
    });

    it('should persist pending question when switching away and back', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create two sessions
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
            { id: 'session-2', name: 'Session 2', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive question for session-1
      act(() => {
        result.current.handleServerMessage({
          type: 'ask_user_question',
          sessionId: 'session-1',
          requestId: 'req-1',
          questions: [{ question: 'Test question?', header: 'Test', options: [], multiSelect: false }],
        });
      });

      // Popup should be visible
      expect(result.current.pendingQuestion).not.toBeNull();
      expect(result.current.pendingQuestion?.requestId).toBe('req-1');

      // Switch away to session-2
      act(() => {
        result.current.selectSession('session-2');
      });

      // Popup should NOT be visible (different session)
      expect(result.current.pendingQuestion).toBeNull();

      // Switch back to session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Popup should be visible again (persisted)
      expect(result.current.pendingQuestion).not.toBeNull();
      expect(result.current.pendingQuestion?.requestId).toBe('req-1');
    });

    it('should persist pending permission when switching away and back', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create two sessions
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
            { id: 'session-2', name: 'Session 2', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive permission for session-1
      act(() => {
        result.current.handleServerMessage({
          type: 'permission_request',
          sessionId: 'session-1',
          requestId: 'perm-1',
          toolName: 'Bash',
          input: { command: 'rm -rf /' },
        });
      });

      // Popup should be visible
      expect(result.current.pendingPermission).not.toBeNull();
      expect(result.current.pendingPermission?.requestId).toBe('perm-1');

      // Switch away to session-2
      act(() => {
        result.current.selectSession('session-2');
      });

      // Popup should NOT be visible (different session)
      expect(result.current.pendingPermission).toBeNull();

      // Switch back to session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Popup should be visible again (persisted)
      expect(result.current.pendingPermission).not.toBeNull();
      expect(result.current.pendingPermission?.requestId).toBe('perm-1');
    });

    it('should receive question while viewing different session and show when switching back', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create two sessions
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
            { id: 'session-2', name: 'Session 2', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-2 (viewing session-2)
      act(() => {
        result.current.selectSession('session-2');
      });

      // Session-1 is running in background and receives a question
      act(() => {
        result.current.handleServerMessage({
          type: 'ask_user_question',
          sessionId: 'session-1',
          requestId: 'req-background',
          questions: [{ question: 'Background question?', header: 'BG', options: [], multiSelect: false }],
        });
      });

      // Popup should NOT be visible (we're on session-2)
      expect(result.current.pendingQuestion).toBeNull();

      // Switch to session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Now the popup should be visible
      expect(result.current.pendingQuestion).not.toBeNull();
      expect(result.current.pendingQuestion?.requestId).toBe('req-background');
    });
  });
});
