import type { MessageStreamItem, ToolContent, UserMessageContent } from '../components/MessageStream';

/**
 * Generate test messages for performance testing
 */
export function generateMessages(count: number): MessageStreamItem[] {
  const messages: MessageStreamItem[] = [];
  const types: MessageStreamItem['type'][] = ['user', 'assistant', 'tool', 'thinking'];

  for (let i = 0; i < count; i++) {
    const type = types[i % types.length];
    const timestamp = new Date(Date.now() + i * 1000).toISOString();

    switch (type) {
      case 'user':
        messages.push({
          type: 'user',
          content: { text: `User message ${i}` } as UserMessageContent,
          timestamp,
        });
        break;
      case 'assistant':
        messages.push({
          type: 'assistant',
          content: `Assistant response ${i}. This is a longer message to simulate real content. `.repeat(3),
          timestamp,
        });
        break;
      case 'tool':
        messages.push({
          type: 'tool',
          content: {
            toolUseId: `tool-${i}`,
            toolName: 'Bash',
            input: { command: `echo "Command ${i}"` },
            output: `Output line ${i}\n`.repeat(5),
            isComplete: true,
            isError: false,
          } as ToolContent,
          timestamp,
        });
        break;
      case 'thinking':
        messages.push({
          type: 'thinking',
          content: `Thinking about step ${i}...`.repeat(2),
          timestamp,
        });
        break;
    }
  }

  return messages;
}

/**
 * Create a render counter for tracking component renders
 * Usage:
 *   const counter = createRenderCounter();
 *   // In component: counter.increment('ComponentName');
 *   // After test: expect(counter.get('ComponentName')).toBe(1);
 */
export function createRenderCounter() {
  const counts = new Map<string, number>();

  return {
    increment(key: string) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    },
    get(key: string): number {
      return counts.get(key) ?? 0;
    },
    getAll(): Map<string, number> {
      return new Map(counts);
    },
    reset() {
      counts.clear();
    },
    total(): number {
      let sum = 0;
      for (const count of counts.values()) {
        sum += count;
      }
      return sum;
    },
  };
}

/**
 * Measure render time for a component
 */
export function measureRenderTime(renderFn: () => void): number {
  const start = performance.now();
  renderFn();
  return performance.now() - start;
}

/**
 * Create a mock message stream item with a specific index for tracking
 */
export function createIndexedMessage(index: number, type: MessageStreamItem['type'] = 'assistant'): MessageStreamItem {
  return {
    type,
    content: type === 'user'
      ? { text: `Message ${index}` }
      : `Message ${index}`,
    timestamp: new Date(Date.now() + index).toISOString(),
  };
}
