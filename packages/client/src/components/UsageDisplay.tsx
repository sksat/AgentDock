import type { BlockUsage, DailyUsage, UsageTotals } from '@agent-dock/shared';

export interface GlobalUsageData {
  today: DailyUsage | null;
  totals: UsageTotals;
  /** Daily usage history (sorted by date ascending) */
  daily: DailyUsage[];
  /** Block usage history for finer granularity (sorted by startTime ascending) */
  blocks: BlockUsage[];
}

// Format cost to display nicely
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

// Shorten model name for display
export function shortModelName(modelName: string): string {
  if (modelName.includes('opus')) return 'opus';
  if (modelName.includes('sonnet')) return 'sonnet';
  if (modelName.includes('haiku')) return 'haiku';
  return modelName.split('-')[0];
}

export interface UsageDisplayProps {
  usage: GlobalUsageData;
}

export function UsageDisplay({ usage }: UsageDisplayProps) {
  const today = usage.today;
  const totals = usage.totals;

  return (
    <div className="border-t border-border p-3 space-y-3">
      {/* Today's usage */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">Today</span>
          <span className="font-medium text-text-primary">
            {today ? formatCost(today.totalCost) : '$0.00'}
          </span>
        </div>
        {/* Model breakdown */}
        {today?.modelBreakdowns && today.modelBreakdowns.length > 0 && (
          <div className="text-xs text-text-secondary space-y-0.5 pl-2">
            {today.modelBreakdowns.map((model) => (
              <div key={model.modelName} className="flex items-center justify-between">
                <span>{shortModelName(model.modelName)}</span>
                <span>{formatCost(model.cost)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Total usage */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">Total</span>
          <span className="font-medium text-accent-primary">
            {formatCost(totals.totalCost)}
          </span>
        </div>
      </div>
    </div>
  );
}
