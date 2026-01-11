import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ServerMessage,
  SessionInfo,
  ClientMessage,
} from '@claude-bridge/shared';
import type { MessageStreamItem } from '../components/MessageStream';

export interface PendingPermission {
  requestId: string;
  toolName: string;
  input: unknown;
}

export interface UseSessionReturn {
  session: SessionInfo | null;
  messages: MessageStreamItem[];
  pendingPermission: PendingPermission | null;
  isLoading: boolean;
  error: string | null;
  createSession: (name?: string, workingDir?: string) => void;
  sendMessage: (content: string) => void;
  respondToPermission: (
    requestId: string,
    response: { behavior: 'allow'; updatedInput: unknown } | { behavior: 'deny'; message: string }
  ) => void;
  handleServerMessage: (message: ServerMessage) => void;
  setSend: (send: (message: ClientMessage) => void) => void;
}

export function useSession(): UseSessionReturn {
  const sendRef = useRef<((message: ClientMessage) => void) | null>(null);

  const setSend = useCallback((send: (message: ClientMessage) => void) => {
    sendRef.current = send;
  }, []);

  const send = useCallback((message: ClientMessage) => {
    sendRef.current?.(message);
  }, []);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [messages, setMessages] = useState<MessageStreamItem[]>([]);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = useCallback(
    (name?: string, workingDir?: string) => {
      send({ type: 'create_session', name, workingDir });
    },
    [send]
  );

  const sendMessage = useCallback(
    (content: string) => {
      if (!session) return;

      setMessages((prev) => [
        ...prev,
        {
          type: 'user',
          content,
          timestamp: new Date().toISOString(),
        },
      ]);
      setIsLoading(true);
      send({ type: 'user_message', sessionId: session.id, content });
    },
    [session, send]
  );

  const respondToPermission = useCallback(
    (
      requestId: string,
      response: { behavior: 'allow'; updatedInput: unknown } | { behavior: 'deny'; message: string }
    ) => {
      if (!session) return;

      send({
        type: 'permission_response',
        sessionId: session.id,
        requestId,
        response,
      });
      setPendingPermission(null);
    },
    [session, send]
  );

  const handleServerMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'session_created':
        setSession(message.session);
        setMessages([]);
        setError(null);
        break;

      case 'text_output':
        setMessages((prev) => {
          // If last message is assistant, append to it
          const lastMessage = prev[prev.length - 1];
          if (lastMessage?.type === 'assistant' && typeof lastMessage.content === 'string') {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMessage,
                content: lastMessage.content + message.text,
              },
            ];
          }
          // Otherwise create new assistant message
          return [
            ...prev,
            {
              type: 'assistant',
              content: message.text,
              timestamp: new Date().toISOString(),
            },
          ];
        });
        break;

      case 'tool_use':
        setMessages((prev) => [
          ...prev,
          {
            type: 'tool_use',
            content: {
              toolName: message.toolName,
              toolUseId: message.toolUseId,
              input: message.input,
            },
            timestamp: new Date().toISOString(),
          },
        ]);
        break;

      case 'tool_result':
        setMessages((prev) => [
          ...prev,
          {
            type: 'tool_result',
            content: {
              toolUseId: message.toolUseId,
              content: message.content,
              isError: message.isError ?? false,
            },
            timestamp: new Date().toISOString(),
          },
        ]);
        break;

      case 'result':
        setIsLoading(false);
        break;

      case 'permission_request':
        setPendingPermission({
          requestId: message.requestId,
          toolName: message.toolName,
          input: message.input,
        });
        break;

      case 'error':
        setError(message.message);
        setIsLoading(false);
        break;
    }
  }, []);

  return {
    session,
    messages,
    pendingPermission,
    isLoading,
    error,
    createSession,
    sendMessage,
    respondToPermission,
    handleServerMessage,
    setSend,
  };
}
