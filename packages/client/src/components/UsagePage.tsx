import { UsageChart } from './UsageChart';
import { formatCost, shortModelName, type GlobalUsageData } from './UsageDisplay';

export interface UsagePageProps {
  globalUsage: GlobalUsageData | null;
}

// Format large numbers with K/M suffix
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
}

function StatCard({ title, value, subtitle }: StatCardProps) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-4">
      <div className="text-sm text-text-secondary mb-1">{title}</div>
      <div className="text-2xl font-semibold text-text-primary">{value}</div>
      {subtitle && (
        <div className="text-xs text-text-secondary mt-1">{subtitle}</div>
      )}
    </div>
  );
}

export function UsagePage({ globalUsage }: UsagePageProps) {
  const totals = globalUsage?.totals;
  const today = globalUsage?.today;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">Usage</h1>
        <p className="text-text-secondary mb-8">
          Track your API usage and costs
        </p>

        {!globalUsage || !totals ? (
          <div className="text-center text-text-secondary py-12">
            No usage data available
          </div>
        ) : (
          <div className="space-y-8">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Total Cost"
                value={formatCost(totals.totalCost)}
                subtitle="All time"
              />
              <StatCard
                title="Today"
                value={today ? formatCost(today.totalCost) : '$0.00'}
              />
              <StatCard
                title="Input Tokens"
                value={formatTokens(totals.inputTokens)}
              />
              <StatCard
                title="Output Tokens"
                value={formatTokens(totals.outputTokens)}
              />
            </div>

            {/* Usage chart */}
            <div className="bg-bg-secondary border border-border rounded-lg p-4">
              <h2 className="text-base font-medium text-text-primary mb-4">Usage Over Time</h2>
              <UsageChart
                daily={globalUsage.daily}
                blocks={globalUsage.blocks}
                height={250}
              />
            </div>

            {/* Model breakdown */}
            {totals.modelBreakdowns && totals.modelBreakdowns.length > 0 && (
              <div className="bg-bg-secondary border border-border rounded-lg p-4">
                <h2 className="text-base font-medium text-text-primary mb-4">Cost by Model</h2>
                <div className="space-y-3">
                  {totals.modelBreakdowns
                    .sort((a, b) => b.cost - a.cost)
                    .map((model) => {
                      const percentage = totals.totalCost > 0
                        ? (model.cost / totals.totalCost) * 100
                        : 0;
                      return (
                        <div key={model.modelName} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-text-primary font-medium">
                              {shortModelName(model.modelName)}
                            </span>
                            <span className="text-text-secondary">
                              {formatCost(model.cost)} ({percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent-primary rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-text-secondary">
                            <span>↓ {formatTokens(model.inputTokens)} input</span>
                            <span>↑ {formatTokens(model.outputTokens)} output</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Today's breakdown */}
            {today && today.modelBreakdowns && today.modelBreakdowns.length > 0 && (
              <div className="bg-bg-secondary border border-border rounded-lg p-4">
                <h2 className="text-base font-medium text-text-primary mb-4">Today's Usage</h2>
                <div className="space-y-2">
                  {today.modelBreakdowns.map((model) => (
                    <div key={model.modelName} className="flex items-center justify-between text-sm">
                      <span className="text-text-primary">
                        {shortModelName(model.modelName)}
                      </span>
                      <span className="text-text-secondary">
                        {formatCost(model.cost)} · {formatTokens(model.inputTokens + model.outputTokens)} tokens
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
