import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  shouldIgnoreMessage,
  extractMentionText,
  parseSlackMessage,
} from '../slack-app.js';

describe('slack-app utilities', () => {
  describe('shouldIgnoreMessage', () => {
    it('should ignore messages starting with (aside)', () => {
      expect(shouldIgnoreMessage('(aside) this is a side comment')).toBe(true);
      expect(shouldIgnoreMessage('(ASIDE) uppercase')).toBe(true);
      expect(shouldIgnoreMessage('(Aside) mixed case')).toBe(true);
    });

    it('should ignore messages with leading whitespace and (aside)', () => {
      expect(shouldIgnoreMessage('  (aside) with spaces')).toBe(true);
      expect(shouldIgnoreMessage('\t(aside) with tab')).toBe(true);
    });

    it('should not ignore regular messages', () => {
      expect(shouldIgnoreMessage('Hello Claude!')).toBe(false);
      expect(shouldIgnoreMessage('Please help me with this')).toBe(false);
    });

    it('should not ignore messages with (aside) in the middle', () => {
      expect(shouldIgnoreMessage('This is not (aside) an aside')).toBe(false);
      expect(shouldIgnoreMessage('Let me tell you (aside) something')).toBe(false);
    });

    it('should handle empty messages', () => {
      expect(shouldIgnoreMessage('')).toBe(false);
      expect(shouldIgnoreMessage('   ')).toBe(false);
    });
  });

  describe('extractMentionText', () => {
    it('should extract text after bot mention', () => {
      const result = extractMentionText('<@U123BOT> Hello Claude!', 'U123BOT');
      expect(result).toBe('Hello Claude!');
    });

    it('should handle multiple mentions', () => {
      const result = extractMentionText('<@U123BOT> <@U456USER> Hello', 'U123BOT');
      expect(result).toBe('<@U456USER> Hello');
    });

    it('should handle no text after mention', () => {
      const result = extractMentionText('<@U123BOT>', 'U123BOT');
      expect(result).toBe('');
    });

    it('should trim whitespace', () => {
      const result = extractMentionText('<@U123BOT>   Hello   ', 'U123BOT');
      expect(result).toBe('Hello');
    });

    it('should handle mention not at start', () => {
      const result = extractMentionText('Hey <@U123BOT> help me', 'U123BOT');
      // Should still work - remove the bot mention anywhere
      expect(result).toBe('Hey  help me');
    });

    it('should return original text if bot not mentioned', () => {
      const result = extractMentionText('Hello everyone', 'U123BOT');
      expect(result).toBe('Hello everyone');
    });
  });

  describe('parseSlackMessage', () => {
    it('should parse simple text', () => {
      const result = parseSlackMessage('Hello world');
      expect(result.text).toBe('Hello world');
      expect(result.mentions).toEqual([]);
    });

    it('should extract user mentions', () => {
      const result = parseSlackMessage('Hello <@U123ABC> and <@U456DEF>');
      expect(result.mentions).toContain('U123ABC');
      expect(result.mentions).toContain('U456DEF');
    });

    it('should handle channel references', () => {
      const result = parseSlackMessage('Check <#C123ABC|general>');
      expect(result.text).toBe('Check <#C123ABC|general>');
    });

    it('should handle links', () => {
      const result = parseSlackMessage('Visit <https://example.com|Example>');
      expect(result.text).toBe('Visit <https://example.com|Example>');
    });

    it('should handle code blocks', () => {
      const result = parseSlackMessage('```\nconst x = 1;\n```');
      expect(result.text).toBe('```\nconst x = 1;\n```');
    });

    it('should handle inline code', () => {
      const result = parseSlackMessage('Use `const` keyword');
      expect(result.text).toBe('Use `const` keyword');
    });
  });
});

describe('slack-app event handling', () => {
  // These tests would require more complex setup with Bolt mocking
  // For now, we test the utility functions above
  // Full integration tests can be added later

  describe('app_mention handler logic', () => {
    it('should extract text correctly from mention event', () => {
      const eventText = '<@U123BOT> Help me write a function';
      const extracted = extractMentionText(eventText, 'U123BOT');
      expect(extracted).toBe('Help me write a function');
    });

    it('should handle (aside) in mention', () => {
      const eventText = '<@U123BOT> (aside) just testing';
      const extracted = extractMentionText(eventText, 'U123BOT');
      expect(shouldIgnoreMessage(extracted)).toBe(true);
    });
  });

  describe('message handler logic', () => {
    it('should detect thread replies', () => {
      // A message is a thread reply if it has thread_ts different from ts
      const messageEvent = {
        ts: '1234567890.123456',
        thread_ts: '1234567890.000001',
      };
      const isThreadReply = messageEvent.thread_ts && messageEvent.thread_ts !== messageEvent.ts;
      expect(isThreadReply).toBe(true);
    });

    it('should detect parent messages', () => {
      const messageEvent = {
        ts: '1234567890.123456',
        thread_ts: undefined,
      };
      const isThreadReply = messageEvent.thread_ts && messageEvent.thread_ts !== messageEvent.ts;
      expect(isThreadReply).toBeFalsy();
    });
  });
});
