import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageStream, type MessageStreamItem } from '../MessageStream';
import {
  generateMessages,
  createRenderCounter,
  measureRenderTime,
  createIndexedMessage,
} from '../../test-utils/performance';

// Mock scrollIntoView which is not implemented in jsdom
Element.prototype.scrollIntoView = vi.fn();

// Global render counter for tracking MessageItem renders
const renderCounter = createRenderCounter();

// Mock MessageItem to track renders
// Note: This test file documents the current (unoptimized) behavior
// and will be used to verify improvements after optimization

describe('MessageStream performance', () => {
  beforeEach(() => {
    renderCounter.reset();
    localStorage.clear();
  });

  describe('baseline measurements', () => {
    it('should render 100 messages', () => {
      const messages = generateMessages(100);

      const { container } = render(<MessageStream messages={messages} />);

      const messageItems = container.querySelectorAll('[data-testid="message-item"]');
      // Not all message types have data-testid, so we check for reasonable count
      expect(messageItems.length).toBeGreaterThan(0);
    });

    it('should measure render time for 100 messages', () => {
      const messages = generateMessages(100);

      const renderTime = measureRenderTime(() => {
        render(<MessageStream messages={messages} />);
      });

      // Log baseline for reference (not a hard assertion)
      console.log(`Baseline render time for 100 messages: ${renderTime.toFixed(2)}ms`);

      // Sanity check - rendering should complete in reasonable time
      expect(renderTime).toBeLessThan(5000); // 5 seconds max
    });

    it('should measure render time for 500 messages', () => {
      const messages = generateMessages(500);

      const renderTime = measureRenderTime(() => {
        render(<MessageStream messages={messages} />);
      });

      console.log(`Baseline render time for 500 messages: ${renderTime.toFixed(2)}ms`);
      expect(renderTime).toBeLessThan(10000); // 10 seconds max
    });
  });

  describe('performance thresholds', () => {
    // These tests ensure performance doesn't regress significantly.
    // Thresholds are set with margin to account for CI environment variations.
    // Current optimized values: 100msg ~120ms, 500msg ~350ms

    it('should render 100 messages within threshold', () => {
      const messages = generateMessages(100);

      const renderTime = measureRenderTime(() => {
        render(<MessageStream messages={messages} />);
      });

      // Threshold: 500ms (allows ~4x margin for CI variability)
      expect(renderTime).toBeLessThan(500);
    });

    it('should render 500 messages within threshold', () => {
      const messages = generateMessages(500);

      const renderTime = measureRenderTime(() => {
        render(<MessageStream messages={messages} />);
      });

      // Threshold: 800ms (local ~350ms, CI runners ~700ms)
      expect(renderTime).toBeLessThan(800);
    });
  });

  describe('re-render behavior (current - unoptimized)', () => {
    it('documents current behavior: all messages re-render when props change', () => {
      const messages: MessageStreamItem[] = [
        createIndexedMessage(0, 'user'),
        createIndexedMessage(1, 'assistant'),
        createIndexedMessage(2, 'user'),
      ];

      const { rerender } = render(<MessageStream messages={messages} />);

      // Add a new message
      const newMessages = [
        ...messages,
        createIndexedMessage(3, 'assistant'),
      ];

      rerender(<MessageStream messages={newMessages} />);

      // Current behavior: all message items are re-rendered
      // This test documents the current (unoptimized) state
      // After Phase 1, we should see only 1 new render for the new message
      const items = screen.getAllByTestId('message-item');
      expect(items).toHaveLength(4);
    });
  });

  describe('Phase 1 target: MessageItem memoization', () => {
    // This test will fail initially and pass after Phase 1 optimization
    it.skip('should not re-render existing MessageItems when new message is added', () => {
      // This test requires instrumenting MessageItem with render counting
      // Will be enabled after Phase 1 implementation
      const messages = generateMessages(10);

      const { rerender } = render(<MessageStream messages={messages} />);

      // Reset counter after initial render
      renderCounter.reset();

      // Add a new message
      const newMessages = [...messages, createIndexedMessage(10, 'assistant')];
      rerender(<MessageStream messages={newMessages} />);

      // After optimization: only 1 render for the new message
      // Current (unoptimized): 11 renders (all messages re-render)
      expect(renderCounter.total()).toBe(1);
    });
  });

  describe('Phase 2 target: stable keys', () => {
    it('uses index as key (current behavior)', () => {
      // This test documents the current key usage
      // After Phase 2, keys should be based on message id/timestamp
      const messages: MessageStreamItem[] = [
        { type: 'user', content: { text: 'First' }, timestamp: '2024-01-01T00:00:00Z' },
        { type: 'assistant', content: 'Second', timestamp: '2024-01-01T00:00:01Z' },
      ];

      render(<MessageStream messages={messages} />);

      const items = screen.getAllByTestId('message-item');
      expect(items).toHaveLength(2);

      // Current: if a message is inserted at the beginning, all keys shift
      // This causes unnecessary DOM updates
    });

    it('should use stable keys without index fallback for messages with id', () => {
      // Test that messages with id property use that id as key (not index)
      const messages: MessageStreamItem[] = [
        { id: 'msg-1', type: 'user', content: { text: 'First' }, timestamp: '2024-01-01T00:00:00Z' },
        { id: 'msg-2', type: 'assistant', content: 'Second', timestamp: '2024-01-01T00:00:01Z' },
      ];

      const { container } = render(<MessageStream messages={messages} />);

      // Verify messages render with their stable IDs as data attributes
      const items = container.querySelectorAll('[data-testid="message-item"]');
      expect(items).toHaveLength(2);

      // Check that data-message-id attributes are set correctly
      expect(items[0].getAttribute('data-message-id')).toBe('msg-1');
      expect(items[1].getAttribute('data-message-id')).toBe('msg-2');
    });

    it('should preserve DOM elements when messages are prepended (stable keys)', () => {
      // Test that inserting a message at the beginning doesn't recreate existing elements
      const messages: MessageStreamItem[] = [
        { id: 'msg-1', type: 'user', content: { text: 'First' }, timestamp: '2024-01-01T00:00:00Z' },
        { id: 'msg-2', type: 'assistant', content: 'Second', timestamp: '2024-01-01T00:00:01Z' },
      ];

      const { container, rerender } = render(<MessageStream messages={messages} />);

      // Get references to DOM elements
      const itemsBefore = container.querySelectorAll('[data-testid="message-item"]');
      const msg1Before = itemsBefore[0];
      const msg2Before = itemsBefore[1];

      // Insert a message at the beginning
      const messagesWithInsert: MessageStreamItem[] = [
        { id: 'msg-0', type: 'user', content: { text: 'Inserted' }, timestamp: '2024-01-01T00:00:00.500Z' },
        ...messages,
      ];

      rerender(<MessageStream messages={messagesWithInsert} />);

      // Verify all 3 messages render
      const itemsAfter = container.querySelectorAll('[data-testid="message-item"]');
      expect(itemsAfter).toHaveLength(3);

      // With stable keys, msg-1 and msg-2 should be the same DOM elements (not recreated)
      // They should now be at index 1 and 2
      expect(itemsAfter[1].getAttribute('data-message-id')).toBe('msg-1');
      expect(itemsAfter[2].getAttribute('data-message-id')).toBe('msg-2');

      // DOM element identity should be preserved (same object reference)
      expect(itemsAfter[1]).toBe(msg1Before);
      expect(itemsAfter[2]).toBe(msg2Before);
    });
  });
});

describe('MessageStream performance utils', () => {
  it('generateMessages creates correct number of messages', () => {
    const messages = generateMessages(50);
    expect(messages).toHaveLength(50);
  });

  it('generateMessages creates diverse message types', () => {
    const messages = generateMessages(20);

    const types = new Set(messages.map((m) => m.type));
    expect(types.size).toBeGreaterThanOrEqual(3); // At least 3 different types
  });

  it('createRenderCounter tracks renders correctly', () => {
    const counter = createRenderCounter();

    counter.increment('ComponentA');
    counter.increment('ComponentA');
    counter.increment('ComponentB');

    expect(counter.get('ComponentA')).toBe(2);
    expect(counter.get('ComponentB')).toBe(1);
    expect(counter.total()).toBe(3);
  });
});
