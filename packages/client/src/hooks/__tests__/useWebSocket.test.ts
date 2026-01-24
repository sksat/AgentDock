import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';
import type { ServerMessage } from '@agent-dock/shared';

// Mock WebSocket
let mockInstances: MockWebSocket[] = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sendMock = vi.fn();

  constructor(url: string) {
    this.url = url;
    mockInstances.push(this);
    // Simulate async connection
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(data: string) {
    this.sendMock(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // Helper to simulate receiving a message
  simulateMessage(data: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('useWebSocket', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    mockInstances = [];
    originalWebSocket = globalThis.WebSocket;
    // @ts-expect-error - Mock WebSocket for testing
    globalThis.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    mockInstances = [];
  });

  it('should connect to WebSocket server', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3001/ws', { reconnect: false })
    );

    // Initially not connected
    expect(result.current.isConnected).toBe(false);

    // Wait for connection
    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });
  });

  it('should send messages', async () => {
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3001/ws', { reconnect: false })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    act(() => {
      result.current.send({ type: 'list_sessions' });
    });

    expect(mockInstances[0].sendMock).toHaveBeenCalledWith(
      JSON.stringify({ type: 'list_sessions' })
    );
  });

  it('should handle incoming messages', async () => {
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWebSocket('ws://localhost:3001/ws', { onMessage, reconnect: false })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    act(() => {
      mockInstances[0].simulateMessage({
        type: 'session_list',
        sessions: [],
      });
    });

    expect(onMessage).toHaveBeenCalledWith({
      type: 'session_list',
      sessions: [],
    });
  });

  it('should disconnect on unmount', async () => {
    const onDisconnect = vi.fn();
    const { result, unmount } = renderHook(() =>
      useWebSocket('ws://localhost:3001/ws', { onDisconnect, reconnect: false })
    );

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true);
    });

    act(() => {
      unmount();
    });

    // onDisconnect should have been called
    expect(onDisconnect).toHaveBeenCalled();
  });

  it('should handle disconnect during CONNECTING state without errors', async () => {
    // Create a WebSocket that stays in CONNECTING state
    class SlowMockWebSocket extends MockWebSocket {
      constructor(url: string) {
        super(url);
        // Override: don't auto-connect, stay in CONNECTING
        this.readyState = MockWebSocket.CONNECTING;
      }

      // Allow manual triggering of connection
      triggerOpen() {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.();
      }
    }

    // Temporarily replace with slow mock
    // @ts-expect-error - Mock WebSocket for testing
    globalThis.WebSocket = SlowMockWebSocket;

    const closeSpy = vi.fn();
    const originalClose = SlowMockWebSocket.prototype.close;
    SlowMockWebSocket.prototype.close = function () {
      closeSpy();
      originalClose.call(this);
    };

    const { unmount } = renderHook(() =>
      useWebSocket('ws://localhost:3001/ws', { reconnect: false })
    );

    // WebSocket should be in CONNECTING state
    expect(mockInstances[0].readyState).toBe(MockWebSocket.CONNECTING);

    // Unmount while still connecting - this should NOT throw
    act(() => {
      unmount();
    });

    // close() should NOT have been called yet (waiting for open/error)
    expect(closeSpy).not.toHaveBeenCalled();

    // Simulate connection completing after unmount
    act(() => {
      (mockInstances[0] as SlowMockWebSocket).triggerOpen();
    });

    // NOW close should have been called
    expect(closeSpy).toHaveBeenCalled();

    // Restore
    // @ts-expect-error - Mock WebSocket for testing
    globalThis.WebSocket = MockWebSocket;
  });
});
