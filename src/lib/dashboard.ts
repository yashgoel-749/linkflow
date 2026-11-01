import type { ShortLink, TrafficPoint } from '../types/link';
import { relativeDate } from './utils';
export const dashboardPeriods = [
  { value: '7D', label: '7D', days: 7 },
  { value: '30D', label: '30D', days: 30 },
  { value: '3M', label: '3M', days: 90 },
  { value: '12M', label: '12M', days: 365 },
  { value: 'All-time', label: 'All-time*', days: 365 },
] satisfies { value: string; label: string; days: number }[];
export type DashboardPeriod = (typeof dashboardPeriods)[number]['value'];
export type DashboardTrafficPoint = Pick<TrafficPoint, 'date' | 'clicks' | 'visitors'>;
export function recentLinks(links: readonly ShortLink[], query: string, tag: string | null) {
  const active = links.filter((link) => link.status === 'active' || link.status === 'expiring');
  return {
    rows: active
      .filter(
        (link) =>
          `${link.title} ${link.slug} ${link.destination}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (!tag || link.tags.includes(tag))
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .map((link) => ({ link, clicks: link.clicks, createdLabel: relativeDate(link.createdAt) })),
    tags: [...new Set(active.flatMap((link) => link.tags))].sort(),
  };
}
