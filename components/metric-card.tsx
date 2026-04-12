'use client';

import { formatValue } from '@/lib/config';

interface Metric {
  id: string;
  label: string;
  value: number;
  change: string;
  positive: boolean;
  format?: string;
}

export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <p className="text-sm font-medium text-slate-400">{metric.label}</p>
      <p className="mt-2 text-3xl font-bold text-white">{formatValue(metric.value, metric.format)}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className={`text-sm font-medium ${metric.positive ? 'text-green-400' : 'text-red-400'}`}>
          {metric.change}
        </span>
        <span className="text-sm text-slate-500">vs last period</span>
      </div>
    </div>
  );
}
