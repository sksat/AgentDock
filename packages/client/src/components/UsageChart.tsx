import { useRef, useEffect, useMemo, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import clsx from 'clsx';
import type { BlockUsage, DailyUsage, ModelBreakdown } from '@agent-dock/shared';
import { formatCost } from './UsageDisplay';

export interface UsageChartProps {
  daily: DailyUsage[];
  blocks?: BlockUsage[];
  height?: number;
}

// Time range options
type TimeRange = '1y' | '6m' | '3m' | '1m' | '2w' | '1w' | '3d' | '1d' | '12h' | '6h';

type DataSource = 'daily' | 'blocks';
type SampleRate = 'daily' | 'weekly' | 'monthly';

interface TimeRangeConfig {
  value: TimeRange;
  label: string;
  hours: number;
  source: DataSource;
  sampleRate?: SampleRate; // Only for daily source
}

const TIME_RANGES: TimeRangeConfig[] = [
  { value: '1y', label: '1Y', hours: 365 * 24, source: 'daily', sampleRate: 'monthly' },
  { value: '6m', label: '6M', hours: 180 * 24, source: 'daily', sampleRate: 'weekly' },
  { value: '3m', label: '3M', hours: 90 * 24, source: 'daily', sampleRate: 'weekly' },
  { value: '1m', label: '1M', hours: 30 * 24, source: 'daily', sampleRate: 'daily' },
  { value: '2w', label: '2W', hours: 14 * 24, source: 'daily', sampleRate: 'daily' },
  { value: '1w', label: '1W', hours: 7 * 24, source: 'daily', sampleRate: 'daily' },
  { value: '3d', label: '3D', hours: 3 * 24, source: 'blocks' },
  { value: '1d', label: '1D', hours: 24, source: 'blocks' },
  { value: '12h', label: '12H', hours: 12, source: 'blocks' },
  { value: '6h', label: '6H', hours: 6, source: 'blocks' },
];

// Unit options
type Unit = 'cost' | 'input' | 'output' | 'total';

const UNITS: { value: Unit; label: string }[] = [
  { value: 'input', label: 'Input' },
  { value: 'output', label: 'Output' },
  { value: 'total', label: 'Total' },
  { value: 'cost', label: 'Cost' },
];

// Get value from daily data based on unit
function getDailyValue(day: DailyUsage, unit: Unit): number {
  switch (unit) {
    case 'cost':
      return day.totalCost;
    case 'input':
      return day.inputTokens;
    case 'output':
      return day.outputTokens;
    case 'total':
      return day.totalTokens;
  }
}

// Get value from block data based on unit
function getBlockValue(block: BlockUsage, unit: Unit): number {
  switch (unit) {
    case 'cost':
      return block.totalCost;
    case 'input':
      return block.inputTokens;
    case 'output':
      return block.outputTokens;
    case 'total':
      return block.totalTokens;
  }
}

// Get value from model breakdown based on unit
function getModelValue(breakdown: ModelBreakdown, unit: Unit): number {
  switch (unit) {
    case 'cost':
      return breakdown.cost;
    case 'input':
      return breakdown.inputTokens;
    case 'output':
      return breakdown.outputTokens;
    case 'total':
      return breakdown.inputTokens + breakdown.outputTokens;
  }
}

// Format value based on unit
function formatValue(value: number, unit: Unit): string {
  if (unit === 'cost') {
    return formatCost(value);
  }
  // Format tokens with K/M suffix
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return value.toFixed(0);
}

// Get period key for aggregation (week start or month)
function getPeriodKey(dateStr: string, sampleRate: SampleRate): string {
  if (sampleRate === 'daily') return dateStr;

  const date = new Date(dateStr);
  if (sampleRate === 'weekly') {
    // Get Monday of the week
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    return monday.toISOString().split('T')[0];
  }
  // Monthly: use first day of month
  return `${dateStr.slice(0, 7)}-01`;
}

// Aggregate daily data by period
function aggregateByPeriod(daily: DailyUsage[], sampleRate: SampleRate): DailyUsage[] {
  if (sampleRate === 'daily') return daily;

  const periods = new Map<string, DailyUsage>();

  for (const day of daily) {
    const key = getPeriodKey(day.date, sampleRate);
    const existing = periods.get(key);

    if (!existing) {
      // Clone the day as starting point
      periods.set(key, {
        date: key,
        inputTokens: day.inputTokens,
        outputTokens: day.outputTokens,
        cacheCreationTokens: day.cacheCreationTokens,
        cacheReadTokens: day.cacheReadTokens,
        totalTokens: day.totalTokens,
        totalCost: day.totalCost,
        modelsUsed: [...day.modelsUsed],
        modelBreakdowns: day.modelBreakdowns.map((b) => ({ ...b })),
      });
    } else {
      // Aggregate values
      existing.inputTokens += day.inputTokens;
      existing.outputTokens += day.outputTokens;
      existing.cacheCreationTokens += day.cacheCreationTokens;
      existing.cacheReadTokens += day.cacheReadTokens;
      existing.totalTokens += day.totalTokens;
      existing.totalCost += day.totalCost;

      // Merge models
      for (const model of day.modelsUsed) {
        if (!existing.modelsUsed.includes(model)) {
          existing.modelsUsed.push(model);
        }
      }

      // Merge model breakdowns
      for (const breakdown of day.modelBreakdowns) {
        const existingBreakdown = existing.modelBreakdowns.find(
          (b) => b.modelName === breakdown.modelName
        );
        if (existingBreakdown) {
          existingBreakdown.inputTokens += breakdown.inputTokens;
          existingBreakdown.outputTokens += breakdown.outputTokens;
          existingBreakdown.cacheCreationTokens += breakdown.cacheCreationTokens;
          existingBreakdown.cacheReadTokens += breakdown.cacheReadTokens;
          existingBreakdown.cost += breakdown.cost;
        } else {
          existing.modelBreakdowns.push({ ...breakdown });
        }
      }
    }
  }

  // Sort by date and return
  return Array.from(periods.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Short model name for display (includes version to distinguish)
function shortModelName(model: string): string {
  const lower = model.toLowerCase();
  // Extract version number if present (e.g., "4-5" from "claude-sonnet-4-5-20250929")
  const versionMatch = model.match(/(\d+-\d+|\d+\.\d+)/);
  const version = versionMatch ? ` ${versionMatch[1].replace('-', '.')}` : '';

  if (lower.includes('opus')) return `Opus${version}`;
  if (lower.includes('sonnet')) return `Sonnet${version}`;
  if (lower.includes('haiku')) return `Haiku${version}`;
  return model.split('-')[0] || model;
}

// Color palette for different models
const MODEL_COLORS: Record<string, string> = {
  opus: 'rgb(239, 68, 68)',    // red
  sonnet: 'rgb(99, 102, 241)', // indigo (accent)
  haiku: 'rgb(34, 197, 94)',   // green
};

function getModelColor(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return MODEL_COLORS.opus;
  if (lower.includes('sonnet')) return MODEL_COLORS.sonnet;
  if (lower.includes('haiku')) return MODEL_COLORS.haiku;
  return 'rgb(156, 163, 175)'; // gray default
}

// Unified data point type for chart
interface ChartDataPoint {
  timestamp: number; // seconds since epoch
  totalValue: number;
  models: string[];
}

export function UsageChart({ daily, blocks = [], height = 120 }: UsageChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('1m');
  const [unit, setUnit] = useState<Unit>('cost');

  // Get the current range config
  const rangeConfig = useMemo(
    () => TIME_RANGES.find((r) => r.value === timeRange),
    [timeRange]
  );

  // Determine actual data source (fall back to daily if blocks is empty)
  const actualSource = useMemo(() => {
    if (rangeConfig?.source === 'blocks' && blocks.length === 0) {
      return 'daily'; // Fallback when no blocks data
    }
    return rangeConfig?.source ?? 'daily';
  }, [rangeConfig, blocks.length]);

  // Filter and prepare chart data based on selected time range
  const chartData = useMemo((): ChartDataPoint[] => {
    const range = rangeConfig;
    if (!range) return [];

    const cutoffTime = Date.now() - range.hours * 60 * 60 * 1000;

    if (actualSource === 'blocks') {
      // Use blocks data for short time ranges
      return blocks
        .filter((b) => new Date(b.startTime).getTime() >= cutoffTime)
        .map((b) => ({
          timestamp: new Date(b.startTime).getTime() / 1000,
          totalValue: getBlockValue(b, unit),
          models: b.modelsUsed,
        }));
    } else {
      // Use daily data (or fallback from blocks)
      const cutoffStr = new Date(cutoffTime).toISOString().split('T')[0];
      const filtered = daily.filter((d) => d.date >= cutoffStr);
      // Use daily sample rate when falling back, otherwise use configured rate
      const sampleRate = range.source === 'daily' ? range.sampleRate! : 'daily';
      const aggregated = aggregateByPeriod(filtered, sampleRate);
      return aggregated.map((d) => ({
        timestamp: new Date(d.date).getTime() / 1000,
        totalValue: getDailyValue(d, unit),
        models: d.modelsUsed,
      }));
    }
  }, [daily, blocks, timeRange, rangeConfig, actualSource, unit]);

  // Get filtered data for model extraction (daily or blocks)
  const filteredDaily = useMemo(() => {
    const range = rangeConfig;
    if (!range || actualSource !== 'daily') return [];

    const cutoffTime = Date.now() - range.hours * 60 * 60 * 1000;
    const cutoffStr = new Date(cutoffTime).toISOString().split('T')[0];
    const filtered = daily.filter((d) => d.date >= cutoffStr);
    const sampleRate = range.source === 'daily' ? range.sampleRate! : 'daily';
    return aggregateByPeriod(filtered, sampleRate);
  }, [daily, rangeConfig, actualSource]);

  const filteredBlocks = useMemo(() => {
    const range = rangeConfig;
    if (!range || actualSource !== 'blocks') return [];

    const cutoffTime = Date.now() - range.hours * 60 * 60 * 1000;
    return blocks.filter((b) => new Date(b.startTime).getTime() >= cutoffTime);
  }, [blocks, rangeConfig, actualSource]);

  // Extract models that have non-zero usage in the displayed period
  const models = useMemo(() => {
    const modelValues = new Map<string, number>();

    if (actualSource === 'blocks') {
      // For blocks, models don't have individual breakdowns, just track usage
      for (const block of filteredBlocks) {
        for (const model of block.modelsUsed) {
          const current = modelValues.get(model) ?? 0;
          // Distribute block value equally among models (approximation)
          modelValues.set(model, current + getBlockValue(block, unit) / block.modelsUsed.length);
        }
      }
    } else {
      for (const day of filteredDaily) {
        for (const breakdown of day.modelBreakdowns) {
          const current = modelValues.get(breakdown.modelName) ?? 0;
          modelValues.set(breakdown.modelName, current + getModelValue(breakdown, unit));
        }
      }
    }

    // Only include models with non-zero value
    return Array.from(modelValues.entries())
      .filter(([, value]) => value > 0)
      .map(([model]) => model)
      .sort();
  }, [filteredDaily, filteredBlocks, actualSource, unit]);

  // Prepare data for uplot: [timestamps[], total[], model1[], model2[], ...]
  const data = useMemo(() => {
    if (chartData.length === 0) {
      return [[]] as uPlot.AlignedData;
    }

    const timestamps = chartData.map((d) => d.timestamp);
    const totalValues = chartData.map((d) => d.totalValue);

    // For blocks, we don't have per-model breakdowns, so skip model series
    if (actualSource === 'blocks') {
      return [timestamps, totalValues] as uPlot.AlignedData;
    }

    // Per-model values (only for daily data)
    const modelValues = models.map((model) =>
      filteredDaily.map((d) => {
        const breakdown = d.modelBreakdowns.find((b) => b.modelName === model);
        return breakdown ? getModelValue(breakdown, unit) : 0;
      })
    );

    return [timestamps, totalValues, ...modelValues] as uPlot.AlignedData;
  }, [chartData, filteredDaily, models, actualSource, unit]);

  // Chart options
  const opts = useMemo((): uPlot.Options => {
    const isBlocksMode = actualSource === 'blocks';

    const series: uPlot.Series[] = [
      {}, // X axis series (timestamps)
      {
        // Total series
        label: 'Total',
        stroke: 'rgb(255, 255, 255)',
        width: 2,
        points: { show: false },
      },
      // Per-model series (only for daily data)
      ...(isBlocksMode
        ? []
        : models.map((model) => ({
            label: shortModelName(model),
            stroke: getModelColor(model),
            width: 1.5,
            points: { show: false },
            dash: [4, 2],
          }))),
    ];

    return {
      width: 600, // Will be updated on resize
      height,
      padding: [10, 10, 0, 0],
      cursor: {
        show: true,
        points: { show: true },
      },
      legend: {
        show: true,
        live: true,
      },
      axes: [
        {
          // X axis (time)
          stroke: 'rgba(255, 255, 255, 0.3)',
          grid: { show: false },
          ticks: { show: false },
          values: (_, ticks) => {
            return ticks.map((t) => {
              const d = new Date(t * 1000);
              if (actualSource === 'blocks') {
                // Show time for blocks view (HH:MM)
                return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
              }
              if (rangeConfig?.sampleRate === 'monthly') {
                // Show month name for monthly view
                return d.toLocaleDateString('en-US', { month: 'short' });
              }
              // Daily/weekly: show M/D
              return `${d.getMonth() + 1}/${d.getDate()}`;
            });
          },
          font: '10px system-ui',
          labelFont: '10px system-ui',
        },
        {
          // Y axis
          stroke: 'rgba(255, 255, 255, 0.3)',
          grid: {
            stroke: 'rgba(255, 255, 255, 0.1)',
            width: 1,
          },
          ticks: { show: false },
          values: (_, ticks) => ticks.map((v) => formatValue(v, unit)),
          font: '10px system-ui',
          labelFont: '10px system-ui',
          size: 50,
        },
      ],
      series,
      scales: {
        x: { time: true },
        y: {
          auto: true,
          range: (_u, _min, max) => [0, max * 1.1],
        },
      },
    };
  }, [height, models, rangeConfig, actualSource, unit]);

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
      {/* Controls row */}
      <div className="flex items-center justify-between gap-4 mb-2">
        {/* Time range selector */}
        <div className="flex items-center gap-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => setTimeRange(range.value)}
              className={clsx(
                'px-2 py-0.5 text-xs rounded transition-colors',
                timeRange === range.value
                  ? 'bg-accent-primary text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              )}
            >
              {range.label}
            </button>
          ))}
        </div>

        {/* Unit selector */}
        <div className="flex items-center gap-1">
          {UNITS.map((u) => (
            <button
              key={u.value}
              onClick={() => setUnit(u.value)}
              className={clsx(
                'px-2 py-0.5 text-xs rounded transition-colors',
                unit === u.value
                  ? 'bg-accent-primary text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              )}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {chartData.length === 0 ? (
        <div className="text-text-secondary text-xs text-center py-4">
          No data for selected period
        </div>
      ) : (
        <div ref={containerRef} className="w-full" />
      )}
    </div>
  );
}
