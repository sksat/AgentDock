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

    it('should show summary with port count', () => {
      render(<MachineView {...monitoringProps} ports={[3000, 5173, 8080]} />);

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('listening ports')).toBeInTheDocument();
    });

    it('should show empty state when no ports', () => {
      render(<MachineView {...monitoringProps} ports={[]} />);

      expect(screen.getByText('No listening ports in session')).toBeInTheDocument();
    });

    it('should display dev server ports', () => {
      render(<MachineView {...monitoringProps} ports={[3000, 5173, 5174]} />);

      expect(screen.getByText('3000')).toBeInTheDocument();
      expect(screen.getByText('5173')).toBeInTheDocument();
      expect(screen.getByText('5174')).toBeInTheDocument();
    });

    it('should separate dev server ports from other ports', () => {
      render(<MachineView {...monitoringProps} ports={[22, 80, 5173]} />);

      // Dev server section should exist with 5173
      expect(screen.getByText(/Dev Server Ports/)).toBeInTheDocument();
      expect(screen.getByText('5173')).toBeInTheDocument();

      // Other ports section should exist with 22 and 80
      expect(screen.getByText(/Other Ports/)).toBeInTheDocument();
      expect(screen.getByText('22')).toBeInTheDocument();
      expect(screen.getByText('80')).toBeInTheDocument();
    });

    it('should show error message when error is set', () => {
      render(<MachineView {...monitoringProps} error="Failed to get ports" />);

      expect(screen.getByText('Failed to get ports')).toBeInTheDocument();
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
      // Both child nodes should be visible
      const nodeTexts = screen.getAllByText('node');
      expect(nodeTexts.length).toBe(2);

      // Click on root node to collapse
      fireEvent.click(screen.getByText('claude-code'));

      // Now only root should be visible
      expect(screen.queryAllByText('node').length).toBe(0);
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
