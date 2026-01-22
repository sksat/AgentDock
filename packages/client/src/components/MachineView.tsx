import { useState } from 'react';

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

export interface MachineViewProps {
  /** List of all listening ports in the session's process tree */
  ports: number[];
  /** Whether the monitor is currently active */
  isMonitoring: boolean;
  /** Process tree with port information */
  processTree: ProcessInfo | null;
  /** Error message if monitoring failed */
  error?: string;
}

/** Port with its owning process info for table display */
interface PortWithProcess {
  port: number;
  protocol: 'tcp' | 'udp';
  address: string;
  state: string;
  pid: number;
  commandShort: string;
  command: string;
}

/**
 * Collect all ports with their process info from the tree
 */
function collectPortsWithProcess(node: ProcessInfo): PortWithProcess[] {
  const result: PortWithProcess[] = [];

  // Add ports from this node
  for (const port of node.ports) {
    result.push({
      ...port,
      pid: node.pid,
      commandShort: node.commandShort,
      command: node.command,
    });
  }

  // Recursively collect from children
  for (const child of node.children) {
    result.push(...collectPortsWithProcess(child));
  }

  return result;
}

/**
 * MachineView displays the session's process tree and listening ports side by side.
 * Process Tree on the left, Ports table on the right.
 * Used for debugging port conflicts when multiple dev servers are running.
 * Monitoring starts automatically when this view is shown.
 */
export function MachineView({
  ports,
  isMonitoring,
  processTree,
  error,
}: MachineViewProps) {
  // Collect all ports with process info for the table
  const portsWithProcess = processTree ? collectPortsWithProcess(processTree) : [];
  // Sort by port number
  portsWithProcess.sort((a, b) => a.port - b.port);

  return (
    <div className="flex flex-col h-full bg-bg-primary overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2">
        <h2 className="text-lg font-semibold text-text-primary">Session Monitor</h2>
        <div className="flex items-center gap-2">
          {isMonitoring && (
            <span className="flex items-center gap-1.5 text-sm text-text-secondary">
              <span className="w-2 h-2 rounded-full bg-accent-success animate-pulse"></span>
              Monitoring
            </span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 p-3 rounded-lg bg-accent-danger/10 text-accent-danger text-sm">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4 pt-2">
        {!isMonitoring ? (
          <div className="flex items-center justify-center text-text-secondary h-full">
            <p>Waiting for monitoring data...</p>
          </div>
        ) : (
          <div className="flex gap-4 h-full">
            {/* Left: Process Tree */}
            <div className="flex-1 flex flex-col min-w-0">
              <h3 className="text-sm font-medium text-text-secondary mb-2">Process Tree</h3>
              <div className="flex-1 bg-bg-secondary rounded-lg p-4 overflow-auto">
                {processTree ? (
                  <ProcessTreeNode process={processTree} depth={0} />
                ) : (
                  <div className="flex items-center justify-center h-full text-text-secondary text-sm">
                    <p>No process tree available</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Ports */}
            <div className="flex-1 flex flex-col min-w-0">
              <h3 className="text-sm font-medium text-text-secondary mb-2">
                Ports ({ports.length})
              </h3>
              <div className="flex-1 bg-bg-secondary rounded-lg p-4 overflow-auto">
                {portsWithProcess.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-secondary border-b border-border">
                        <th className="pb-2 pr-4 font-medium">Port</th>
                        <th className="pb-2 pr-4 font-medium">Proto</th>
                        <th className="pb-2 pr-4 font-medium">Address</th>
                        <th className="pb-2 pr-4 font-medium">PID</th>
                        <th className="pb-2 font-medium">Process</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {portsWithProcess.map((p) => (
                        <tr
                          key={`${p.port}-${p.protocol}-${p.pid}`}
                          className="border-b border-border/50 hover:bg-bg-tertiary/30"
                        >
                          <td className="py-2 pr-4">
                            <PortBadge port={p.port} />
                          </td>
                          <td className="py-2 pr-4 text-text-secondary uppercase">
                            {p.protocol}
                          </td>
                          <td className="py-2 pr-4 text-text-secondary">
                            {p.address}
                          </td>
                          <td className="py-2 pr-4 text-text-secondary">
                            {p.pid}
                          </td>
                          <td className="py-2 text-text-primary" title={p.command}>
                            {p.commandShort}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex items-center justify-center h-full text-text-secondary text-sm">
                    <p>No listening ports</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ProcessTreeNode displays a process and its children recursively
 */
function ProcessTreeNode({ process, depth }: { process: ProcessInfo; depth: number }) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = process.children.length > 0;
  const hasPorts = process.ports.length > 0;

  return (
    <div className="font-mono text-sm">
      <div
        className="flex items-center gap-2 py-1 hover:bg-bg-tertiary/50 rounded cursor-pointer"
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/collapse indicator */}
        {hasChildren ? (
          <span className={`text-text-secondary transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        ) : (
          <span className="w-3"></span>
        )}

        {/* Process info */}
        <span className="text-text-secondary">{process.pid}</span>
        <span className="text-text-primary truncate" title={process.command}>
          {process.commandShort}
        </span>

        {/* Port badges */}
        {hasPorts && (
          <div className="flex gap-1 ml-2">
            {process.ports.map((p) => (
              <span
                key={`${p.port}-${p.protocol}`}
                className="px-1.5 py-0.5 text-xs rounded bg-accent-primary/20 text-accent-primary"
                title={`${p.protocol.toUpperCase()} ${p.address}:${p.port}`}
              >
                :{p.port}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {process.children.map((child) => (
            <ProcessTreeNode key={child.pid} process={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * PortBadge displays a single port with color coding based on port number
 */
function PortBadge({ port }: { port: number }) {
  // Color code based on port number
  let colorClass = 'bg-gray-600';
  if (port === 5173 || port === 5174 || port === 5175) {
    colorClass = 'bg-purple-600'; // Vite
  } else if (port === 3000 || port === 3001) {
    colorClass = 'bg-blue-600'; // React/Next.js or AgentDock
  } else if (port >= 8000 && port < 9000) {
    colorClass = 'bg-green-600'; // Common backend ports
  } else if (port >= 4000 && port < 5000) {
    colorClass = 'bg-yellow-600'; // Other dev servers
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono text-white ${colorClass}`}
    >
      {port}
    </span>
  );
}
