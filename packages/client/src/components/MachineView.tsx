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
 * MachineView displays the session's process tree and listening ports.
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
    <div className="flex flex-col h-full bg-bg-primary p-4 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary">Session Ports</h2>
        <div className="flex items-center gap-2">
          {isMonitoring && (
            <span className="flex items-center gap-1.5 text-sm text-text-secondary">
              <span className="w-2 h-2 rounded-full bg-accent-success animate-pulse"></span>
              Monitoring
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-accent-danger/10 text-accent-danger text-sm">
          {error}
        </div>
      )}

      {!isMonitoring ? (
        <div className="flex-1 flex items-center justify-center text-text-secondary">
          <p>Waiting for monitoring data...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-bg-secondary rounded-lg p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-2">Summary</h3>
            <div className="text-2xl font-bold text-text-primary">
              {ports.length} <span className="text-sm font-normal text-text-secondary">listening ports</span>
            </div>
          </div>

          {/* Port Table */}
          {portsWithProcess.length > 0 && (
            <div className="bg-bg-secondary rounded-lg p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">
                Listening Ports
              </h3>
              <div className="overflow-x-auto">
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
              </div>
            </div>
          )}

          {/* Process Tree */}
          {processTree && (
            <div className="bg-bg-secondary rounded-lg p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">
                Process Tree
              </h3>
              <ProcessTreeNode process={processTree} depth={0} />
            </div>
          )}

          {/* Empty state */}
          {ports.length === 0 && (
            <div className="bg-bg-secondary rounded-lg p-8 text-center text-text-secondary">
              <p>No listening ports in session</p>
              <p className="text-sm mt-1">
                Ports will appear here when dev servers start
              </p>
            </div>
          )}
        </div>
      )}
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
