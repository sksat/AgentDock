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
  formatToolUseWithResult,
  type ToolResultStatus,
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

describe('formatToolUseWithResult', () => {
  describe('non-browser tools', () => {
    it('should format tool use without result', () => {
      const blocks = formatToolUseWithResult('Bash', 'tool-123', { command: 'ls -la' });
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].type).toBe('section');
      const text = (blocks[0] as any).text.text;
      expect(text).toContain(':wrench:');
      expect(text).toContain('*Bash*');
      // Should not have checkmark or error
      expect(text).not.toContain(':white_check_mark:');
      expect(text).not.toContain(':x:');
    });

    it('should format tool use with success result', () => {
      const result: ToolResultStatus = { type: 'success' };
      const blocks = formatToolUseWithResult('Bash', 'tool-123', { command: 'ls -la' }, result);
      expect(blocks.length).toBeGreaterThan(0);
      const text = (blocks[0] as any).text.text;
      expect(text).toContain(':white_check_mark:');
    });

    it('should format tool use with success result and summary', () => {
      const result: ToolResultStatus = { type: 'success', summary: '10 files found' };
      const blocks = formatToolUseWithResult('Glob', 'tool-123', { pattern: '*.ts' }, result);
      const text = (blocks[0] as any).text.text;
      expect(text).toContain(':white_check_mark:');
      expect(text).toContain('10 files found');
    });

    it('should format tool use with success result and permalink', () => {
      const result: ToolResultStatus = {
        type: 'success',
        summary: 'View result',
        permalink: 'https://slack.com/files/123',
      };
      const blocks = formatToolUseWithResult('Read', 'tool-123', { file_path: '/test.txt' }, result);
      const text = (blocks[0] as any).text.text;
      expect(text).toContain(':white_check_mark:');
      expect(text).toContain('<https://slack.com/files/123|View result>');
    });

    it('should format tool use with error result', () => {
      const result: ToolResultStatus = { type: 'error', message: 'Permission denied' };
      const blocks = formatToolUseWithResult('Bash', 'tool-123', { command: 'rm -rf /' }, result);
      const text = (blocks[0] as any).text.text;
      expect(text).toContain(':x:');
      expect(text).toContain('Permission denied');
    });

    it('should format tool use with skipped result', () => {
      const result: ToolResultStatus = { type: 'skipped' };
      const blocks = formatToolUseWithResult('Read', 'tool-123', { file_path: '/test.txt' }, result);
      const text = (blocks[0] as any).text.text;
      expect(text).toContain(':wrench:');
      expect(text).toContain('*Read*');
      // Skipped should not show any indicator
      expect(text).not.toContain(':white_check_mark:');
      expect(text).not.toContain(':x:');
    });

    it('should include input details for Bash tool', () => {
      const blocks = formatToolUseWithResult('Bash', 'tool-123', { command: 'echo hello' });
      expect(blocks.length).toBe(2); // header + context
      expect(blocks[1].type).toBe('context');
      const contextText = (blocks[1] as any).elements[0].text;
      expect(contextText).toContain('echo hello');
    });

    it('should include input details for Read tool', () => {
      const blocks = formatToolUseWithResult('Read', 'tool-123', {
        file_path: '/path/to/file.ts',
        offset: 10,
        limit: 100,
      });
      const contextText = (blocks[1] as any).elements[0].text;
      expect(contextText).toContain('/path/to/file.ts');
      expect(contextText).toContain('offset: 10');
      expect(contextText).toContain('limit: 100');
    });

    it('should include input details for Write tool', () => {
      const blocks = formatToolUseWithResult('Write', 'tool-123', {
        file_path: '/path/to/file.ts',
        content: 'const x = 1;',
      });
      const contextText = (blocks[1] as any).elements[0].text;
      expect(contextText).toContain('/path/to/file.ts');
      expect(contextText).toContain('const x = 1;');
    });

    it('should include input details for Glob tool', () => {
      const blocks = formatToolUseWithResult('Glob', 'tool-123', {
        pattern: '**/*.ts',
        path: '/src',
      });
      const contextText = (blocks[1] as any).elements[0].text;
      expect(contextText).toContain('**/*.ts');
      expect(contextText).toContain('/src');
    });

    it('should include input details for Grep tool', () => {
      const blocks = formatToolUseWithResult('Grep', 'tool-123', {
        pattern: 'TODO',
        path: '/src',
      });
      const contextText = (blocks[1] as any).elements[0].text;
      expect(contextText).toContain('TODO');
      expect(contextText).toContain('/src');
    });

    it('should format unknown tools with JSON input', () => {
      const blocks = formatToolUseWithResult('CustomTool', 'tool-123', {
        someOption: 'value',
        nested: { key: 'data' },
      });
      const contextText = (blocks[1] as any).elements[0].text;
      expect(contextText).toContain('someOption');
      expect(contextText).toContain('value');
    });
  });

  describe('browser tools', () => {
    it('should format browser navigate tool', () => {
      const blocks = formatToolUseWithResult(
        'mcp__plugin_playwright_playwright__browser_navigate',
        'tool-123',
        { url: 'https://example.com' }
      );
      expect(blocks.length).toBeGreaterThan(0);
      const text = (blocks[0] as any).text.text;
      expect(text).toContain(':globe_with_meridians:');
    });

    it('should format browser tool with success result', () => {
      const result: ToolResultStatus = { type: 'success', summary: 'Page loaded' };
      const blocks = formatToolUseWithResult(
        'mcp__plugin_playwright_playwright__browser_navigate',
        'tool-123',
        { url: 'https://example.com' },
        result
      );
      const text = (blocks[0] as any).text.text;
      expect(text).toContain(':white_check_mark:');
      expect(text).toContain('Page loaded');
    });

    it('should format browser snapshot tool', () => {
      const blocks = formatToolUseWithResult(
        'mcp__plugin_playwright_playwright__browser_snapshot',
        'tool-123',
        {}
      );
      const text = (blocks[0] as any).text.text;
      expect(text).toContain(':camera:');
    });

    it('should format browser click tool', () => {
      const blocks = formatToolUseWithResult(
        'mcp__plugin_playwright_playwright__browser_click',
        'tool-123',
        { element: 'Submit button', ref: 'btn-1' }
      );
      const text = (blocks[0] as any).text.text;
      expect(text).toContain(':computer_mouse:');
      expect(text).toContain('Click');
    });
  });
});
