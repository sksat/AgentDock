import { describe, it, expect } from 'vitest';

describe('container-browser-bridge types', () => {
  it('should export command types', () => {
    // Type-only test - ensure types compile correctly
    type BridgeCommandType = import('./types.js').BridgeCommand['type'];
    const commandTypes: BridgeCommandType[] = [
      'launch_browser',
      'close_browser',
      'browser_navigate',
      'browser_click',
      'start_screencast',
      'stop_screencast',
    ];
    expect(commandTypes).toHaveLength(6);
  });
});
