import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to declare mock functions that can be accessed from mock factories
const { mockExec, mockReadFile, mockReaddir } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockReadFile: vi.fn(),
  mockReaddir: vi.fn(),
}));

vi.mock('child_process', () => ({
  exec: mockExec,
}));

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
  readdir: mockReaddir,
}));

import {
  PortMonitorHandler,
  parseSSOutput,
  type PortInfo,
  type ProcessInfo,
} from '../port-monitor-handler.js';

describe('PortMonitorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseSSOutput', () => {
    it('should parse TCP listening sockets', () => {
      const output = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0      128    0.0.0.0:5173      0.0.0.0:*     users:(("node",pid=12345,fd=23))`;

      const result = parseSSOutput(output);

      expect(result.get(12345)).toEqual([
        { port: 5173, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' },
      ]);
    });

    it('should parse UDP sockets', () => {
      const output = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
udp   UNCONN 0      0      0.0.0.0:5353      0.0.0.0:*     users:(("avahi-daemon",pid=789,fd=12))`;

      const result = parseSSOutput(output);

      expect(result.get(789)).toEqual([
        { port: 5353, protocol: 'udp', address: '0.0.0.0', state: 'UNCONN' },
      ]);
    });

    it('should parse IPv6 addresses', () => {
      const output = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0      128    [::]:3000         [::]:*        users:(("node",pid=9999,fd=18))`;

      const result = parseSSOutput(output);

      expect(result.get(9999)).toEqual([
        { port: 3000, protocol: 'tcp', address: '[::]', state: 'LISTEN' },
      ]);
    });

    it('should parse 127.0.0.1 localhost addresses', () => {
      const output = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0      511    127.0.0.1:3001    0.0.0.0:*     users:(("node",pid=5555,fd=20))`;

      const result = parseSSOutput(output);

      expect(result.get(5555)).toEqual([
        { port: 3001, protocol: 'tcp', address: '127.0.0.1', state: 'LISTEN' },
      ]);
    });

    it('should handle multiple processes on different ports', () => {
      const output = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0      128    0.0.0.0:5173      0.0.0.0:*     users:(("node",pid=1111,fd=23))
tcp   LISTEN 0      128    0.0.0.0:5174      0.0.0.0:*     users:(("node",pid=2222,fd=24))
tcp   LISTEN 0      128    0.0.0.0:3001      0.0.0.0:*     users:(("node",pid=3333,fd=25))`;

      const result = parseSSOutput(output);

      expect(result.get(1111)).toEqual([
        { port: 5173, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' },
      ]);
      expect(result.get(2222)).toEqual([
        { port: 5174, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' },
      ]);
      expect(result.get(3333)).toEqual([
        { port: 3001, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' },
      ]);
    });

    it('should handle same process with multiple ports', () => {
      const output = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0      128    0.0.0.0:5173      0.0.0.0:*     users:(("node",pid=1234,fd=23))
tcp   LISTEN 0      128    0.0.0.0:24678     0.0.0.0:*     users:(("node",pid=1234,fd=24))`;

      const result = parseSSOutput(output);

      expect(result.get(1234)).toEqual([
        { port: 5173, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' },
        { port: 24678, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' },
      ]);
    });

    it('should handle empty output', () => {
      const output = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process`;

      const result = parseSSOutput(output);

      expect(result.size).toBe(0);
    });

    it('should handle malformed lines gracefully', () => {
      const output = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0      128    0.0.0.0:5173      0.0.0.0:*     users:(("node",pid=1234,fd=23))
this is a malformed line
tcp   LISTEN 0      128    0.0.0.0:3000      0.0.0.0:*     users:(("node",pid=5678,fd=25))`;

      const result = parseSSOutput(output);

      expect(result.get(1234)).toEqual([
        { port: 5173, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' },
      ]);
      expect(result.get(5678)).toEqual([
        { port: 3000, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' },
      ]);
    });

    it('should handle lines without process info', () => {
      const output = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0      128    0.0.0.0:5173      0.0.0.0:*`;

      const result = parseSSOutput(output);

      // No PID found, should not add to result
      expect(result.size).toBe(0);
    });
  });

  describe('PortMonitorHandler.getListeningPorts', () => {
    it('should execute ss command and parse output', async () => {
      const ssOutput = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0      128    0.0.0.0:5173      0.0.0.0:*     users:(("node",pid=12345,fd=23))`;

      mockExec.mockImplementation((cmd: string, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, ssOutput, '');
      });

      const handler = new PortMonitorHandler();
      const result = await handler.getListeningPorts();

      expect(mockExec).toHaveBeenCalledWith('ss -tulnp', expect.any(Function));
      expect(result.get(12345)).toEqual([
        { port: 5173, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' },
      ]);
    });

    it('should handle ss command error gracefully', async () => {
      mockExec.mockImplementation((cmd: string, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error('Command failed'), '', 'error');
      });

      const handler = new PortMonitorHandler();
      const result = await handler.getListeningPorts();

      expect(result.size).toBe(0);
    });
  });

  describe('PortMonitorHandler.buildProcessTree', () => {
    it('should build process tree from /proc', async () => {
      // Mock /proc directory listing
      mockReaddir.mockResolvedValue(['1', '100', '101', '102', 'self', 'meminfo']);

      // Mock /proc/[pid]/stat files (format: pid (comm) state ppid ...)
      mockReadFile.mockImplementation((path: string) => {
        if (path === '/proc/100/stat') {
          return Promise.resolve('100 (bash) S 1 100 100 0 -1 4194304');
        }
        if (path === '/proc/101/stat') {
          return Promise.resolve('101 (node) S 100 101 100 0 -1 4194304');
        }
        if (path === '/proc/102/stat') {
          return Promise.resolve('102 (node) S 101 102 100 0 -1 4194304');
        }
        if (path === '/proc/100/cmdline') {
          return Promise.resolve('/bin/bash\0--login\0');
        }
        if (path === '/proc/101/cmdline') {
          return Promise.resolve('/usr/bin/node\0/app/server.js\0');
        }
        if (path === '/proc/102/cmdline') {
          return Promise.resolve('/usr/bin/node\0/app/worker.js\0');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const handler = new PortMonitorHandler();
      const portsByPid = new Map<number, PortInfo[]>();
      portsByPid.set(101, [{ port: 3000, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' }]);

      const result = await handler.buildProcessTree(100, portsByPid);

      expect(result.pid).toBe(100);
      expect(result.command).toBe('/bin/bash --login');
      expect(result.commandShort).toBe('bash');
      expect(result.ports).toEqual([]);
      expect(result.children).toHaveLength(1);
      expect(result.children[0].pid).toBe(101);
      expect(result.children[0].ports).toEqual([
        { port: 3000, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' },
      ]);
      expect(result.children[0].children).toHaveLength(1);
      expect(result.children[0].children[0].pid).toBe(102);
    });

    it('should handle missing /proc entries gracefully', async () => {
      mockReaddir.mockResolvedValue(['100', '101']);

      mockReadFile.mockImplementation((path: string) => {
        if (path === '/proc/100/stat') {
          return Promise.resolve('100 (bash) S 1 100 100 0 -1 4194304');
        }
        if (path === '/proc/100/cmdline') {
          return Promise.resolve('/bin/bash\0');
        }
        // 101 is in directory but files are gone (process exited)
        return Promise.reject(new Error('ENOENT'));
      });

      const handler = new PortMonitorHandler();
      const result = await handler.buildProcessTree(100, new Map());

      expect(result.pid).toBe(100);
      expect(result.children).toEqual([]);
    });

    it('should handle empty cmdline', async () => {
      mockReaddir.mockResolvedValue(['100']);

      mockReadFile.mockImplementation((path: string) => {
        if (path === '/proc/100/stat') {
          return Promise.resolve('100 (bash) S 1 100 100 0 -1 4194304');
        }
        if (path === '/proc/100/cmdline') {
          return Promise.resolve('');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const handler = new PortMonitorHandler();
      const result = await handler.buildProcessTree(100, new Map());

      expect(result.pid).toBe(100);
      expect(result.command).toBe('[bash]'); // Fallback to comm from stat
      expect(result.commandShort).toBe('bash');
    });
  });

  describe('PortMonitorHandler.getSessionPorts', () => {
    it('should return process tree with port information', async () => {
      const ssOutput = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0      128    0.0.0.0:5173      0.0.0.0:*     users:(("node",pid=102,fd=23))`;

      mockExec.mockImplementation((cmd: string, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, ssOutput, '');
      });

      mockReaddir.mockResolvedValue(['100', '101', '102']);

      mockReadFile.mockImplementation((path: string) => {
        if (path === '/proc/100/stat') {
          return Promise.resolve('100 (claude) S 1 100 100 0 -1 4194304');
        }
        if (path === '/proc/101/stat') {
          return Promise.resolve('101 (mcp-server) S 100 101 100 0 -1 4194304');
        }
        if (path === '/proc/102/stat') {
          return Promise.resolve('102 (node) S 100 102 100 0 -1 4194304');
        }
        if (path === '/proc/100/cmdline') {
          return Promise.resolve('claude\0');
        }
        if (path === '/proc/101/cmdline') {
          return Promise.resolve('node\0mcp-server.js\0');
        }
        if (path === '/proc/102/cmdline') {
          return Promise.resolve('node\0vite\0');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const handler = new PortMonitorHandler();
      // Override process.ppid for testing
      const result = await handler.getSessionPorts({ rootPid: 100 });

      expect(result.processTree.pid).toBe(100);
      expect(result.summary.totalListeningPorts).toBe(1);
      expect(result.summary.portList).toContain(5173);
    });

    it('should filter by port range when specified', async () => {
      const ssOutput = `Netid State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp   LISTEN 0      128    0.0.0.0:5173      0.0.0.0:*     users:(("node",pid=100,fd=23))
tcp   LISTEN 0      128    0.0.0.0:3001      0.0.0.0:*     users:(("node",pid=100,fd=24))
tcp   LISTEN 0      128    0.0.0.0:8080      0.0.0.0:*     users:(("node",pid=100,fd=25))`;

      mockExec.mockImplementation((cmd: string, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, ssOutput, '');
      });

      mockReaddir.mockResolvedValue(['100']);

      mockReadFile.mockImplementation((path: string) => {
        if (path === '/proc/100/stat') {
          return Promise.resolve('100 (node) S 1 100 100 0 -1 4194304');
        }
        if (path === '/proc/100/cmdline') {
          return Promise.resolve('node\0server.js\0');
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const handler = new PortMonitorHandler();
      const result = await handler.getSessionPorts({
        rootPid: 100,
        portRange: { min: 5000, max: 6000 },
      });

      // Only port 5173 should be in the filtered range
      expect(result.summary.portList).toEqual([5173]);
      expect(result.summary.totalListeningPorts).toBe(1);
    });
  });

  describe('PortMonitorHandler robustness', () => {
    it('should not crash with null/undefined values', async () => {
      mockExec.mockImplementation((cmd: string, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, '', '');
      });

      mockReaddir.mockResolvedValue([]);

      const handler = new PortMonitorHandler();
      const result = await handler.getSessionPorts({ rootPid: 1 });

      expect(result.processTree).toBeDefined();
      expect(result.summary.totalListeningPorts).toBe(0);
      expect(result.summary.portList).toEqual([]);
    });

    it('should handle process that exits during scan', async () => {
      mockExec.mockImplementation((cmd: string, callback: (err: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, '', '');
      });

      // First call returns process, second call returns nothing (process exited)
      mockReaddir.mockResolvedValueOnce(['100', '101']);

      mockReadFile.mockImplementation((path: string) => {
        if (path === '/proc/100/stat') {
          return Promise.resolve('100 (bash) S 1 100 100 0 -1 4194304');
        }
        if (path === '/proc/100/cmdline') {
          return Promise.resolve('/bin/bash\0');
        }
        // Process 101 exits during scan
        return Promise.reject(new Error('ENOENT: no such file or directory'));
      });

      const handler = new PortMonitorHandler();
      const result = await handler.getSessionPorts({ rootPid: 100 });

      // Should complete without crashing
      expect(result.processTree.pid).toBe(100);
    });
  });
});
