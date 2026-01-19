import { describe, it, expect } from 'vitest';
import type {
  BridgeCommand,
  BridgeMessage,
  BridgeRequest,
  LaunchBrowserCommand,
  BrowserNavigateCommand,
  BrowserClickCommand,
  ScreencastOptions,
} from '../types.js';

describe('container-browser-bridge types', () => {
  describe('BridgeCommand types', () => {
    it('should define launch_browser command', () => {
      const cmd: LaunchBrowserCommand = {
        type: 'launch_browser',
        options: { headless: true, viewport: { width: 1280, height: 720 } },
      };
      expect(cmd.type).toBe('launch_browser');
      expect(cmd.options?.headless).toBe(true);
    });

    it('should define browser_navigate command', () => {
      const cmd: BrowserNavigateCommand = {
        type: 'browser_navigate',
        url: 'https://example.com',
      };
      expect(cmd.type).toBe('browser_navigate');
      expect(cmd.url).toBe('https://example.com');
    });

    it('should define browser_click command', () => {
      const cmd: BrowserClickCommand = {
        type: 'browser_click',
        x: 100,
        y: 200,
        button: 'left',
      };
      expect(cmd.type).toBe('browser_click');
      expect(cmd.x).toBe(100);
      expect(cmd.y).toBe(200);
    });

    it('should allow all command types in union', () => {
      const commandTypes: BridgeCommand['type'][] = [
        'launch_browser',
        'close_browser',
        'browser_navigate',
        'browser_navigate_back',
        'browser_click',
        'browser_hover',
        'browser_type',
        'browser_press_key',
        'browser_scroll',
        'browser_select_option',
        'browser_drag',
        'browser_fill_form',
        'browser_snapshot',
        'browser_screenshot',
        'browser_console_messages',
        'browser_network_requests',
        'browser_evaluate',
        'browser_wait_for',
        'browser_handle_dialog',
        'browser_resize',
        'browser_tabs',
        'start_screencast',
        'stop_screencast',
      ];
      expect(commandTypes).toHaveLength(23);
    });
  });

  describe('BridgeMessage types', () => {
    it('should define message types', () => {
      const messageTypes: BridgeMessage['type'][] = [
        'browser_launched',
        'browser_closed',
        'command_result',
        'screencast_frame',
        'screencast_status',
        'error',
      ];
      expect(messageTypes).toHaveLength(6);
    });
  });

  describe('BridgeRequest', () => {
    it('should wrap command with requestId', () => {
      const request: BridgeRequest = {
        requestId: 'req-123',
        command: { type: 'browser_navigate', url: 'https://example.com' },
      };
      expect(request.requestId).toBe('req-123');
      expect(request.command.type).toBe('browser_navigate');
    });
  });

  describe('ScreencastOptions', () => {
    it('should define screencast options', () => {
      const options: ScreencastOptions = {
        format: 'jpeg',
        quality: 70,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 2,
      };
      expect(options.format).toBe('jpeg');
      expect(options.quality).toBe(70);
    });
  });
});
