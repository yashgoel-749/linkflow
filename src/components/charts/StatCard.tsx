import type { ReactNode } from 'react';
import { Card } from '../ui/Card';

export function StatCard({
  label,
  value,
  detail,
  badge,
  sparkline,
  color = '#c2b8ff',
  icon,
  compact = false,
  progress,
}: {
  label: string;
  value: string;
  detail: ReactNode;
  badge?: ReactNode;
  sparkline?: string;
  color?: string;
  icon?: ReactNode;
  compact?: boolean;
  progress?: number;
}) {
  return (
    <Card aria-label={label} className={`relative overflow-hidden ${compact ? 'p-5' : 'p-5 pb-4'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {badge}
        {icon && <span className="rounded-xl bg-elevated/70 p-2.5 text-accent-soft">{icon}</span>}
      </div>
      <p
        className={
          compact
            ? 'mt-3 font-display text-[30px] font-bold leading-none tracking-tight'
            : 'stat-value mt-3'
        }
      >
        {value}
      </p>
      <div className="mt-2 text-xs text-muted">{detail}</div>
      {sparkline && (
        <div className="mt-5 h-10">
          <svg
            viewBox="0 0 220 40"
            preserveAspectRatio="none"
            className="h-full w-full"
            aria-hidden="true"
          >
            <path d={sparkline} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      )}
      {!compact && !sparkline && progress !== undefined && (
        <div className="progress-track mt-10">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </Card>
  );
}
