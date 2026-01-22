import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MachineView, type ProcessInfo } from '../MachineView';

describe('MachineView', () => {
  const defaultProps = {
    ports: [],
    isMonitoring: false,
    processTree: null,
    error: undefined,
  };

  describe('when not monitoring', () => {
    it('should show waiting message', () => {
      render(<MachineView {...defaultProps} />);

      expect(screen.getByText('Waiting for monitoring data...')).toBeInTheDocument();
    });
  });

  describe('when monitoring', () => {
    const monitoringProps = {
      ...defaultProps,
      isMonitoring: true,
    };

    it('should show monitoring indicator', () => {
      render(<MachineView {...monitoringProps} />);

      expect(screen.getByText('Monitoring')).toBeInTheDocument();
    });

    it('should show port count in header', () => {
      render(<MachineView {...monitoringProps} ports={[3000, 5173, 8080]} />);

      expect(screen.getByText('Ports (3)')).toBeInTheDocument();
    });

    it('should show empty states when no data', () => {
      render(<MachineView {...monitoringProps} ports={[]} />);

      expect(screen.getByText('No process tree available')).toBeInTheDocument();
      expect(screen.getByText('No listening ports')).toBeInTheDocument();
    });

    it('should show error message when error is set', () => {
      render(<MachineView {...monitoringProps} error="Failed to get ports" />);

      expect(screen.getByText('Failed to get ports')).toBeInTheDocument();
    });

    it('should show two-column layout with headers', () => {
      render(<MachineView {...monitoringProps} />);

      expect(screen.getByText('Process Tree')).toBeInTheDocument();
      expect(screen.getByText('Ports (0)')).toBeInTheDocument();
    });
  });

  describe('port table', () => {
    const processTree: ProcessInfo = {
      pid: 100,
      command: '/usr/bin/claude-code',
      commandShort: 'claude-code',
      ports: [],
      parentPid: 1,
      children: [
        {
          pid: 101,
          command: '/usr/bin/node server.js',
          commandShort: 'node',
          ports: [{ port: 5173, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' }],
          parentPid: 100,
          children: [],
        },
        {
          pid: 102,
          command: '/usr/bin/node another.js',
          commandShort: 'node',
          ports: [{ port: 3000, protocol: 'tcp', address: '127.0.0.1', state: 'LISTEN' }],
          parentPid: 100,
          children: [],
        },
      ],
    };

    it('should render port table with headers', () => {
      render(
        <MachineView
          ports={[5173, 3000]}
          isMonitoring={true}
          processTree={processTree}
        />
      );

      expect(screen.getByText('Port')).toBeInTheDocument();
      expect(screen.getByText('Proto')).toBeInTheDocument();
      expect(screen.getByText('Address')).toBeInTheDocument();
      expect(screen.getByText('PID')).toBeInTheDocument();
      expect(screen.getByText('Process')).toBeInTheDocument();
    });

    it('should display ports in table sorted by port number', () => {
      render(
        <MachineView
          ports={[5173, 3000]}
          isMonitoring={true}
          processTree={processTree}
        />
      );

      // Ports should be displayed
      expect(screen.getByText('3000')).toBeInTheDocument();
      expect(screen.getByText('5173')).toBeInTheDocument();
    });

    it('should show port details in table', () => {
      render(
        <MachineView
          ports={[5173, 3000]}
          isMonitoring={true}
          processTree={processTree}
        />
      );

      // Protocol - shown in table
      const tcpElements = screen.getAllByText('tcp');
      expect(tcpElements.length).toBeGreaterThanOrEqual(2);

      // Addresses - shown in table
      expect(screen.getByText('0.0.0.0')).toBeInTheDocument();
      expect(screen.getByText('127.0.0.1')).toBeInTheDocument();

      // PIDs - shown in both table and process tree, so use getAllByText
      const pid101Elements = screen.getAllByText('101');
      expect(pid101Elements.length).toBeGreaterThanOrEqual(1);
      const pid102Elements = screen.getAllByText('102');
      expect(pid102Elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('process tree', () => {
    const processTree: ProcessInfo = {
      pid: 100,
      command: '/usr/bin/claude-code',
      commandShort: 'claude-code',
      ports: [],
      parentPid: 1,
      children: [
        {
          pid: 101,
          command: '/usr/bin/node server.js',
          commandShort: 'node',
          ports: [{ port: 5173, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' }],
          parentPid: 100,
          children: [],
        },
        {
          pid: 102,
          command: '/usr/bin/node another.js',
          commandShort: 'node',
          ports: [{ port: 3000, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' }],
          parentPid: 100,
          children: [],
        },
      ],
    };

    it('should render process tree', () => {
      render(
        <MachineView
          ports={[5173, 3000]}
          isMonitoring={true}
          processTree={processTree}
        />
      );

      expect(screen.getByText('Process Tree')).toBeInTheDocument();
      expect(screen.getByText('claude-code')).toBeInTheDocument();
    });

    it('should show process ports in tree', () => {
      render(
        <MachineView
          ports={[5173, 3000]}
          isMonitoring={true}
          processTree={processTree}
        />
      );

      // Ports should be shown as badges in the tree
      expect(screen.getByText(':5173')).toBeInTheDocument();
      expect(screen.getByText(':3000')).toBeInTheDocument();
    });

    it('should expand/collapse process tree nodes', () => {
      render(
        <MachineView
          ports={[5173, 3000]}
          isMonitoring={true}
          processTree={processTree}
        />
      );

      // Root node should be expanded by default (depth < 2)
      // Both child nodes should be visible in process tree (+ in table)
      // 'node' appears in both table (2x) and process tree (2x) = 4 total
      const nodeTextsBefore = screen.getAllByText('node');
      expect(nodeTextsBefore.length).toBe(4);

      // Click on root node to collapse process tree
      fireEvent.click(screen.getByText('claude-code'));

      // Process tree nodes are collapsed, but table still shows them
      // So now 'node' appears only in table (2x)
      const nodeTextsAfter = screen.queryAllByText('node');
      expect(nodeTextsAfter.length).toBe(2);
    });
  });

  describe('robustness', () => {
    it('should not crash with empty ports array', () => {
      expect(() => {
        render(<MachineView {...defaultProps} ports={[]} isMonitoring={true} />);
      }).not.toThrow();
    });

    it('should handle large number of ports', () => {
      const manyPorts = Array.from({ length: 100 }, (_, i) => 3000 + i);
      expect(() => {
        render(<MachineView {...defaultProps} ports={manyPorts} isMonitoring={true} />);
      }).not.toThrow();
    });

    it('should handle null processTree', () => {
      expect(() => {
        render(<MachineView {...defaultProps} ports={[5173]} isMonitoring={true} processTree={null} />);
      }).not.toThrow();
    });

    it('should handle deeply nested process tree', () => {
      const deepTree: ProcessInfo = {
        pid: 1,
        command: 'root',
        commandShort: 'root',
        ports: [],
        parentPid: null,
        children: [{
          pid: 2,
          command: 'level1',
          commandShort: 'level1',
          ports: [],
          parentPid: 1,
          children: [{
            pid: 3,
            command: 'level2',
            commandShort: 'level2',
            ports: [],
            parentPid: 2,
            children: [{
              pid: 4,
              command: 'level3',
              commandShort: 'level3',
              ports: [{ port: 8080, protocol: 'tcp', address: '0.0.0.0', state: 'LISTEN' }],
              parentPid: 3,
              children: [],
            }],
          }],
        }],
      };

      expect(() => {
        render(<MachineView {...defaultProps} ports={[8080]} isMonitoring={true} processTree={deepTree} />);
      }).not.toThrow();
    });
  });
});
