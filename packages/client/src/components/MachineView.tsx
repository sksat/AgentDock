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
  // Group ports into common categories
  const devServerPorts = ports.filter(p => p >= 3000 && p < 10000);
  const otherPorts = ports.filter(p => p < 3000 || p >= 10000);

  return (
    <div className="flex flex-col h-full bg-bg-primary p-4 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary">Session Process Tree</h2>
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

          {/* Process Tree */}
          {processTree && (
            <div className="bg-bg-secondary rounded-lg p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">
                Process Tree
              </h3>
              <ProcessTreeNode process={processTree} depth={0} />
            </div>
          )}

          {/* Dev Server Ports (common ports like 3000-9999) */}
          {devServerPorts.length > 0 && (
            <div className="bg-bg-secondary rounded-lg p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">
                Dev Server Ports ({devServerPorts.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {devServerPorts.map((port) => (
                  <PortBadge key={port} port={port} />
                ))}
              </div>
            </div>
          )}

          {/* Other Ports */}
          {otherPorts.length > 0 && (
            <div className="bg-bg-secondary rounded-lg p-4">
              <h3 className="text-sm font-medium text-text-secondary mb-3">
                Other Ports ({otherPorts.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {otherPorts.map((port) => (
                  <PortBadge key={port} port={port} />
                ))}
              </div>
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

          {/* Common ports legend */}
          <div className="bg-bg-secondary rounded-lg p-4">
            <h3 className="text-sm font-medium text-text-secondary mb-2">Common Ports</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-text-secondary">
              <div>3000: React/Next.js</div>
              <div>3001: AgentDock Server</div>
              <div>5173: Vite</div>
              <div>5174: Vite (alt)</div>
              <div>8080: HTTP alt</div>
              <div>8000: Python/Django</div>
            </div>
          </div>
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
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-mono text-white ${colorClass}`}
    >
      {port}
    </span>
  );
}
