import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrafficMetric, TrafficPoint } from '../../types/link';
import { number } from '../../lib/utils';

export function TrafficChart({
  data,
  metric = 'clicks',
  height = 300,
  secondary = true,
}: {
  data: TrafficPoint[];
  metric?: TrafficMetric;
  height?: number;
  secondary?: boolean;
}) {
  const id = useId().replaceAll(':', '');
  const label =
    metric === 'clicks' ? 'Clicks' : metric === 'visitors' ? 'Unique visitors' : 'Conversions';
  return (
    <div
      className="w-full min-w-0"
      style={{ height }}
      role="img"
      aria-label={`${label} traffic chart with ${data.length} daily data points`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 18, right: 4, left: 4, bottom: 8 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8f6bfa" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#8f6bfa" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--border)"
            strokeDasharray="3 6"
            vertical={false}
            strokeOpacity={0.4}
          />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            minTickGap={65}
            dy={12}
            tickMargin={10}
          />
          <YAxis
            hide
            domain={[0, Math.ceil(Math.max(1, ...data.map((point) => point.clicks)) * 1.12)]}
          />
          <Tooltip
            content={({ active, payload, label: date }) =>
              active && payload?.length ? (
                <div className="chart-tooltip">
                  <p className="mb-2 font-medium">{date} (UTC)</p>
                  {payload.map((item) => (
                    <p
                      key={String(item.dataKey)}
                      className="mt-1 flex items-center justify-between gap-7 text-muted"
                    >
                      <span>{item.name}</span>
                      <span className="font-medium text-foreground">
                        {number.format(Number(item.value))}
                      </span>
                    </p>
                  ))}
                  <p className="mt-2 text-muted">Conversion tracking unavailable</p>
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey={metric}
            name={label}
            stroke="#c2b8ff"
            strokeWidth={2.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
          />
          {secondary && metric === 'clicks' && (
            <Area
              type="monotone"
              dataKey="visitors"
              name="Unique visitors"
              stroke="#aa8fcf"
              strokeWidth={1.5}
              fill="transparent"
              isAnimationActive={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
