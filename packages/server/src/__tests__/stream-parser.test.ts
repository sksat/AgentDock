import { describe, it, expect, vi } from 'vitest';
import { StreamJsonParser, type StreamEvent } from '../stream-parser.js';

describe('StreamJsonParser', () => {
  describe('parseLine', () => {
    it('should parse text event', () => {
      const parser = new StreamJsonParser();
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello, world!' }]
        }
      });

      const event = parser.parseLine(line);

      expect(event).toBeDefined();
      expect(event?.type).toBe('assistant');
    });

    it('should parse tool_use event', () => {
      const parser = new StreamJsonParser();
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'tool-123',
            name: 'Read',
            input: { file_path: '/tmp/test.txt' }
          }]
        }
      });

      const event = parser.parseLine(line);

      expect(event).toBeDefined();
      expect(event?.type).toBe('assistant');
    });

    it('should parse result event', () => {
      const parser = new StreamJsonParser();
      const line = JSON.stringify({
        type: 'result',
        result: 'Task completed successfully',
        session_id: 'session-123'
      });

      const event = parser.parseLine(line);

      expect(event).toBeDefined();
      expect(event?.type).toBe('result');
      expect((event as any).session_id).toBe('session-123');
    });

    it('should return undefined for invalid JSON', () => {
      const parser = new StreamJsonParser();
      const event = parser.parseLine('not valid json');

      expect(event).toBeUndefined();
    });

    it('should return undefined for empty line', () => {
      const parser = new StreamJsonParser();
      const event = parser.parseLine('');

      expect(event).toBeUndefined();
    });
  });

  describe('extractTextContent', () => {
    it('should extract text from assistant message', () => {
      const parser = new StreamJsonParser();
      const event: StreamEvent = {
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Hello, ' },
            { type: 'text', text: 'world!' }
          ]
        }
      };

      const text = parser.extractTextContent(event);

      expect(text).toBe('Hello, world!');
    });

    it('should return empty string for non-assistant event', () => {
      const parser = new StreamJsonParser();
      const event: StreamEvent = {
        type: 'result',
        result: 'done'
      };

      const text = parser.extractTextContent(event);

      expect(text).toBe('');
    });
  });

  describe('extractToolUse', () => {
    it('should extract tool use from assistant message', () => {
      const parser = new StreamJsonParser();
      const event: StreamEvent = {
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'tool-123',
            name: 'Bash',
            input: { command: 'ls -la' }
          }]
        }
      };

      const toolUses = parser.extractToolUse(event);

      expect(toolUses).toHaveLength(1);
      expect(toolUses[0].name).toBe('Bash');
      expect(toolUses[0].id).toBe('tool-123');
    });

    it('should return empty array for non-assistant event', () => {
      const parser = new StreamJsonParser();
      const event: StreamEvent = {
        type: 'result',
        result: 'done'
      };

      const toolUses = parser.extractToolUse(event);

      expect(toolUses).toEqual([]);
    });
  });
});
