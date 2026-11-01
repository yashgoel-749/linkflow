import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Download,
  ExternalLink,
  Link2,
  ListFilter,
  LockKeyhole,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Pencil,
  TrendingUp,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/auth-context';
import { errorMessage } from '../lib/api';
import type { ShortLink } from '../types/link';
import { exportLinks, number, relativeDate, shortUrl } from '../lib/utils';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Field } from '../components/ui/Field';
import { Table } from '../components/ui/Table';
import { StatCard } from '../components/charts/StatCard';
import { ShortenForm } from '../components/links/ShortenForm';
import { LinkIcon } from '../components/links/RecentLinks';
import { QrPreview } from '../components/links/QrPreview';
import { EditLinkForm } from '../components/links/EditLinkForm';
import './LinksPage.css';

export default function LinksPage() {
  const { links, archiveLinks, restoreLinks, deleteLinks, copy, notify, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selected, setSelected] = useState<string[]>([]);
  const [create, setCreate] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [qr, setQr] = useState<ShortLink | null>(null);
  const [showTags, setShowTags] = useState(true);
  const [tag, setTag] = useState('');
  const [deleting, setDeleting] = useState<string[]>([]);
  const [editing, setEditing] = useState<ShortLink | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const categories = [
    'All',
    ...new Set(
      links.map((link) => link.category).filter((item) => !['All', 'Archived'].includes(item))
    ),
    'Archived',
  ];
  const tags = [...new Set(links.flatMap((link) => link.tags))].sort();
  const selectedLinks = links.filter((link) => selected.includes(link.id));
  const filtered = links
    .filter(
      (link) =>
        `${link.title} ${link.destination} ${link.domain} ${link.slug} ${link.tags.join(' ')}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()) &&
        (!tag || link.tags.includes(tag)) &&
        (category === 'All' ||
          (category === 'Archived' ? link.status === 'archived' : link.category === category)) &&
        (status === 'all' || link.status === status)
    )
    .sort((a, b) => (sort === 'clicks' ? b.clicks - a.clicks : b.createdAt - a.createdAt));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const activePage = Math.min(page, pages);
  const rows = filtered.slice((activePage - 1) * pageSize, activePage * pageSize);
  const allSelected = rows.length > 0 && rows.every((link) => selected.includes(link.id));
  const totalClicks = links.reduce((sum, link) => sum + link.clicks, 0);
  function toggle(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }

  return (
    <div className="links-page page-stack animate-enter">
      <PageHeader
        title="Links Management"
        badge={<Badge>{number.format(links.length)} links tracked</Badge>}
        description="Manage, organize, customize, and bulk edit your high-throughput shortened routing links."
        actions={
          <>
            <Button
              disabled={pending}
              onClick={async () => {
                setPending(true);
                try {
                  await refresh({ background: true });
                } catch (error) {
                  notify(errorMessage(error));
                } finally {
                  setPending(false);
                }
              }}
            >
              <RefreshCw size={15} /> Refresh links
            </Button>
            <Button onClick={() => exportLinks(filtered)}>
              <Download size={15} />
              Export CSV
            </Button>
            <Button
              onClick={() =>
                selected.length
                  ? setBulk(true)
                  : notify(
                      'Select one or more links using the row checkboxes, then choose Bulk Edit.'
                    )
              }
            >
              <ListFilter size={16} />
              Bulk Edit{selected.length > 0 && ` (${selected.length})`}
            </Button>
            <Button variant="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Create New Link
            </Button>
          </>
        }
      />
      <div className="links-stats grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        <StatCard
          compact
          label="Active redirects"
          value={number.format(
            links.filter((link) => link.status === 'active' || link.status === 'expiring').length
          )}
          detail="Current persisted inventory"
          icon={<Link2 size={22} />}
        />
        <StatCard
          compact
          label="Recorded clicks"
          value={number.format(totalClicks)}
          detail="Lifetime recorded redirects"
          icon={<TrendingUp size={22} />}
        />
        <StatCard
          compact
          label="Archived links"
          value={number.format(links.filter((link) => link.status === 'archived').length)}
          detail="Inactive redirects"
          icon={<QrCode size={22} />}
        />
        <StatCard
          compact
          label="Expired links"
          value={number.format(links.filter((link) => link.status === 'expired').length)}
          detail="Expired redirects"
          icon={<Archive size={22} />}
        />
      </div>
      <Card className="links-filters space-y-5 p-5" aria-label="Filter links">
        <div className="flex flex-col gap-3 md:flex-row">
          <Field
            aria-label="Search links"
            icon={<Search size={18} />}
            placeholder="Search by title, tag, or destination URL…"
            type="search"
            value={query}
            onChange={(event) => {
              setParams(event.target.value ? { q: event.target.value } : {}, { replace: true });
              setPage(1);
            }}
            wrapperClassName="flex-1"
            suffix={<kbd className="hidden text-xs text-muted sm:block">⌘K</kbd>}
          />
          <div className="flex gap-2">
            <select
              className="select flex-1 md:w-[165px]"
              aria-label="Link status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="expiring">Expiring</option>
              <option value="expired">Expired</option>
              <option value="archived">Archived</option>
            </select>
            <select
              className="select flex-1 md:w-[150px]"
              aria-label="Sort links"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
            >
              <option value="recent">Most Recent</option>
              <option value="clicks">Most Clicks</option>
            </select>
            <button
              aria-label="Toggle campaign tags column"
              aria-pressed={showTags}
              className="icon-button size-11! bg-input"
              onClick={() => setShowTags(!showTags)}
            >
              <Columns3 size={19} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Link categories" className="flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                onClick={() => {
                  setCategory(item);
                  setPage(1);
                }}
                aria-pressed={category === item}
                className={clsx(
                  'rounded-full px-3 py-2 text-[11px] font-semibold',
                  category === item
                    ? 'bg-accent text-[#161427]'
                    : 'bg-input text-muted hover:bg-elevated'
                )}
              >
                {item} (
                {item === 'All'
                  ? links.length
                  : links.filter((link) =>
                      item === 'Archived' ? link.status === 'archived' : link.category === item
                    ).length}
                )
              </button>
            ))}
          </div>
          <select
            className="select min-h-8! max-w-[180px] text-xs!"
            aria-label="Filter by campaign tag"
            value={tag}
            onChange={(event) => {
              setTag(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All campaign tags</option>
            {tags.map((value) => (
              <option key={value} value={value}>
                #{value}
              </option>
            ))}
          </select>
        </div>
      </Card>
      {selectedLinks.length > 0 && (
        <div
          className="links-selection flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent/10 p-4"
          role="region"
          aria-label="Selected links"
        >
          <p className="text-sm">{selectedLinks.length} selected across pages and filters</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => exportLinks(selectedLinks)}>Export selected</Button>
            <Button onClick={() => setBulk(true)}>Bulk actions</Button>
            <Button onClick={() => setSelected([])}>Clear selection</Button>
          </div>
        </div>
      )}
      <Card className="links-table-card overflow-hidden">
        <Table label="Managed links" className="min-w-[970px]">
          <thead className="bg-sidebar/70">
            <tr>
              <th className="w-12 pl-5!">
                <input
                  type="checkbox"
                  aria-label="Select all visible links"
                  checked={allSelected}
                  ref={(element) => {
                    if (element)
                      element.indeterminate =
                        !allSelected && rows.some((link) => selected.includes(link.id));
                  }}
                  onChange={() =>
                    setSelected((ids) =>
                      allSelected
                        ? ids.filter((id) => !rows.some((link) => link.id === id))
                        : [...new Set([...ids, ...rows.map((link) => link.id)])]
                    )
                  }
                />
              </th>
              <th>Link details & destination</th>
              <th>Short URL</th>
              {showTags && (
                <th>
                  Campaign
                  <br />
                  tags
                </th>
              )}
              <th>QR</th>
              <th>
                Click
                <br />
                telemetry
              </th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((link) => (
              <tr key={link.id} className={link.status === 'archived' ? 'opacity-55' : ''}>
                <td className="pl-5!">
                  <input
                    type="checkbox"
                    aria-label={`Select ${link.title}`}
                    checked={selected.includes(link.id)}
                    onChange={() => toggle(link.id)}
                  />
                </td>
                <td className="w-[47%]">
                  <div className="flex items-start gap-3">
                    <LinkIcon link={link} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-display text-[19px] font-bold leading-snug">
                        {link.title}
                        {link.protected && <LockKeyhole size={13} className="text-accent-soft" />}
                      </p>
                      <a
                        title={link.destination}
                        href={link.destination}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 flex max-w-[360px] items-center gap-2 text-xs text-muted hover:text-accent-soft"
                      >
                        <span className="truncate">{link.destination}</span>
                        <ExternalLink size={12} />
                      </a>
                      <p className="mt-2 text-[11px] text-muted">
                        {link.status === 'expiring' || link.status === 'expired'
                          ? `Expires ${link.expiresAt ? new Date(link.expiresAt).toLocaleString() : 'soon'}`
                          : link.status === 'archived'
                            ? 'Archived · no active redirect'
                            : `Created ${relativeDate(link.createdAt)} by ${link.author}`}
                      </p>
                    </div>
                  </div>
                </td>
                <td>
                  <button
                    className="flex items-center gap-3 whitespace-nowrap rounded-lg bg-input px-3 py-3 text-xs font-semibold text-accent-soft hover:bg-elevated"
                    onClick={async () => {
                      await copy(shortUrl(link));
                    }}
                    aria-label={`Copy short URL for ${link.title}`}
                  >
                    {shortUrl(link)}
                    <Copy size={14} />
                  </button>
                </td>
                {showTags && (
                  <td>
                    <div className="flex max-w-[135px] flex-wrap gap-1.5">
                      {link.tags.map((tag) => (
                        <Badge
                          key={tag}
                          tone={tag === 'promo' || tag === 'video' ? 'danger' : 'accent'}
                        >
                          <button
                            title={`Filter by #${tag}`}
                            onClick={() => {
                              setTag(tag);
                              setPage(1);
                            }}
                          >
                            #{tag}
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </td>
                )}
                <td>
                  <button
                    aria-label={`Show QR for ${link.title}`}
                    className="icon-button"
                    onClick={() => setQr(link)}
                  >
                    <QrCode size={19} />
                  </button>
                </td>
                <td>
                  <p className="font-display text-[21px] font-bold">{number.format(link.clicks)}</p>
                  <div className="mt-2">
                    <StatusBadge status={link.status} />
                  </div>
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${link.title}`}
                    onClick={() => setEditing(link)}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    className="icon-button text-muted hover:text-danger"
                    aria-label={`Delete ${link.title}`}
                    onClick={() => setDeleting([link.id])}
                  >
                    <Trash2 size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        {!rows.length && (
          <div className="pb-6 text-center">
            <EmptyState />
            <Button
              onClick={() => {
                setParams({});
                setCategory('All');
                setStatus('all');
                setTag('');
                setSort('recent');
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border/30 bg-sidebar/50 px-5 py-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
            <p>
              Showing{' '}
              <strong className="text-foreground">
                {filtered.length ? (activePage - 1) * pageSize + 1 : 0} –{' '}
                {Math.min(activePage * pageSize, filtered.length)} of {filtered.length}
              </strong>{' '}
              links
            </p>
            <label className="flex items-center gap-2">
              Rows per page:
              <select
                className="select min-h-8!"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option>5</option>
                <option>10</option>
                <option>20</option>
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="icon-button bg-input"
              aria-label="Previous page"
              disabled={activePage === 1}
              onClick={() => setPage(activePage - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                aria-label={`Page ${i + 1}`}
                aria-current={activePage === i + 1 ? 'page' : undefined}
                onClick={() => setPage(i + 1)}
                className={clsx(
                  'size-9 rounded-xl text-xs font-medium',
                  activePage === i + 1 ? 'bg-accent text-[#161427]' : 'bg-input text-muted'
                )}
              >
                {i + 1}
              </button>
            ))}
            <button
              className="icon-button bg-input"
              aria-label="Next page"
              disabled={activePage === pages}
              onClick={() => setPage(activePage + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </footer>
      </Card>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit link">
        {editing && (
          <EditLinkForm key={editing.id} link={editing} onSaved={() => setEditing(null)} />
        )}
      </Dialog>
      <Dialog open={create} onClose={() => setCreate(false)} title="Create a new link">
        {create && (
          <ShortenForm
            onCreated={() => {
              setCreate(false);
              setPage(1);
              setSort('recent');
              setCategory('All');
              setStatus('all');
              setTag('');
              setParams({});
            }}
          />
        )}
      </Dialog>
      <Dialog open={qr !== null} onClose={() => setQr(null)} title="Link QR code">
        {qr && <QrPreview link={qr} />}
      </Dialog>
      <Dialog open={bulk} onClose={() => setBulk(false)} title="Bulk edit selected links">
        <p className="mb-5 text-sm text-muted">
          {selectedLinks.length} selected links. Archive keeps records and historical clicks. Delete
          permanently disables their redirects and reserves aliases. Each atomic action supports at
          most 100 links.
        </p>
        <Button
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError('');
            try {
              await archiveLinks(selectedLinks.map((link) => link.id));
              setSelected([]);
              setBulk(false);
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setPending(false);
            }
          }}
        >
          <Archive size={16} />
          Archive selected links
        </Button>
        <Button
          className="mt-3"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError('');
            try {
              await restoreLinks(selectedLinks.map((link) => link.id));
              setSelected([]);
              setBulk(false);
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setPending(false);
            }
          }}
        >
          Restore selected links
        </Button>
        <Button
          className="mt-3"
          disabled={pending}
          onClick={() => {
            setBulk(false);
            setDeleting(selectedLinks.map((link) => link.id));
          }}
        >
          <Trash2 size={16} />
          Delete selected links
        </Button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
      </Dialog>
      <Dialog open={deleting.length > 0} onClose={() => setDeleting([])} title="Delete links?">
        <p className="mb-4 text-sm text-muted">
          This removes {deleting.length === 1 ? 'this link' : `${deleting.length} links`} and its
          redirect from the workspace permanently. This cannot be undone. The aliases remain
          reserved.
        </p>
        <ul className="mb-5 max-h-48 overflow-auto space-y-2 text-sm">
          {links
            .filter((link) => deleting.includes(link.id))
            .map((link) => (
              <li key={link.id}>
                {link.title}
                <span className="block text-xs text-muted">{shortUrl(link)}</span>
              </li>
            ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button disabled={pending} onClick={() => setDeleting([])}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="bg-danger!"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError('');
              try {
                await deleteLinks(deleting);
                setSelected((ids) => ids.filter((id) => !deleting.includes(id)));
                setDeleting([]);
              } catch (error) {
                setError(errorMessage(error));
              } finally {
                setPending(false);
              }
            }}
          >
            Confirm deletion
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
      </Dialog>
      <p className="text-xs text-subtle">
        Filters and CSV operate on all loaded persisted links. QR scans, growth, latency, and
        smart-routing measurements are unavailable.
      </p>
    </div>
  );
}
