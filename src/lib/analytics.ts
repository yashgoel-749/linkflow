import { useEffect, useState } from 'react';
import { api, errorMessage, reportSchema } from './api';
import type { AnalyticsReport } from './api';

export type AnalyticsSnapshot = AnalyticsReport;
type ReportState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; report: AnalyticsReport };
export function useAnalytics({ days, source }: { days: number; source: string }) {
  const [result, setResult] = useState<{ key: string; state: ReportState } | null>(null);
  const [revision, setRevision] = useState(0);
  const key = `${days}:${source}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    api(`/analytics?${new URLSearchParams({ days: String(days), source })}`, reportSchema, {
      signal: controller.signal,
    })
      .then((report) => {
        if (!controller.signal.aborted) setResult({ key, state: { kind: 'ready', report } });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key, state: { kind: 'error', message: errorMessage(error) } });
      });
    return () => controller.abort();
  }, [days, source, key]);
  const state: ReportState = result?.key === key ? result.state : { kind: 'loading' };
  return { state, refresh: () => setRevision((value) => value + 1) };
}
export function rangeLabel(days: number, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return `${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)} (UTC)`;
}
