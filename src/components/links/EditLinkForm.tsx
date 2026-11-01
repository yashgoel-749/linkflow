import { useState } from 'react';
import type { ShortLink } from '../../types/link';
import { useAuth } from '../../context/auth-context';
import { errorMessage } from '../../lib/api';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';

function localDatetime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function EditLinkForm({ link, onSaved }: { link: ShortLink; onSaved: () => void }) {
  const { editLink } = useAuth();
  const [title, setTitle] = useState(link.title);
  const [destination, setDestination] = useState(link.destination);
  const [slug, setSlug] = useState(link.slug);
  const [tags, setTags] = useState(link.tags.join(', '));
  const [category, setCategory] = useState(link.category);
  const [initialExpiry] = useState(() => localDatetime(link.expiresAt));
  const [expiry, setExpiry] = useState(initialExpiry);
  const [protectedLink, setProtected] = useState(link.protected);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending) return;
        setPending(true);
        setError('');
        try {
          await editLink(link.id, {
            title: title.trim(),
            destination: destination.trim(),
            slug: slug.trim(),
            tags: tags
              .split(',')
              .map((value) => value.trim().replace(/^#/, ''))
              .filter(Boolean),
            category: category.trim(),
            ...(expiry !== initialExpiry
              ? { expiresAt: expiry ? new Date(expiry).toISOString() : null }
              : {}),
            protected: protectedLink,
            ...(protectedLink && password ? { password } : {}),
          });
          onSaved();
        } catch (error) {
          setError(errorMessage(error));
        } finally {
          setPending(false);
        }
      }}
    >
      <Field
        label="Link title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
        maxLength={200}
      />
      <Field
        label="Destination URL"
        type="url"
        value={destination}
        onChange={(event) => setDestination(event.target.value)}
        required
      />
      <Field
        label="Alias"
        value={slug}
        onChange={(event) => setSlug(event.target.value)}
        required
        pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*"
        maxLength={80}
      />
      <p className="text-xs text-muted">
        Changing an alias permanently reserves the previous alias; old QR codes and URLs may stop
        working.
      </p>
      <Field label="Campaign tags" value={tags} onChange={(event) => setTags(event.target.value)} />
      <Field
        label="Category"
        value={category}
        onChange={(event) => setCategory(event.target.value)}
        required
        maxLength={80}
      />
      <Field
        label="Expiration (your local timezone; clear for no expiry)"
        type="datetime-local"
        value={expiry}
        onChange={(event) => setExpiry(event.target.value)}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={protectedLink}
          onChange={(event) => setProtected(event.target.checked)}
        />{' '}
        Password Protection
      </label>
      {protectedLink && (
        <Field
          label={
            link.protected
              ? 'New protection password (leave blank to keep current)'
              : 'Protection password'
          }
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required={!link.protected}
          minLength={8}
          maxLength={128}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button disabled={pending} type="submit" variant="primary" className="w-full">
        {pending ? 'Saving…' : 'Save link'}
      </Button>
    </form>
  );
}
