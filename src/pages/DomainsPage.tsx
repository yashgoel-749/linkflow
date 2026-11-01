import { useState } from 'react';
import { ChevronDown, Copy, Globe2, Plus, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { errorMessage } from '../lib/api';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeading } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Field } from '../components/ui/Field';
import { Dialog } from '../components/ui/Dialog';
import { Table } from '../components/ui/Table';
import { StatCard } from '../components/charts/StatCard';

export default function DomainsPage() {
  const { domains, addDomain, verifyDomain, copy } = useAuth();
  const [create, setCreate] = useState(false);
  const [hostname, setHostname] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="page-stack animate-enter">
      <PageHeader
        title="Custom Domains"
        description="Connect domains you own using real DNS TXT verification."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setError('');
              setCreate(true);
            }}
          >
            <Plus size={17} /> Add Custom Domain
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          compact
          label="Connected domains"
          value={String(domains.length)}
          detail="Includes the default redirect host"
          icon={<Globe2 size={21} />}
        />
        <StatCard
          compact
          label="Verified domains"
          value={String(domains.filter((domain) => domain.status === 'verified').length)}
          detail="Ownership verified"
          icon={<ShieldCheck size={21} />}
        />
      </div>
      {error && !create && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Card className="overflow-hidden">
        <div className="p-6">
          <CardHeading
            title="Your Domain Network"
            description="Manage ownership verification"
            action={<Badge>{domains.length} domains</Badge>}
          />
        </div>
        <div className="divide-y divide-border/60">
          {domains.map((domain) => (
            <div key={domain.hostname} className="px-5 py-5 sm:px-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-elevated p-3 text-accent-soft">
                    <Globe2 size={22} />
                  </span>
                  <div>
                    <p className="font-display text-[21px] font-bold">{domain.hostname}</p>
                    <p className="mt-1 text-xs text-muted">Added {domain.added}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge dot tone={domain.status === 'verified' ? 'success' : 'danger'}>
                    {domain.status === 'verified' ? 'Verified' : 'Pending DNS'}
                  </Badge>
                  {domain.status === 'pending' && (
                    <Button
                      disabled={pending !== null}
                      onClick={async () => {
                        setPending(domain.hostname);
                        setError('');
                        try {
                          await verifyDomain(domain.hostname);
                        } catch (error) {
                          setError(errorMessage(error));
                        } finally {
                          setPending(null);
                        }
                      }}
                    >
                      {pending === domain.hostname ? 'Checking DNS…' : 'Verify DNS'}
                    </Button>
                  )}
                  <button
                    className="btn btn-ghost min-h-8! px-2! text-xs!"
                    onClick={() =>
                      setExpanded(expanded === domain.hostname ? null : domain.hostname)
                    }
                    aria-expanded={expanded === domain.hostname}
                  >
                    View DNS <ChevronDown size={14} />
                  </button>
                </div>
              </div>
              {expanded === domain.hostname && (
                <div className="mt-5 rounded-xl border border-border bg-input p-4">
                  {domain.proof ? (
                    <>
                      <p className="mb-3 text-xs text-muted">
                        Add this TXT record at your DNS provider, then verify ownership. DNS
                        propagation can take time.
                      </p>
                      <Table
                        label={`DNS configuration for ${domain.hostname}`}
                        className="min-w-[500px]"
                      >
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Name</th>
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>{domain.proof.type}</td>
                            <td>{domain.proof.name}</td>
                            <td>
                              <button
                                className="flex items-center gap-2 break-all text-accent-soft"
                                onClick={async () => {
                                  if (domain.proof) await copy(domain.proof.value);
                                }}
                              >
                                {domain.proof.value} <Copy size={13} />
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </Table>
                    </>
                  ) : (
                    <p className="text-xs text-muted">
                      No DNS proof is required or available for this host.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <CardHeading
          title="Hosting and certificates"
          description="DNS verification proves ownership only."
        />
        <p className="text-sm leading-relaxed text-muted">
          This application does not provision TLS certificates, configure public DNS routing, or
          provide global edge hosting. Custom hosts need separate DNS and web-server setup pointing
          at the redirect service.
        </p>
      </Card>
      <Dialog open={create} onClose={() => setCreate(false)} title="Connect a custom domain">
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            setPending('add');
            try {
              const domain = await addDomain(hostname.trim());
              setExpanded(domain.hostname);
              setHostname('');
              setCreate(false);
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setPending(null);
            }
          }}
        >
          <Field
            label="Domain hostname"
            icon={<Globe2 size={17} />}
            placeholder="links.yourbrand.com"
            value={hostname}
            onChange={(event) => setHostname(event.target.value)}
            required
          />
          <p className="text-xs text-muted">
            Enter a hostname you own, without a scheme or path. The server returns the ownership TXT
            record.
          </p>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <Button disabled={pending !== null} variant="primary" type="submit" className="w-full">
            <Plus size={16} /> {pending === 'add' ? 'Adding…' : 'Add domain'}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
