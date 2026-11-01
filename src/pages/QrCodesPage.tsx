import { useState } from 'react';
import { Palette, QrCode, Plus } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/auth-context';
import { shortUrl } from '../lib/utils';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeading } from '../components/ui/Card';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ShortenForm } from '../components/links/ShortenForm';
import { QrPreview } from '../components/links/QrPreview';

const colors = [
  { value: '#181521', name: 'Ink' },
  { value: '#5c35b6', name: 'Violet' },
  { value: '#973665', name: 'Rose' },
];
export default function QrCodesPage() {
  const { links } = useAuth();
  const [color, setColor] = useState('#181521');
  const [create, setCreate] = useState(false);
  return (
    <div className="page-stack animate-enter">
      <PageHeader
        title="QR Code Studio"
        description="Every persisted short link has a downloadable QR code."
        badge={<Badge>{links.length} links available</Badge>}
        actions={
          <Button variant="primary" onClick={() => setCreate(true)}>
            <Plus size={17} /> Create Link & QR
          </Button>
        }
      />
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex gap-3">
          <Palette size={20} className="text-accent-soft" />
          <div>
            <h2>Your brand, every scan</h2>
            <p className="section-description">
              Preview colors are browser-only; downloads use the server’s QR image.
            </p>
          </div>
        </div>
        <div className="flex gap-2" role="group" aria-label="QR code color">
          {colors.map((item) => (
            <button
              key={item.value}
              aria-pressed={color === item.value}
              onClick={() => setColor(item.value)}
              className={clsx(
                'rounded-xl border px-3 py-2 text-xs',
                color === item.value ? 'border-accent text-accent-soft' : 'border-border text-muted'
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
      </Card>
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {links.map((link) => (
          <Card className="p-6" key={link.id}>
            <CardHeading
              title={link.title}
              description={shortUrl(link)}
              action={<StatusBadge status={link.status} />}
            />
            <div className="rounded-xl bg-input/60 py-6">
              <QrPreview link={link} color={color} size={175} />
            </div>
            <p className="mt-5 flex items-center gap-2 text-xs text-muted">
              <QrCode size={14} /> QR scans cannot be distinguished from other redirects.
            </p>
          </Card>
        ))}
      </div>
      {!links.length && (
        <EmptyState title="No links yet" description="Create a link to generate its QR code." />
      )}
      <Dialog open={create} onClose={() => setCreate(false)} title="Create a link for your QR code">
        {create && <ShortenForm onCreated={() => setCreate(false)} />}
      </Dialog>
    </div>
  );
}
