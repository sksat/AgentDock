import { describe, it, expect } from 'vitest';
import {
  buildPermissionRequestBlocks,
  buildPermissionResultBlocks,
  parsePermissionAction,
  formatToolInput,
} from '../permission-ui.js';

describe('permission-ui', () => {
  describe('buildPermissionRequestBlocks', () => {
    it('should build blocks with header and buttons', () => {
      const blocks = buildPermissionRequestBlocks('req-123', 'Bash', { command: 'rm -rf /' });

      expect(blocks.length).toBeGreaterThan(0);

      // Should have a header
      const header = blocks.find((b) => b.type === 'header');
      expect(header).toBeDefined();

      // Should have actions with buttons
      const actions = blocks.find((b) => b.type === 'actions');
      expect(actions).toBeDefined();
      expect((actions as any).elements).toHaveLength(3); // Allow, Allow for Session, Deny
    });

    it('should include request ID in action values', () => {
      const blocks = buildPermissionRequestBlocks('req-456', 'Write', {
        file_path: '/etc/passwd',
        content: 'test',
      });

      const actions = blocks.find((b) => b.type === 'actions') as any;
      expect(actions).toBeDefined();

      // Check that all buttons have the request ID in their values
      for (const element of actions.elements) {
        const value = JSON.parse(element.value);
        expect(value.requestId).toBe('req-456');
      }
    });

    it('should include tool name for allow_session action', () => {
      const blocks = buildPermissionRequestBlocks('req-789', 'Read', {
        file_path: '/path/to/file',
      });

      const actions = blocks.find((b) => b.type === 'actions') as any;
      const allowSessionButton = actions.elements.find((e: any) =>
        e.action_id.includes('allow_session')
      );

      const value = JSON.parse(allowSessionButton.value);
      expect(value.toolName).toBe('Read');
    });

    it('should format Bash command input', () => {
      const blocks = buildPermissionRequestBlocks('req-123', 'Bash', {
        command: 'ls -la /home/user',
      });

      // Should contain the command somewhere in the blocks
      const blockText = JSON.stringify(blocks);
      expect(blockText).toContain('ls -la');
    });

    it('should format Write tool input with file path', () => {
      const blocks = buildPermissionRequestBlocks('req-123', 'Write', {
        file_path: '/home/user/test.txt',
        content: 'Hello World',
      });

      const blockText = JSON.stringify(blocks);
      expect(blockText).toContain('/home/user/test.txt');
    });

    it('should truncate long inputs', () => {
      const longContent = 'x'.repeat(5000);
      const blocks = buildPermissionRequestBlocks('req-123', 'Write', {
        file_path: '/test.txt',
        content: longContent,
      });

      // Blocks should not contain the full 5000 characters
      const blockText = JSON.stringify(blocks);
      expect(blockText.length).toBeLessThan(10000);
    });
  });

  describe('buildPermissionResultBlocks', () => {
    it('should build allowed result blocks', () => {
      const blocks = buildPermissionResultBlocks('Bash', 'allowed', 'U123ABC');

      expect(blocks.length).toBeGreaterThan(0);

      const blockText = JSON.stringify(blocks);
      expect(blockText).toContain('Allowed');
      expect(blockText).toContain('U123ABC');
    });

    it('should build denied result blocks', () => {
      const blocks = buildPermissionResultBlocks('Write', 'denied', 'U456DEF');

      const blockText = JSON.stringify(blocks);
      expect(blockText).toContain('Denied');
      expect(blockText).toContain('U456DEF');
    });

    it('should include appropriate emoji', () => {
      const allowedBlocks = buildPermissionResultBlocks('Bash', 'allowed', 'U123');
      const deniedBlocks = buildPermissionResultBlocks('Bash', 'denied', 'U123');

      expect(JSON.stringify(allowedBlocks)).toContain('white_check_mark');
      expect(JSON.stringify(deniedBlocks)).toContain('x');
    });
  });

  describe('parsePermissionAction', () => {
    it('should parse allow action', () => {
      const result = parsePermissionAction(
        'allow_req-123',
        JSON.stringify({ requestId: 'req-123', action: 'allow' })
      );

      expect(result).toEqual({
        requestId: 'req-123',
        action: 'allow',
      });
    });

    it('should parse allow_session action with tool name', () => {
      const result = parsePermissionAction(
        'allow_session_req-123',
        JSON.stringify({ requestId: 'req-123', action: 'allow_session', toolName: 'Bash' })
      );

      expect(result).toEqual({
        requestId: 'req-123',
        action: 'allow_session',
        toolName: 'Bash',
      });
    });

    it('should parse deny action', () => {
      const result = parsePermissionAction(
        'deny_req-123',
        JSON.stringify({ requestId: 'req-123', action: 'deny' })
      );

      expect(result).toEqual({
        requestId: 'req-123',
        action: 'deny',
      });
    });

    it('should return null for invalid JSON', () => {
      const result = parsePermissionAction('allow_req-123', 'invalid json');
      expect(result).toBeNull();
    });

    it('should return null for missing fields', () => {
      const result = parsePermissionAction('allow_req-123', JSON.stringify({ foo: 'bar' }));
      expect(result).toBeNull();
    });
  });

  describe('formatToolInput', () => {
    it('should format Bash input', () => {
      const formatted = formatToolInput('Bash', { command: 'echo hello' });
      expect(formatted).toContain('echo hello');
    });

    it('should format Read input', () => {
      const formatted = formatToolInput('Read', { file_path: '/path/to/file' });
      expect(formatted).toContain('/path/to/file');
    });

    it('should format Write input', () => {
      const formatted = formatToolInput('Write', {
        file_path: '/path/to/file',
        content: 'file content',
      });
      expect(formatted).toContain('/path/to/file');
      expect(formatted).toContain('file content');
    });

    it('should format Edit input', () => {
      const formatted = formatToolInput('Edit', {
        file_path: '/path/to/file',
        old_string: 'old',
        new_string: 'new',
      });
      expect(formatted).toContain('/path/to/file');
    });

    it('should format unknown tools as JSON', () => {
      const formatted = formatToolInput('UnknownTool', { some: 'data' });
      expect(formatted).toContain('some');
      expect(formatted).toContain('data');
    });

    it('should truncate long content', () => {
      const longContent = 'x'.repeat(2000);
      const formatted = formatToolInput('Write', {
        file_path: '/test.txt',
        content: longContent,
      });
      expect(formatted.length).toBeLessThan(2000);
    });
  });
});
