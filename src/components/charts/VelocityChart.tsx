import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { number } from '../../lib/utils';
import type { DashboardTrafficPoint } from '../../lib/dashboard';
import type { TrafficMetric } from '../../types/link';

export function VelocityChart({
  points,
  metric,
  period,
}: {
  points: readonly DashboardTrafficPoint[];
  metric: Exclude<TrafficMetric, 'conversions'>;
  period: string;
}) {
  const maximum = Math.max(0, ...points.map((point) => point[metric]));
  const metricLabel = metric === 'clicks' ? 'clicks' : 'unique visitors';
  return (
    <>
      <div
        className="velocity-chart h-[200px] w-full"
        role="img"
        aria-label={`${period} ${metricLabel} by UTC date`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[...points]} margin={{ top: 12, left: -5, right: -5, bottom: 0 }}>
            <XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={12} />
            <YAxis
              hide
              domain={[0, Math.ceil(Math.max(1, ...points.map((point) => point.clicks)) * 1.12)]}
            />
            <Tooltip
              cursor={{ fill: 'var(--elevated)' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="chart-tooltip">
                    <p className="mb-1 text-muted">
                      {payload[0].payload.date} · {period}
                    </p>
                    {number.format(Number(payload[0].value))} {metricLabel}
                  </div>
                ) : null
              }
            />
            <Bar dataKey={metric} radius={[5, 5, 0, 0]} isAnimationActive={false}>
              {points.map((point) => (
                <Cell
                  key={point.date}
                  fill={point[metric] === maximum ? 'var(--accent)' : 'var(--border)'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="sr-only">
        <table aria-label={`${period} traffic data`}>
          <thead>
            <tr>
              <th>UTC date</th>
              <th>Clicks</th>
              <th>Estimated unique visitors</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.date}>
                <th>{point.date}</th>
                <td>{point.clicks}</td>
                <td>{point.visitors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
