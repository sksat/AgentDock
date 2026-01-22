export interface MachineViewProps {
  /** List of all listening ports */
  ports: number[];
  /** Whether the monitor is currently active */
  isMonitoring: boolean;
  /** Called to start monitoring */
  onStartMonitor: () => void;
  /** Called to stop monitoring */
  onStopMonitor: () => void;
}

/**
 * MachineView displays machine information including listening ports.
 * Used for debugging port conflicts when multiple dev servers are running.
 */
export function MachineView({
  ports,
  isMonitoring,
  onStartMonitor,
  onStopMonitor,
}: MachineViewProps) {
  // Group ports into common categories
  const devServerPorts = ports.filter(p => p >= 3000 && p < 10000);
  const otherPorts = ports.filter(p => p < 3000 || p >= 10000);

  return (
    <div className="flex flex-col h-full bg-bg-primary p-4 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary">Machine Info</h2>
        <button
          onClick={isMonitoring ? onStopMonitor : onStartMonitor}
          className={`px-3 py-1 text-sm rounded transition-colors ${
            isMonitoring
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-accent-primary hover:bg-accent-secondary text-white'
          }`}
        >
          {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
        </button>
      </div>

      {!isMonitoring ? (
        <div className="flex-1 flex items-center justify-center text-text-secondary">
          <p>Click "Start Monitoring" to view listening ports</p>
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
              <p>No listening ports detected</p>
              <p className="text-sm mt-1">
                Ports will appear here when processes start listening
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
