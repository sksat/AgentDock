import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MachineView } from '../MachineView';

describe('MachineView', () => {
  const defaultProps = {
    ports: [],
    isMonitoring: false,
    onStartMonitor: vi.fn(),
    onStopMonitor: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when not monitoring', () => {
    it('should show start monitoring button', () => {
      render(<MachineView {...defaultProps} />);

      expect(screen.getByText('Start Monitoring')).toBeInTheDocument();
    });

    it('should show prompt to start monitoring', () => {
      render(<MachineView {...defaultProps} />);

      expect(screen.getByText(/Click "Start Monitoring"/)).toBeInTheDocument();
    });

    it('should call onStartMonitor when button is clicked', () => {
      const onStartMonitor = vi.fn();
      render(<MachineView {...defaultProps} onStartMonitor={onStartMonitor} />);

      fireEvent.click(screen.getByText('Start Monitoring'));

      expect(onStartMonitor).toHaveBeenCalledTimes(1);
    });
  });

  describe('when monitoring', () => {
    const monitoringProps = {
      ...defaultProps,
      isMonitoring: true,
    };

    it('should show stop monitoring button', () => {
      render(<MachineView {...monitoringProps} />);

      expect(screen.getByText('Stop Monitoring')).toBeInTheDocument();
    });

    it('should call onStopMonitor when button is clicked', () => {
      const onStopMonitor = vi.fn();
      render(<MachineView {...monitoringProps} onStopMonitor={onStopMonitor} />);

      fireEvent.click(screen.getByText('Stop Monitoring'));

      expect(onStopMonitor).toHaveBeenCalledTimes(1);
    });

    it('should show summary with port count', () => {
      render(<MachineView {...monitoringProps} ports={[3000, 5173, 8080]} />);

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('listening ports')).toBeInTheDocument();
    });

    it('should show empty state when no ports', () => {
      render(<MachineView {...monitoringProps} ports={[]} />);

      expect(screen.getByText('No listening ports detected')).toBeInTheDocument();
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
  });
});
