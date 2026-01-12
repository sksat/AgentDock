import { useRef, useEffect, useMemo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { DailyUsage } from '@agent-dock/shared';
import { formatCost } from './UsageDisplay';

export interface UsageChartProps {
  daily: DailyUsage[];
  height?: number;
}

export function UsageChart({ daily, height = 120 }: UsageChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  // Prepare data for uplot: [timestamps[], costs[]]
  const data = useMemo(() => {
    if (daily.length === 0) {
      return [[], []] as [number[], number[]];
    }

    // Convert dates to timestamps (seconds since epoch)
    const timestamps = daily.map((d) => new Date(d.date).getTime() / 1000);
    const costs = daily.map((d) => d.totalCost);

    return [timestamps, costs] as [number[], number[]];
  }, [daily]);

  // Chart options
  const opts = useMemo(
    (): uPlot.Options => ({
      width: 600, // Will be updated on resize
      height,
      padding: [10, 10, 0, 0],
      cursor: {
        show: true,
        points: {
          show: true,
        },
      },
      legend: {
        show: false,
      },
      axes: [
        {
          // X axis (time)
          stroke: 'rgba(255, 255, 255, 0.3)',
          grid: { show: false },
          ticks: { show: false },
          values: (_, ticks) =>
            ticks.map((t) => {
              const d = new Date(t * 1000);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }),
          font: '10px system-ui',
          labelFont: '10px system-ui',
        },
        {
          // Y axis (cost)
          stroke: 'rgba(255, 255, 255, 0.3)',
          grid: {
            stroke: 'rgba(255, 255, 255, 0.1)',
            width: 1,
          },
          ticks: { show: false },
          values: (_, ticks) => ticks.map((v) => formatCost(v)),
          font: '10px system-ui',
          labelFont: '10px system-ui',
          size: 50,
        },
      ],
      series: [
        {}, // X axis series (timestamps)
        {
          // Cost series
          label: 'Cost',
          stroke: 'rgb(99, 102, 241)', // accent-primary
          fill: 'rgba(99, 102, 241, 0.2)',
          width: 2,
          paths: uPlot.paths.bars!({ size: [0.6, 100] }),
          points: { show: false },
        },
      ],
      scales: {
        x: {
          time: true,
        },
        y: {
          auto: true,
          range: (_, min, max) => {
            // Add some padding at the top
            return [0, max * 1.1];
          },
        },
      },
    }),
    [height]
  );

  // Create/update chart
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    // Don't create chart if no data
    if (data[0].length === 0) return;

    const container = containerRef.current;

    // Create new chart with container width
    const initialWidth = container.clientWidth || 600;
    const chart = new uPlot(
      { ...opts, width: initialWidth },
      data,
      container
    );
    chartRef.current = chart;

    // Track current width to avoid unnecessary updates
    let currentWidth = initialWidth;

    // Resize handler - updates chart size immediately
    const handleResize = () => {
      if (!chartRef.current || !container) return;
      const newWidth = container.clientWidth;
      if (newWidth >= 100 && newWidth !== currentWidth) {
        currentWidth = newWidth;
        chartRef.current.setSize({ width: newWidth, height });
      }
    };

    // ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // Listen for device pixel ratio changes (browser zoom)
    const dprMediaQuery = window.matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`
    );
    const handleDprChange = () => {
      if (chartRef.current && container) {
        const width = container.clientWidth || 600;
        chartRef.current.destroy();
        chartRef.current = new uPlot({ ...opts, width }, data, container);
        currentWidth = width;
      }
    };
    dprMediaQuery.addEventListener('change', handleDprChange);

    return () => {
      resizeObserver.disconnect();
      dprMediaQuery.removeEventListener('change', handleDprChange);
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [data, opts, height]);

  if (daily.length === 0) {
    return (
      <div className="text-text-secondary text-xs text-center py-4">
        No usage data available
      </div>
    );
  }

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
