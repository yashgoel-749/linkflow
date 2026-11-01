import { useState } from 'react';
import { ArrowRight, Download, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { number, downloadFile, shortUrl } from '../lib/utils';
import { dashboardPeriods, recentLinks } from '../lib/dashboard';
import { rangeLabel, useAnalytics } from '../lib/analytics';
import type { DashboardPeriod } from '../lib/dashboard';
import type { ShortLink, TrafficMetric } from '../types/link';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardHeading } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
import { Dialog } from '../components/ui/Dialog';
import { RequestState } from '../components/ui/RequestState';
import { StatCard } from '../components/charts/StatCard';
import { TrafficChart } from '../components/charts/TrafficChart';
import { ShortenForm } from '../components/links/ShortenForm';
import { RecentLinks } from '../components/links/RecentLinks';
import { QrPreview } from '../components/links/QrPreview';
import './DashboardPage.css';

export default function DashboardPage() {
  const { links, profile, copy } = useAuth();
  const [period, setPeriod] = useState<DashboardPeriod>('30D');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [qrId, setQrId] = useState<ShortLink['id'] | null>(null);
  const [metric, setMetric] = useState<Exclude<TrafficMetric, 'conversions'>>('clicks');
  const days = dashboardPeriods.find((item) => item.value === period)?.days ?? 30;
  const { state, refresh } = useAnalytics({ days, source: 'everything' });
  const qrLink = links.find((link) => link.id === qrId);
  const active = links.filter(
    (link) => link.status === 'active' || link.status === 'expiring'
  ).length;
  const activePercent = links.length ? (active / links.length) * 100 : 0;
  return (
    <div className="dashboard-page animate-enter">
      <PageHeader
        title={`Welcome back, ${profile.name.split(' ')[0]} 👋`}
        description={`Link performance for ${rangeLabel(days)}.`}
        actions={
          <>
            <Tabs
              label="Dashboard time range"
              options={dashboardPeriods}
              value={period}
              onChange={setPeriod}
            />
            <Button
              disabled={state.kind !== 'ready'}
              onClick={() => {
                if (state.kind === 'ready') downloadFile(state.report.csv);
              }}
            >
              <Download size={15} /> Export CSV
            </Button>
          </>
        }
      />
      {period === 'All-time' && (
        <p className="mb-4 text-xs text-muted">
          All-time reporting is limited to the last 365 days. Inventory counts below include all
          persisted links.
        </p>
      )}
      <div
        className="dashboard-stats grid grid-cols-2 gap-4 xl:grid-cols-4"
        role="group"
        aria-label="Dashboard metrics"
      >
        <StatCard
          label="Total clicks"
          value={state.kind === 'ready' ? number.format(state.report.total) : '—'}
          detail="Actual redirects in selected range"
        />
        <StatCard
          label="Links created"
          value={number.format(links.length)}
          detail="All persisted inventory"
        />
        <StatCard
          label="Active links"
          value={number.format(active)}
          detail={`${activePercent.toFixed(1)}% current inventory`}
          progress={activePercent}
        />
        <StatCard
          label="Unique visitors"
          value={state.kind === 'ready' ? number.format(state.report.visitors) : '—'}
          detail="Range-distinct privacy-preserving estimate"
        />
      </div>
      <Card className="dashboard-engine p-5 sm:p-6" aria-label="Quick Shorten Engine">
        <div className="engine-header mb-6 flex items-center gap-3">
          <span className="rounded-xl bg-elevated p-2.5 text-accent-soft">
            <Zap size={20} />
          </span>
          <div>
            <h2>Quick Shorten Engine</h2>
            <p className="section-description">Create a persistent short link and copy its URL.</p>
          </div>
        </div>
        <ShortenForm compact />
      </Card>
      <RecentLinks
        {...recentLinks(links, query, tag)}
        query={query}
        tag={tag}
        onQueryChange={setQuery}
        onTagChange={setTag}
        onCopy={async (link) => {
          await copy(shortUrl(link));
        }}
        onQr={setQrId}
      />
      {state.kind !== 'ready' ? (
        <RequestState
          label="Loading traffic report…"
          error={state.kind === 'error' ? state.message : undefined}
          onRetry={refresh}
        />
      ) : (
        <div className="dashboard-insights grid gap-[18px] xl:grid-cols-[1.42fr_1fr]">
          <Card className="dashboard-traffic p-5 sm:p-6" aria-label="Traffic Velocity">
            <CardHeading
              title="Traffic Velocity"
              description="Recorded redirects by UTC calendar day"
              action={
                <Tabs
                  label="Traffic measure"
                  options={[
                    { value: 'clicks', label: 'Clicks' },
                    { value: 'visitors', label: 'Unique visitors' },
                  ]}
                  value={metric}
                  onChange={setMetric}
                />
              }
            />
            <TrafficChart data={state.report.timeline} metric={metric} height={220} />
            {!state.report.total && (
              <p className="text-xs text-muted">No recorded redirects in this range.</p>
            )}
          </Card>
          <Card className="dashboard-referrers p-5 sm:p-6">
            <CardHeading
              title="Top Channel Referrers"
              description="Referrer origins from recorded redirects"
            />
            <div className="space-y-4">
              {state.report.channels.map((channel) => (
                <div key={channel.name}>
                  <div className="mb-2 flex justify-between text-xs">
                    <span>{channel.name}</span>
                    <span>
                      {number.format(channel.count)} ({channel.share}%)
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${channel.share}%`, background: channel.color }}
                    />
                  </div>
                </div>
              ))}
              {!state.report.channels.length && (
                <p className="text-sm text-muted">No referrer traffic.</p>
              )}
            </div>
            <Link className="text-link mt-6" to="/analytics">
              Explore Referrer Breakdowns <ArrowRight size={14} />
            </Link>
          </Card>
        </div>
      )}
      <p className="mt-5 text-[10px] text-subtle">
        Conversion tracking, click-through rate, growth comparisons, and infrastructure measurements
        are unavailable. Search and tags filter current inventory only.
      </p>
      <Dialog open={!!qrLink} onClose={() => setQrId(null)} title="Link QR code">
        {qrLink && <QrPreview link={qrLink} />}
      </Dialog>
    </div>
  );
}
