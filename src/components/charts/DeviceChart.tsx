import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { AnalyticsSnapshot } from '../../lib/analytics';
import { number } from '../../lib/utils';

export function DeviceChart({ devices }: { devices: AnalyticsSnapshot['devices'] }) {
  const hasTraffic = devices.some((device) => device.count > 0);
  const largest = [...devices].sort((a, b) => b.count - a.count)[0];
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div
        className="relative size-[150px] shrink-0"
        role="img"
        aria-label={
          hasTraffic
            ? `Device breakdown: ${devices.map((device) => `${device.name} ${device.share}%`).join(', ')}`
            : 'No device traffic for the selected source'
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={devices}
              innerRadius="70%"
              outerRadius="94%"
              paddingAngle={1}
              dataKey="count"
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              {devices.map((device) => (
                <Cell key={device.name} fill={device.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [number.format(Number(value)), 'Clicks']} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[25px] font-bold">
            {hasTraffic ? `${largest?.share ?? 0}%` : '0'}
          </span>
          <span className="text-[9px] font-medium uppercase text-muted">
            {hasTraffic ? largest?.name : 'No traffic'}
          </span>
        </div>
      </div>
      <div className="w-full min-w-0 flex-1 space-y-4">
        {devices.map((device) => (
          <div key={device.name}>
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full" style={{ background: device.color }} />
                {device.name}
              </span>
              <span className="whitespace-nowrap font-semibold">
                {device.share}% ({number.format(device.count)})
              </span>
            </div>
            <div className="progress-track">
              <div
                className="h-full rounded-full"
                style={{ width: `${device.share}%`, background: device.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
