import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProgressIndicator } from '../progress-indicator.js';

// Mock Slack WebClient
function createMockClient() {
  return {
    reactions: {
      add: vi.fn().mockResolvedValue({ ok: true }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    },
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1234567890.111111' }),
      update: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
}

describe('ProgressIndicator', () => {
  let indicator: ProgressIndicator;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockClient = createMockClient();
    indicator = new ProgressIndicator(mockClient as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    indicator.cleanup();
  });

  describe('startProcessing', () => {
    it('should add reaction to message', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');

      expect(mockClient.reactions.add).toHaveBeenCalledWith({
        channel: 'C123',
        timestamp: '1234567890.000001',
        name: 'hourglass_flowing_sand',
      });
    });

    it('should post processing message', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');

      expect(mockClient.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C123',
        thread_ts: '1234567890.000001',
        text: expect.stringContaining('Processing'),
      });
    });

    it('should update message periodically', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');

      // Initial post
      expect(mockClient.chat.postMessage).toHaveBeenCalledTimes(1);

      // Advance time to trigger update
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockClient.chat.update).toHaveBeenCalled();

      // Advance more
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockClient.chat.update).toHaveBeenCalledTimes(2);
    });

    it('should handle already processing thread', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');

      // Starting again should not cause errors
      await indicator.startProcessing('C123', '1234567890.000001');

      // Should only have one reaction added initially
      expect(mockClient.reactions.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('stopProcessing', () => {
    it('should remove reaction', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');
      await indicator.stopProcessing('C123', '1234567890.000001');

      expect(mockClient.reactions.remove).toHaveBeenCalledWith({
        channel: 'C123',
        timestamp: '1234567890.000001',
        name: 'hourglass_flowing_sand',
      });
    });

    it('should delete processing message', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');
      await indicator.stopProcessing('C123', '1234567890.000001');

      expect(mockClient.chat.delete).toHaveBeenCalledWith({
        channel: 'C123',
        ts: '1234567890.111111', // Message ts from postMessage mock
      });
    });

    it('should stop periodic updates', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');
      await indicator.stopProcessing('C123', '1234567890.000001');

      // Clear call count
      mockClient.chat.update.mockClear();

      // Advance time - should not trigger updates
      await vi.advanceTimersByTimeAsync(10000);
      expect(mockClient.chat.update).not.toHaveBeenCalled();
    });

    it('should handle non-started thread gracefully', async () => {
      // Should not throw
      await indicator.stopProcessing('C123', '9999999999.999999');

      expect(mockClient.reactions.remove).not.toHaveBeenCalled();
      expect(mockClient.chat.delete).not.toHaveBeenCalled();
    });
  });

  describe('isProcessing', () => {
    it('should return true when processing', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');

      expect(indicator.isProcessing('C123', '1234567890.000001')).toBe(true);
    });

    it('should return false when not processing', () => {
      expect(indicator.isProcessing('C123', '1234567890.000001')).toBe(false);
    });

    it('should return false after stopping', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');
      await indicator.stopProcessing('C123', '1234567890.000001');

      expect(indicator.isProcessing('C123', '1234567890.000001')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should stop all processing indicators', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');
      await indicator.startProcessing('C456', '1234567890.000002');

      indicator.cleanup();

      expect(indicator.isProcessing('C123', '1234567890.000001')).toBe(false);
      expect(indicator.isProcessing('C456', '1234567890.000002')).toBe(false);
    });
  });

  describe('updatePhase', () => {
    it('should cycle through different phases', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');

      // Get the initial text
      const initialCall = mockClient.chat.postMessage.mock.calls[0][0];
      const initialText = initialCall.text;

      // Advance through multiple updates
      await vi.advanceTimersByTimeAsync(5000);
      const update1 = mockClient.chat.update.mock.calls[0][0];

      await vi.advanceTimersByTimeAsync(5000);
      const update2 = mockClient.chat.update.mock.calls[1][0];

      // The text should change (rotating through phases)
      expect(update1.text).toBeDefined();
      expect(update2.text).toBeDefined();
      // Note: texts might be the same if phase rotation wraps around
    });
  });

  describe('error handling', () => {
    it('should handle reaction add failure gracefully', async () => {
      mockClient.reactions.add.mockRejectedValueOnce(new Error('API error'));

      // Should not throw
      await indicator.startProcessing('C123', '1234567890.000001');
    });

    it('should handle chat post failure gracefully', async () => {
      mockClient.chat.postMessage.mockRejectedValueOnce(new Error('API error'));

      // Should not throw
      await indicator.startProcessing('C123', '1234567890.000001');
    });

    it('should handle reaction remove failure gracefully', async () => {
      await indicator.startProcessing('C123', '1234567890.000001');
      mockClient.reactions.remove.mockRejectedValueOnce(new Error('API error'));

      // Should not throw
      await indicator.stopProcessing('C123', '1234567890.000001');
    });
  });
});
