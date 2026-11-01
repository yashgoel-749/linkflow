import { useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Copy,
  Download,
  Globe2,
  Hash,
  Laptop,
  Map,
  RefreshCw,
  Share2,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { rangeLabel, useAnalytics } from '../lib/analytics';
import type { TrafficMetric } from '../types/link';
import { downloadFile, number, shortUrl } from '../lib/utils';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardHeading } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { Dialog } from '../components/ui/Dialog';
import { TrafficChart } from '../components/charts/TrafficChart';
import { DeviceChart } from '../components/charts/DeviceChart';
import { RequestState } from '../components/ui/RequestState';
import type { AnalyticsReport } from '../lib/api';
import './AnalyticsPage.css';

const metrics: { value: Exclude<TrafficMetric, 'conversions'>; label: string }[] = [
  { value: 'clicks', label: 'Clicks' },
  { value: 'visitors', label: 'Unique Visitors' },
];

export default function AnalyticsPage() {
  const { links } = useAuth();
  const [source, setSource] = useState('all');
  const [days, setDays] = useState(31);
  const { state, refresh } = useAnalytics({ source, days });
  return (
    <div className="analytics-page page-stack animate-enter">
      <PageHeader
        title="Analytics & Traffic Insights"
        description="Actual recorded redirects, reported by UTC calendar day."
        actions={
          <>
            <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2">
              <CalendarDays size={17} className="text-accent-soft" />
              <label className="text-[10px] text-muted">
                Timeframe
                <select
                  className="block max-w-[270px] bg-transparent py-1 text-xs text-foreground outline-none"
                  aria-label="Analytics timeframe"
                  value={days}
                  onChange={(event) => setDays(Number(event.target.value))}
                >
                  {[7, 14, 31, 90, 365].map((value) => (
                    <option key={value} value={value}>
                      {rangeLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <select
              aria-label="Analytics link source"
              className="select max-w-[185px]"
              value={source}
              onChange={(event) => setSource(event.target.value)}
            >
              <option value="all">All Active Links</option>
              <option value="everything">All Links</option>
              {links.map((link) => (
                <option key={link.id} value={link.id}>
                  {link.title}
                </option>
              ))}
            </select>
            <button
              aria-label="Refresh analytics"
              className="icon-button bg-surface"
              onClick={refresh}
            >
              <RefreshCw size={15} />
            </button>
          </>
        }
      />
      {state.kind !== 'ready' ? (
        <RequestState
          label="Loading traffic report…"
          error={state.kind === 'error' ? state.message : undefined}
          onRetry={refresh}
        />
      ) : (
        <ReportView report={state.report} />
      )}
    </div>
  );
}

function ReportView({ report }: { report: AnalyticsReport }) {
  const { copy } = useAuth();
  const [metric, setMetric] = useState<Exclude<TrafficMetric, 'conversions'>>('clicks');
  const [details, setDetails] = useState<'referrers' | 'countries' | null>(null);
  const { timeline, total, visitors, leaders, channels, referrers, geography: countries } = report;
  function exportData() {
    downloadFile(report.csv);
  }
  return (
    <div className="analytics-page page-stack animate-enter">
      <p className="text-xs text-muted">
        {report.from.slice(0, 10)} – {report.to.slice(0, 10)} (exclusive end, UTC) ·{' '}
        {report.sourceName}
      </p>
      {!total && (
        <p role="status" className="rounded-xl bg-input p-4 text-sm text-muted">
          No recorded redirects in this range.
        </p>
      )}
      <div
        className="analytics-stats grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4"
        role="group"
        aria-label="Analytics overview"
      >
        {[
          {
            label: 'Unique visitors',
            icon: UsersRound,
            content: (
              <>
                <span>{number.format(visitors)}</span>
              </>
            ),
            foot: (
              <>
                <span>Privacy-preserving estimate</span>
                <strong>{total ? ((visitors / total) * 100).toFixed(1) : '0.0'}% unique</strong>
              </>
            ),
          },
          {
            label: 'Peak click hour',
            icon: Clock3,
            content: <span className="text-[24px]">{report.peakHour ?? 'No traffic'}</span>,
            foot: (
              <>
                <span>Standardized zone</span>
                <Badge>UTC</Badge>
              </>
            ),
          },
          {
            label: 'Top referring channel',
            icon: Share2,
            content: (
              <>
                <span>{channels[0]?.name ?? 'No traffic'}</span>
                <span className="ml-2 font-sans text-xs text-accent-soft">
                  {channels[0]?.share ?? 0}%
                </span>
              </>
            ),
            foot: (
              <>
                <span>Volume share</span>
                <strong>{number.format(channels[0]?.count ?? 0)} clicks</strong>
              </>
            ),
          },
          {
            label: 'Top geography',
            icon: Globe2,
            content: (
              <>
                <span>{countries[0]?.name ?? 'No traffic'}</span>
                <span className="ml-2 font-sans text-xs text-danger">
                  {countries[0]?.share ?? 0}%
                </span>
              </>
            ),
            foot: (
              <>
                <span>Total country hits</span>
                <strong>{number.format(countries[0]?.count ?? 0)} clicks</strong>
              </>
            ),
          },
        ].map((stat) => (
          <Card
            key={stat.label}
            aria-label={stat.label}
            className="flex min-h-[190px] flex-col justify-between gap-5 p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow max-w-[125px]">{stat.label}</p>
              <span className="rounded-lg bg-elevated p-2 text-accent-soft">
                <stat.icon size={18} />
              </span>
            </div>
            <div>
              <p className="font-display text-[29px] font-bold leading-tight tracking-tight">
                {stat.content}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-muted">
                {stat.foot}
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Card className="analytics-timeline p-5 sm:p-6" aria-label="Click Volume Timeline">
        <CardHeading
          title="Click Volume Timeline"
          description="Recorded redirects and daily visitor estimates"
          action={
            <div className="timeline-actions flex flex-wrap items-center gap-2">
              <Tabs label="Traffic metric" options={metrics} value={metric} onChange={setMetric} />
              <button
                disabled
                className="text-xs text-muted"
                title="Conversion tracking is not implemented"
              >
                Conversions unavailable
              </button>
            </div>
          }
        />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {number.format(total)} clicks <span className="mx-2 text-border">/</span>{' '}
            {number.format(visitors)} unique visitors
          </p>
        </div>
        <TrafficChart data={timeline} metric={metric} height={280} />
        <div className="sr-only">
          <table aria-label="Selected analytics timeline">
            <thead>
              <tr>
                <th>Date</th>
                <th>Clicks</th>
                <th>Unique visitors</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((point) => (
                <tr key={point.date}>
                  <th>{point.date}</th>
                  <td>{point.clicks}</td>
                  <td>{point.visitors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="analytics-breakdowns grid gap-4 xl:grid-cols-2">
        <Card className="flex flex-col p-5 sm:p-6">
          <CardHeading
            title="Device & Operating System"
            description="Device classifications from request user-agent"
            action={
              <span className="icon-button bg-elevated">
                <Laptop size={17} />
              </span>
            }
          />
          <DeviceChart devices={report.devices} />
          <div className="mt-8">
            <p className="eyebrow mb-2">OS distribution</p>
            <div className="flex flex-wrap gap-2">
              {report.systems.map((os) => (
                <Badge key={os.name} tone="muted">
                  <span title={`${number.format(os.count)} clicks`}>
                    {os.name} {os.share}%
                  </span>
                </Badge>
              ))}
            </div>
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <CardHeading
            title="Top Inbound Referrers"
            description="Attribution by origin domains & marketing mediums"
            action={
              <span className="icon-button bg-elevated">
                <Share2 size={17} />
              </span>
            }
          />
          <div className="space-y-2">
            {referrers.map((referrer) => (
              <div className="flex items-center gap-3 rounded-xl bg-input p-3" key={referrer.name}>
                <span className="rounded-lg bg-elevated p-2" style={{ color: referrer.color }}>
                  <Hash size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{referrer.name}</p>
                  <p className="mt-1 text-[10px] text-muted">{referrer.detail}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold">{number.format(referrer.count)}</p>
                  <p className="mt-1 text-[10px] text-muted">{referrer.share}%</p>
                </div>
                <div className="hidden w-14 sm:block">
                  <div className="progress-track">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${referrer.share}%`, background: referrer.color }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <span className="text-[10px] text-subtle">Recorded referrer origins</span>
            <button className="text-link" onClick={() => setDetails('referrers')}>
              View All Referrers <ArrowRight size={12} />
            </button>
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <CardHeading
            title="Top Countries & Regions"
            description="Unknown unless a trusted geolocation source is configured"
            action={
              <span className="icon-button bg-elevated">
                <Map size={17} />
              </span>
            }
          />
          <div className="space-y-5">
            {countries.slice(0, 5).map((country) => (
              <div key={country.code}>
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <span className="rounded bg-elevated px-1.5 py-1 text-[9px] font-medium">
                    {country.code}
                  </span>
                  <span className="flex-1">{country.name}</span>
                  <span className="text-muted">{number.format(country.count)} clicks</span>
                  <span className="min-w-10 text-right font-semibold text-accent-soft">
                    {country.share}%
                  </span>
                </div>
                <div className="progress-track bg-transparent">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${country.share}%`, background: country.color }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <span className="text-[10px] text-subtle">Geography may be unavailable</span>
            <button className="text-link" onClick={() => setDetails('countries')}>
              View All Countries <ArrowRight size={12} />
            </button>
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <CardHeading
            title="Link Performance Leaderboard"
            description="Links ranked by actual redirects in the selected range"
            action={
              <span className="icon-button bg-elevated">
                <Trophy size={17} />
              </span>
            }
          />
          <div className="space-y-3">
            {leaders.map(({ link, clicks }, index) => (
              <div key={link.id} className="flex items-center gap-3 rounded-xl bg-input p-3">
                <span
                  className={`rounded-lg px-2 py-2 text-[11px] font-bold ${index === 0 ? 'bg-yellow-400/10 text-yellow-400' : 'bg-elevated text-muted'}`}
                >
                  #{index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{link.title}</p>
                  <p className="mt-1 truncate text-[10px] text-muted">{shortUrl(link)}</p>
                </div>
                <div className="text-right">
                  <p className="whitespace-nowrap text-[11px] font-semibold">
                    {number.format(clicks)} clicks
                  </p>
                  <p className="mt-1 text-[10px] text-success">Conversions unavailable</p>
                </div>
                <button
                  className="icon-button size-7!"
                  aria-label={`Copy leaderboard ${link.title}`}
                  onClick={async () => {
                    await copy(shortUrl(link));
                  }}
                >
                  <Copy size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <span className="text-[10px] text-subtle">{report.sourceName} · Recorded clicks</span>
            <button className="text-link" onClick={exportData}>
              Export CSV Telemetry <ArrowRight size={12} />
            </button>
          </div>
        </Card>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/30 bg-surface px-4 py-3 text-[10px] text-muted">
        <p className="flex items-center gap-2">
          <Globe2 size={14} className="text-accent-soft" />
          Visitor counts are estimates. Conversion tracking and growth comparisons are unavailable.
        </p>
      </div>
      <Dialog
        open={details !== null}
        onClose={() => setDetails(null)}
        title={details === 'countries' ? 'Geographic distribution' : 'Referrer breakdown'}
      >
        <p className="mb-4 text-xs text-muted">
          Distribution for {number.format(total)} recorded clicks in the selected timeframe.
        </p>
        <div className="space-y-3">
          {(details === 'countries' ? countries : referrers).map((item) => (
            <div key={item.name} className="flex justify-between rounded-xl bg-input p-3">
              <span>{item.name}</span>
              <span className="font-semibold text-accent-soft">
                {number.format(item.count)} clicks · {item.share}%
              </span>
            </div>
          ))}
        </div>
        <Button className="mt-5" onClick={exportData}>
          <Download size={15} />
          Export report CSV
        </Button>
      </Dialog>
    </div>
  );
}
