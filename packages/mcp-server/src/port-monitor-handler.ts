import { exec } from 'child_process';
import { readFile, readdir } from 'fs/promises';
import { basename } from 'path';

export interface PortInfo {
  port: number;
  protocol: 'tcp' | 'udp';
  address: string;
  state: string;
}

export interface ProcessInfo {
  pid: number;
  command: string;
  commandShort: string;
  ports: PortInfo[];
  parentPid: number | null;
  children: ProcessInfo[];
}

export interface PortMonitorResult {
  processTree: ProcessInfo;
  summary: {
    totalProcesses: number;
    totalListeningPorts: number;
    portList: number[];
  };
  mcpServerPid: number;
  claudeCodePid: number;
}

export interface GetSessionPortsOptions {
  rootPid?: number;
  includeAllProcesses?: boolean;
  portRange?: {
    min: number;
    max: number;
  };
}

/**
 * Parse ss command output and return a map of PID -> PortInfo[]
 */
export function parseSSOutput(output: string): Map<number, PortInfo[]> {
  const result = new Map<number, PortInfo[]>();
  const lines = output.split('\n');

  for (const line of lines) {
    // Skip header line
    if (line.startsWith('Netid') || line.trim() === '') {
      continue;
    }

    // Parse line format:
    // tcp   LISTEN 0      128    0.0.0.0:5173      0.0.0.0:*     users:(("node",pid=12345,fd=23))
    // Also handle IPv6: [::]:3000
    const match = line.match(
      /^(tcp|udp)\s+(\w+)\s+\d+\s+\d+\s+(\S+):(\d+)\s+\S+\s+.*pid=(\d+)/
    );

    if (match) {
      const [, protocol, state, address, portStr, pidStr] = match;
      const port = parseInt(portStr, 10);
      const pid = parseInt(pidStr, 10);

      const portInfo: PortInfo = {
        port,
        protocol: protocol as 'tcp' | 'udp',
        address,
        state,
      };

      const existing = result.get(pid) || [];
      existing.push(portInfo);
      result.set(pid, existing);
    }
  }

  return result;
}

export class PortMonitorHandler {
  /**
   * Get listening ports by executing ss command
   */
  async getListeningPorts(): Promise<Map<number, PortInfo[]>> {
    return new Promise((resolve) => {
      exec('ss -tulnp', (error, stdout: string | undefined) => {
        if (error || !stdout) {
          // Return empty map on error
          resolve(new Map());
          return;
        }
        resolve(parseSSOutput(stdout));
      });
    });
  }

  /**
   * Build process tree starting from rootPid
   */
  async buildProcessTree(
    rootPid: number,
    portsByPid: Map<number, PortInfo[]>
  ): Promise<ProcessInfo> {
    // Get all processes and their parent PIDs
    const processMap = new Map<number, { ppid: number; comm: string }>();

    try {
      const entries = await readdir('/proc');

      for (const entry of entries) {
        const pid = parseInt(entry, 10);
        if (isNaN(pid)) continue;

        try {
          const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
          // Format: pid (comm) state ppid ...
          const statMatch = stat.match(/^\d+\s+\(([^)]+)\)\s+\S+\s+(\d+)/);
          if (statMatch) {
            const [, comm, ppidStr] = statMatch;
            processMap.set(pid, { ppid: parseInt(ppidStr, 10), comm });
          }
        } catch {
          // Process may have exited, skip
        }
      }
    } catch {
      // /proc not available
    }

    // Build tree recursively
    const buildNode = async (pid: number): Promise<ProcessInfo> => {
      let command = '';
      let commandShort = '';

      try {
        const cmdline = await readFile(`/proc/${pid}/cmdline`, 'utf8');
        command = cmdline.replace(/\0/g, ' ').trim();
        if (command) {
          commandShort = basename(command.split(' ')[0]);
        }
      } catch {
        // Fallback to comm from stat
      }

      // If no command found, use comm from processMap
      if (!command && processMap.has(pid)) {
        const { comm } = processMap.get(pid)!;
        command = `[${comm}]`;
        commandShort = comm;
      }

      // Find children
      const children: ProcessInfo[] = [];
      for (const [childPid, { ppid }] of processMap.entries()) {
        if (ppid === pid) {
          children.push(await buildNode(childPid));
        }
      }

      return {
        pid,
        command,
        commandShort,
        ports: portsByPid.get(pid) || [],
        parentPid: processMap.get(pid)?.ppid ?? null,
        children,
      };
    };

    return buildNode(rootPid);
  }

  /**
   * Get session ports - main entry point
   */
  async getSessionPorts(options: GetSessionPortsOptions = {}): Promise<PortMonitorResult> {
    const rootPid = options.rootPid ?? process.ppid;
    const mcpServerPid = process.pid;
    const claudeCodePid = process.ppid;

    // Get all listening ports
    let portsByPid = await this.getListeningPorts();

    // Filter by port range if specified
    if (options.portRange) {
      const { min, max } = options.portRange;
      const filteredMap = new Map<number, PortInfo[]>();

      for (const [pid, ports] of portsByPid.entries()) {
        const filteredPorts = ports.filter((p) => p.port >= min && p.port <= max);
        if (filteredPorts.length > 0) {
          filteredMap.set(pid, filteredPorts);
        }
      }

      portsByPid = filteredMap;
    }

    // Build process tree
    const processTree = await this.buildProcessTree(rootPid, portsByPid);

    // Calculate summary
    const collectPorts = (node: ProcessInfo): number[] => {
      const ports = node.ports.map((p) => p.port);
      for (const child of node.children) {
        ports.push(...collectPorts(child));
      }
      return ports;
    };

    const countProcesses = (node: ProcessInfo): number => {
      return 1 + node.children.reduce((sum, child) => sum + countProcesses(child), 0);
    };

    const allPorts = collectPorts(processTree);

    return {
      processTree,
      summary: {
        totalProcesses: countProcesses(processTree),
        totalListeningPorts: allPorts.length,
        portList: [...new Set(allPorts)].sort((a, b) => a - b),
      },
      mcpServerPid,
      claudeCodePid,
    };
  }
}
