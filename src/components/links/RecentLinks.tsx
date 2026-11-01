import {
  ArrowUpRight,
  Copy,
  FileText,
  QrCode,
  Search,
  Video,
  ShoppingBag,
  Terminal,
  Filter,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ShortLink } from '../../types/link';
import type { recentLinks } from '../../lib/dashboard';
import { number, shortUrl } from '../../lib/utils';
import { Card, CardHeading } from '../ui/Card';
import { Field } from '../ui/Field';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Table } from '../ui/Table';

export function LinkIcon({ link }: { link: ShortLink }) {
  const Icon =
    link.category === 'Affiliates'
      ? ShoppingBag
      : link.destination.includes('youtube') || link.destination.includes('zoom')
        ? Video
        : link.category === 'Product Docs'
          ? Terminal
          : FileText;
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-elevated ${link.status === 'expiring' ? 'text-danger' : 'text-accent-soft'}`}
    >
      <Icon size={18} />
    </span>
  );
}

export function RecentLinks({
  rows,
  tags,
  query,
  tag,
  onQueryChange,
  onTagChange,
  onCopy,
  onQr,
}: {
  rows: ReturnType<typeof recentLinks>['rows'];
  tags: readonly string[];
  query: string;
  tag: string | null;
  onQueryChange: (query: string) => void;
  onTagChange: (tag: string | null) => void;
  onCopy: (link: ShortLink) => Promise<void>;
  onQr: (id: ShortLink['id']) => void;
}) {
  return (
    <Card className="recent-links-card overflow-hidden p-5 sm:p-6" aria-label="Recent active links">
      <CardHeading
        title="Recent Active Links"
        description="Recorded clicks and persisted link inventory"
        action={
          <div className="recent-filter-actions flex flex-wrap items-center gap-2">
            <Field
              aria-label="Filter recent links"
              type="search"
              icon={<Search size={15} />}
              placeholder="Filter slug or destination…"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              wrapperClassName="recent-search w-full sm:w-[260px]"
            />
            <div className="flex items-center gap-1 rounded-xl bg-input px-2">
              <Filter size={13} className="text-muted" />
              <select
                className="select min-h-9! text-xs!"
                aria-label="Filter recent links by tag"
                value={tag ?? ''}
                onChange={(event) => onTagChange(event.target.value || null)}
              >
                <option value="">Tag: All</option>
                {tags.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <Link to="/links" className="btn btn-secondary min-h-8! px-3! py-2! text-xs!">
              View All Links
            </Link>
          </div>
        }
      />
      <Table label="Recent active links" className="min-w-[790px]">
        <thead>
          <tr>
            <th>Short link & title</th>
            <th>Original destination</th>
            <th>
              QR
              <br />
              code
            </th>
            <th>
              Total
              <br />
              clicks
            </th>
            <th>
              Routing
              <br />
              status
            </th>
            <th>Created</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ link, clicks, createdLabel }) => (
            <tr key={link.id}>
              <td className="pl-0!">
                <div className="flex items-center gap-3">
                  <LinkIcon link={link} />
                  <div>
                    <p className="recent-link-title truncate font-medium" title={link.title}>
                      {link.title}
                    </p>
                    <button
                      className="mt-1 text-xs text-accent-soft"
                      onClick={async () => {
                        await onCopy(link);
                      }}
                    >
                      {shortUrl(link)}
                    </button>
                  </div>
                </div>
              </td>
              <td>
                <p className="max-w-[230px] truncate text-xs text-muted" title={link.destination}>
                  {link.destination.replace(/^https?:\/\//, '')}
                </p>
              </td>
              <td>
                <button
                  className="icon-button"
                  onClick={() => onQr(link.id)}
                  aria-label={`QR code for ${link.title}`}
                >
                  <QrCode size={19} />
                </button>
              </td>
              <td>
                <span className="inline-flex items-center gap-2 font-display text-xl font-bold">
                  {number.format(clicks)}
                  <ArrowUpRight size={13} className="text-accent-soft" />
                </span>
              </td>
              <td>
                <StatusBadge status={link.status} />
              </td>
              <td className="whitespace-nowrap text-xs text-muted">{createdLabel}</td>
              <td className="pr-0!">
                <button
                  className="icon-button"
                  onClick={async () => {
                    await onCopy(link);
                  }}
                  aria-label={`Copy ${link.title}`}
                >
                  <Copy size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {!rows.length && (
        <div className="text-center">
          <EmptyState description="No active links match this date range and filters." />
          {(query || tag !== null) && (
            <Button
              onClick={() => {
                onQueryChange('');
                onTagChange(null);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
