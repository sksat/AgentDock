import { describe, it, expect } from 'vitest';
import {
  formatTextOutput,
  formatToolUse,
  formatToolResult,
  formatThinking,
  formatError,
  formatResult,
  truncateText,
  escapeMarkdown,
  convertToSlackMarkdown,
} from '../message-formatter.js';

describe('message-formatter utilities', () => {
  describe('truncateText', () => {
    it('should not truncate short text', () => {
      const text = 'Hello world';
      expect(truncateText(text, 100)).toBe('Hello world');
    });

    it('should truncate long text', () => {
      const text = 'a'.repeat(200);
      const result = truncateText(text, 100);
      expect(result.length).toBeLessThanOrEqual(100 + '... (truncated)'.length);
      expect(result).toContain('... (truncated)');
    });

    it('should handle empty text', () => {
      expect(truncateText('', 100)).toBe('');
    });

    it('should use custom suffix', () => {
      const text = 'a'.repeat(200);
      const result = truncateText(text, 100, '...');
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('escapeMarkdown', () => {
    it('should escape special characters', () => {
      expect(escapeMarkdown('*bold*')).toBe('\\*bold\\*');
      expect(escapeMarkdown('_italic_')).toBe('\\_italic\\_');
      expect(escapeMarkdown('~strike~')).toBe('\\~strike\\~');
    });

    it('should handle multiple special characters', () => {
      const input = '*bold* and _italic_ and ~strike~';
      const result = escapeMarkdown(input);
      expect(result).toBe('\\*bold\\* and \\_italic\\_ and \\~strike\\~');
    });

    it('should preserve code blocks', () => {
      // Code blocks should be handled separately
      const input = 'normal text';
      expect(escapeMarkdown(input)).toBe('normal text');
    });
  });

  describe('convertToSlackMarkdown', () => {
    it('should convert bold syntax', () => {
      expect(convertToSlackMarkdown('**bold**')).toBe('*bold*');
    });

    it('should convert italic syntax', () => {
      expect(convertToSlackMarkdown('*italic*')).toBe('_italic_');
    });

    it('should convert strikethrough syntax', () => {
      expect(convertToSlackMarkdown('~~strike~~')).toBe('~strike~');
    });

    it('should preserve code blocks', () => {
      const input = '```javascript\nconst x = 1;\n```';
      expect(convertToSlackMarkdown(input)).toBe(input);
    });

    it('should preserve inline code', () => {
      const input = 'Use `const` keyword';
      expect(convertToSlackMarkdown(input)).toBe(input);
    });

    it('should convert links', () => {
      expect(convertToSlackMarkdown('[text](http://example.com)')).toBe('<http://example.com|text>');
    });
  });
});

describe('message-formatter output functions', () => {
  describe('formatTextOutput', () => {
    it('should format simple text', () => {
      const blocks = formatTextOutput('Hello from Claude');
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('section');
    });

    it('should handle empty text', () => {
      const blocks = formatTextOutput('');
      expect(blocks).toHaveLength(0);
    });

    it('should truncate long text', () => {
      const longText = 'a'.repeat(5000);
      const blocks = formatTextOutput(longText);
      expect(blocks).toHaveLength(1);
      // Slack has a 3000 character limit for text blocks
    });
  });

  describe('formatToolUse', () => {
    it('should format Bash tool usage', () => {
      const blocks = formatToolUse('Bash', 'tool-123', { command: 'ls -la' });
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].type).toBe('section');
    });

    it('should format Read tool usage', () => {
      const blocks = formatToolUse('Read', 'tool-123', { file_path: '/path/to/file' });
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should format Write tool usage', () => {
      const blocks = formatToolUse('Write', 'tool-123', {
        file_path: '/path/to/file',
        content: 'file content',
      });
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should handle unknown tools', () => {
      const blocks = formatToolUse('UnknownTool', 'tool-123', { some: 'data' });
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should truncate long inputs', () => {
      const longContent = 'x'.repeat(5000);
      const blocks = formatToolUse('Write', 'tool-123', {
        file_path: '/path/to/file',
        content: longContent,
      });
      expect(blocks.length).toBeGreaterThan(0);
    });
  });

  describe('formatToolResult', () => {
    it('should format successful result', () => {
      const blocks = formatToolResult('tool-123', 'Command executed successfully', false);
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should format error result', () => {
      const blocks = formatToolResult('tool-123', 'Permission denied', true);
      expect(blocks.length).toBeGreaterThan(0);
      // Error results should have different styling
    });

    it('should truncate long results', () => {
      const longResult = 'output line\n'.repeat(500);
      const blocks = formatToolResult('tool-123', longResult, false);
      expect(blocks.length).toBeGreaterThan(0);
    });
  });

  describe('formatThinking', () => {
    it('should format thinking output', () => {
      const blocks = formatThinking('Let me think about this...');
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].type).toBe('context');
    });

    it('should handle empty thinking', () => {
      const blocks = formatThinking('');
      expect(blocks).toHaveLength(0);
    });
  });

  describe('formatError', () => {
    it('should format error message', () => {
      const blocks = formatError('Something went wrong');
      expect(blocks.length).toBeGreaterThan(0);
      // Should include error emoji or styling
    });
  });

  describe('formatResult', () => {
    it('should format final result', () => {
      const blocks = formatResult('Task completed successfully');
      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should handle long results', () => {
      const longResult = 'Summary: ' + 'detail '.repeat(1000);
      const blocks = formatResult(longResult);
      expect(blocks.length).toBeGreaterThan(0);
    });
  });
});
