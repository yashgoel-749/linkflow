import { useState } from 'react';
import { Clock3, Globe2, Link2, LockKeyhole, SlidersHorizontal, Sparkles, Tag } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { shortUrl } from '../../lib/utils';
import { errorMessage } from '../../lib/api';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

export function ShortenForm({
  compact = false,
  onCreated,
}: {
  compact?: boolean;
  onCreated?: () => void;
}) {
  const { domains, createLink, copy, notify } = useAuth();
  const [destination, setDestination] = useState('');
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState(
    () => domains.find((item) => item.status === 'verified')?.hostname ?? ''
  );
  const [tag, setTag] = useState('');
  const [protectedLink, setProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [expiration, setExpiration] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [utm, setUtm] = useState(false);
  const [campaign, setCampaign] = useState('');
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState('');

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    let url = destination;
    if (utm) {
      if (!campaign.trim()) {
        setError('Enter a UTM campaign name.');
        return;
      }
      try {
        const parsed = new URL(destination);
        parsed.searchParams.set('utm_campaign', campaign.trim());
        parsed.searchParams.set('utm_source', 'linkflow');
        url = parsed.href;
      } catch {
        setError('Enter a valid URL, including https://.');
        return;
      }
    }
    if (protectedLink && !password) {
      setError('Enter a protection password.');
      return;
    }
    let resolvedTitle = title.trim();
    if (!resolvedTitle) {
      try {
        resolvedTitle = new URL(url).hostname;
      } catch {
        setError('Enter a valid destination URL.');
        return;
      }
    }
    let expiry: string | null = null;
    if (expiration) {
      const date = new Date(expiresAt);
      if (!Number.isFinite(date.getTime())) {
        setError('Choose a valid expiration date.');
        return;
      }
      expiry = date.toISOString();
    }
    setPending(true);
    setError('');
    try {
      const result = await createLink({
        title: resolvedTitle,
        destination: url,
        slug,
        domain,
        tags: tag
          .split(',')
          .map((value) => value.trim().replace(/^#/, ''))
          .filter(Boolean),
        protected: protectedLink,
        expiresAt: expiry,
        ...(protectedLink ? { password } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const createdUrl = shortUrl(result.link);
      setResultUrl(createdUrl);
      setDestination('');
      setSlug('');
      setTitle('');
      setPassword('');
      if (compact) await copy(createdUrl);
      else notify('Link created.');
      onCreated?.();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className={compact ? 'quick-shorten-form space-y-4' : 'space-y-4'}>
      {!compact && (
        <Field
          label="Link title"
          placeholder="e.g. Summer product launch"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
        />
      )}
      <Field
        label={compact ? undefined : 'Destination URL'}
        aria-label="Destination URL"
        icon={<Link2 size={18} />}
        type="url"
        placeholder="Paste a long URL here (e.g. https://yourproduct.com/launch)…"
        value={destination}
        onChange={(event) => setDestination(event.target.value)}
        required
      />
      <div
        className={
          compact
            ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1.65fr_1fr_auto]'
            : 'grid grid-cols-1 gap-3 sm:grid-cols-2'
        }
      >
        <div>
          <label
            className={compact ? 'sr-only' : 'mb-2 block text-[13px] font-medium'}
            htmlFor={compact ? 'quick-slug' : 'dialog-slug'}
          >
            Short URL
          </label>
          <div className="field overflow-hidden px-0! pl-3!">
            <Globe2 size={16} />
            <select
              aria-label="Short link domain"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              className="max-w-[145px] shrink-0 bg-transparent py-2 text-xs outline-none"
            >
              {domains
                .filter((item) => item.status === 'verified')
                .map((item) => (
                  <option key={item.hostname}>{item.hostname}</option>
                ))}
            </select>
            <span className="text-subtle">/</span>
            <input
              id={compact ? 'quick-slug' : 'dialog-slug'}
              placeholder="your-custom-alias"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*"
              maxLength={80}
              className="pr-3 text-xs!"
            />
          </div>
        </div>
        <Field
          label={compact ? undefined : 'Campaign tags'}
          aria-label="Campaign tags"
          icon={<Tag size={17} />}
          placeholder="Campaign tag (e.g. social)"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          maxLength={120}
        />
        {compact && (
          <Button
            disabled={pending || !domain}
            variant="primary"
            type="submit"
            className="min-h-11 sm:col-span-2 xl:col-span-1"
          >
            <Sparkles size={16} />
            Shorten URL & Copy
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-3 pt-1 text-xs text-muted">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={protectedLink}
            onChange={(event) => setProtected(event.target.checked)}
          />
          <LockKeyhole size={13} />
          Password Protection
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={expiration}
            onChange={(event) => setExpiration(event.target.checked)}
          />
          <Clock3 size={13} />
          Expiration Date
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={utm} onChange={(event) => setUtm(event.target.checked)} />
          <SlidersHorizontal size={13} />
          UTM Campaign Builder
        </label>
      </div>
      {protectedLink && (
        <Field
          label="Protection password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
        />
      )}
      {(expiration || utm) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {expiration && (
            <Field
              label="Expiration (your local timezone)"
              type="datetime-local"
              required
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          )}
          {utm && (
            <Field
              label="UTM campaign"
              placeholder="summer-launch"
              required
              value={campaign}
              onChange={(event) => setCampaign(event.target.value)}
            />
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {resultUrl && compact && (
        <p
          role="status"
          className="break-all rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent-soft"
        >
          Created: {resultUrl}
        </p>
      )}
      {!compact && (
        <>
          <Button disabled={pending || !domain} variant="primary" type="submit" className="w-full">
            <Sparkles size={16} />
            {pending ? 'Creating…' : 'Create short link'}
          </Button>
        </>
      )}
    </form>
  );
}
