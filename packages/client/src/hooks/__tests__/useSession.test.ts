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

  describe('Screencast state', () => {
    it('should handle screencast_frame message', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create session
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive screencast frame
      act(() => {
        result.current.handleServerMessage({
          type: 'screencast_frame',
          sessionId: 'session-1',
          data: 'base64data',
          metadata: { deviceWidth: 1280, deviceHeight: 720, timestamp: 1234567890 },
        });
      });

      // Should have frame data
      expect(result.current.screencast).not.toBeNull();
      expect(result.current.screencast?.frame?.data).toBe('base64data');
      expect(result.current.screencast?.frame?.metadata.deviceWidth).toBe(1280);
    });

    it('should handle screencast_status message', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create session
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session
      act(() => {
        result.current.selectSession('session-1');
      });

      // Receive screencast status
      act(() => {
        result.current.handleServerMessage({
          type: 'screencast_status',
          sessionId: 'session-1',
          active: true,
          browserUrl: 'https://example.com',
        });
      });

      // Should have status data
      expect(result.current.screencast?.active).toBe(true);
      expect(result.current.screencast?.browserUrl).toBe('https://example.com');
    });

    it('should store screencast state per session', () => {
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

      // Receive frame for session-1
      act(() => {
        result.current.handleServerMessage({
          type: 'screencast_frame',
          sessionId: 'session-1',
          data: 'frame-1',
          metadata: { deviceWidth: 1280, deviceHeight: 720, timestamp: 1 },
        });
      });

      // Receive frame for session-2
      act(() => {
        result.current.handleServerMessage({
          type: 'screencast_frame',
          sessionId: 'session-2',
          data: 'frame-2',
          metadata: { deviceWidth: 800, deviceHeight: 600, timestamp: 2 },
        });
      });

      // Should show session-1's frame
      expect(result.current.screencast?.frame?.data).toBe('frame-1');

      // Switch to session-2
      act(() => {
        result.current.selectSession('session-2');
      });

      // Should show session-2's frame
      expect(result.current.screencast?.frame?.data).toBe('frame-2');

      // Switch back to session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Should show session-1's frame again
      expect(result.current.screencast?.frame?.data).toBe('frame-1');
    });

    it('should return null screencast when no session is active', () => {
      const { result } = renderHook(() => useSession());

      expect(result.current.screencast).toBeNull();
    });
  });

  describe('History conversion for display', () => {
    it('should convert Bash tool_use to bash_tool with merged result', () => {
      const { result } = renderHook(() => useSession());

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

      // Receive session history with Bash tool_use and tool_result
      act(() => {
        result.current.handleServerMessage({
          type: 'session_attached',
          sessionId: 'session-1',
          history: [
            {
              type: 'tool_use',
              content: { toolName: 'Bash', toolUseId: 'bash-1', input: { command: 'ls -la', description: 'List files' } },
              timestamp: '2024-01-01T00:00:00Z',
            },
            {
              type: 'tool_result',
              content: { toolUseId: 'bash-1', content: 'file1.txt\nfile2.txt', isError: false },
              timestamp: '2024-01-01T00:00:01Z',
            },
          ],
        });
      });

      // Should have converted to unified 'tool' type with merged result
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].type).toBe('tool');
      const content = result.current.messages[0].content as { toolName: string; input: unknown; output: string; isComplete: boolean };
      expect(content.toolName).toBe('Bash');
      expect((content.input as { command: string }).command).toBe('ls -la');
      expect(content.output).toBe('file1.txt\nfile2.txt');
      expect(content.isComplete).toBe(true);
    });

    it('should convert MCP tool_use to unified tool type with merged result', () => {
      const { result } = renderHook(() => useSession());

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

      // Receive session history with MCP tool_use and tool_result
      act(() => {
        result.current.handleServerMessage({
          type: 'session_attached',
          sessionId: 'session-1',
          history: [
            {
              type: 'tool_use',
              content: { toolName: 'mcp__bridge__browser_navigate', toolUseId: 'mcp-1', input: { url: 'https://example.com' } },
              timestamp: '2024-01-01T00:00:00Z',
            },
            {
              type: 'tool_result',
              content: { toolUseId: 'mcp-1', content: 'Navigated successfully', isError: false },
              timestamp: '2024-01-01T00:00:01Z',
            },
          ],
        });
      });

      // Should have converted to unified 'tool' type with merged result
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].type).toBe('tool');
      const content = result.current.messages[0].content as { toolName: string; output: string; isComplete: boolean };
      expect(content.toolName).toBe('mcp__bridge__browser_navigate');
      expect(content.output).toBe('Navigated successfully');
      expect(content.isComplete).toBe(true);
    });

    it('should convert file tool_use to unified tool type with merged result', () => {
      const { result } = renderHook(() => useSession());

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

      // Receive session history with Read tool (not Bash or mcp__)
      act(() => {
        result.current.handleServerMessage({
          type: 'session_attached',
          sessionId: 'session-1',
          history: [
            {
              type: 'tool_use',
              content: { toolName: 'Read', toolUseId: 'read-1', input: { file_path: '/tmp/test.txt' } },
              timestamp: '2024-01-01T00:00:00Z',
            },
            {
              type: 'tool_result',
              content: { toolUseId: 'read-1', content: 'file content', isError: false },
              timestamp: '2024-01-01T00:00:01Z',
            },
          ],
        });
      });

      // Read tool should be converted to unified 'tool' type with merged result
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].type).toBe('tool');
      const content = result.current.messages[0].content as { toolName: string; output: string; isComplete: boolean };
      expect(content.toolName).toBe('Read');
      expect(content.output).toBe('file content');
      expect(content.isComplete).toBe(true);
    });
  });

  describe('Permission persistence on reload', () => {
    it('should restore pendingPermission from session_attached', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create session
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'waiting_permission' },
          ],
        });
      });

      // Select session-1
      act(() => {
        result.current.selectSession('session-1');
      });

      // Initially no pending permission
      expect(result.current.pendingPermission).toBeNull();

      // Receive session_attached with pendingPermission (simulating page reload)
      act(() => {
        result.current.handleServerMessage({
          type: 'session_attached',
          sessionId: 'session-1',
          history: [],
          pendingPermission: {
            requestId: 'perm-restored',
            toolName: 'Write',
            input: { file_path: '/tmp/test.txt', content: 'hello' },
          },
        });
      });

      // Should restore pendingPermission
      expect(result.current.pendingPermission).not.toBeNull();
      expect(result.current.pendingPermission?.requestId).toBe('perm-restored');
      expect(result.current.pendingPermission?.toolName).toBe('Write');
    });

    it('should not set pendingPermission if not present in session_attached', () => {
      const { result } = renderHook(() => useSession());

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

      // Receive session_attached without pendingPermission
      act(() => {
        result.current.handleServerMessage({
          type: 'session_attached',
          sessionId: 'session-1',
          history: [],
        });
      });

      // Should not have pendingPermission
      expect(result.current.pendingPermission).toBeNull();
    });
  });

  describe('Session-bound isLoading state', () => {
    it('should NOT reset isLoading when result arrives for different session', () => {
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

      // Make session-1 running (simulate user message)
      act(() => {
        result.current.handleServerMessage({
          type: 'session_status_changed',
          sessionId: 'session-1',
          status: 'running',
        });
      });

      // isLoading should be true for active session
      expect(result.current.isLoading).toBe(true);

      // Receive result for session-2 (different session)
      act(() => {
        result.current.handleServerMessage({
          type: 'result',
          sessionId: 'session-2',
          result: 'Result for session 2',
        });
      });

      // isLoading should STILL be true (session-1 is still running)
      expect(result.current.isLoading).toBe(true);
    });

    it('should NOT reset isLoading when error arrives for different session', () => {
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

      // Make session-1 running
      act(() => {
        result.current.handleServerMessage({
          type: 'session_status_changed',
          sessionId: 'session-1',
          status: 'running',
        });
      });

      // isLoading should be true for active session
      expect(result.current.isLoading).toBe(true);

      // Receive error for session-2 (different session)
      act(() => {
        result.current.handleServerMessage({
          type: 'error',
          sessionId: 'session-2',
          message: 'Error in session 2',
        });
      });

      // isLoading should STILL be true (session-1 is still running)
      expect(result.current.isLoading).toBe(true);
    });

    it('should maintain separate isLoading state per session', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create two sessions with different statuses
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'running' },
            { id: 'session-2', name: 'Session 2', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1 (running)
      act(() => {
        result.current.selectSession('session-1');
      });

      // Simulate attach to get isRunning state
      act(() => {
        result.current.handleServerMessage({
          type: 'session_attached',
          sessionId: 'session-1',
          history: [],
          isRunning: true,
        });
      });

      // isLoading should be true for session-1
      expect(result.current.isLoading).toBe(true);

      // Switch to session-2 (idle)
      act(() => {
        result.current.selectSession('session-2');
      });

      // Simulate attach
      act(() => {
        result.current.handleServerMessage({
          type: 'session_attached',
          sessionId: 'session-2',
          history: [],
          isRunning: false,
        });
      });

      // isLoading should be false for session-2
      expect(result.current.isLoading).toBe(false);
    });

    it('should restore correct isLoading when switching back to running session', () => {
      const { result } = renderHook(() => useSession());

      // Setup: Create two sessions
      act(() => {
        result.current.handleServerMessage({
          type: 'session_list',
          sessions: [
            { id: 'session-1', name: 'Session 1', createdAt: '2024-01-01', workingDir: '/tmp', status: 'running' },
            { id: 'session-2', name: 'Session 2', createdAt: '2024-01-01', workingDir: '/tmp', status: 'idle' },
          ],
        });
      });

      // Select session-1 and attach
      act(() => {
        result.current.selectSession('session-1');
      });
      act(() => {
        result.current.handleServerMessage({
          type: 'session_attached',
          sessionId: 'session-1',
          history: [],
          isRunning: true,
        });
      });

      // isLoading should be true
      expect(result.current.isLoading).toBe(true);

      // Switch to session-2
      act(() => {
        result.current.selectSession('session-2');
      });
      act(() => {
        result.current.handleServerMessage({
          type: 'session_attached',
          sessionId: 'session-2',
          history: [],
          isRunning: false,
        });
      });

      // isLoading should be false for session-2
      expect(result.current.isLoading).toBe(false);

      // Switch back to session-1
      act(() => {
        result.current.selectSession('session-1');
      });
      act(() => {
        result.current.handleServerMessage({
          type: 'session_attached',
          sessionId: 'session-1',
          history: [],
          isRunning: true,
        });
      });

      // isLoading should be true again for session-1
      expect(result.current.isLoading).toBe(true);
    });

    it('should reset isLoading when result arrives for the SAME session', () => {
      const { result } = renderHook(() => useSession());

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

      // Make session-1 running
      act(() => {
        result.current.handleServerMessage({
          type: 'session_status_changed',
          sessionId: 'session-1',
          status: 'running',
        });
      });

      expect(result.current.isLoading).toBe(true);

      // Receive result for session-1 (same session)
      act(() => {
        result.current.handleServerMessage({
          type: 'result',
          sessionId: 'session-1',
          result: 'Result for session 1',
        });
      });

      // isLoading should be false now
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Session-bound systemInfo state', () => {
    it('should NOT update systemInfo when system_info arrives for different session', () => {
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

      // Set systemInfo for session-1
      act(() => {
        result.current.handleServerMessage({
          type: 'system_info',
          sessionId: 'session-1',
          model: 'claude-sonnet',
          cwd: '/path/to/session1',
        });
      });

      expect(result.current.systemInfo?.model).toBe('claude-sonnet');
      expect(result.current.systemInfo?.cwd).toBe('/path/to/session1');

      // Receive system_info for session-2 (different session)
      act(() => {
        result.current.handleServerMessage({
          type: 'system_info',
          sessionId: 'session-2',
          model: 'claude-opus',
          cwd: '/path/to/session2',
        });
      });

      // systemInfo should NOT be updated (still showing session-1 info)
      expect(result.current.systemInfo?.model).toBe('claude-sonnet');
      expect(result.current.systemInfo?.cwd).toBe('/path/to/session1');
    });

    it('should update systemInfo when system_info arrives for the SAME session', () => {
      const { result } = renderHook(() => useSession());

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

      // Set initial systemInfo for session-1
      act(() => {
        result.current.handleServerMessage({
          type: 'system_info',
          sessionId: 'session-1',
          model: 'claude-sonnet',
          permissionMode: 'ask',
        });
      });

      expect(result.current.systemInfo?.model).toBe('claude-sonnet');

      // Update systemInfo for session-1 (same session)
      act(() => {
        result.current.handleServerMessage({
          type: 'system_info',
          sessionId: 'session-1',
          model: 'claude-opus',
          permissionMode: 'auto-edit',
        });
      });

      // systemInfo should be updated
      expect(result.current.systemInfo?.model).toBe('claude-opus');
      expect(result.current.systemInfo?.permissionMode).toBe('auto-edit');
    });
  });
});
