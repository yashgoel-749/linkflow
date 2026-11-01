import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { z } from 'zod';
import {
  api,
  ApiError,
  domainSchema,
  errorMessage,
  linkSchema,
  linksPageSchema,
  userSchema,
  sessionExpiredEvent,
} from '../lib/api';
import { AuthContext } from './auth-context';
import type { AuthState, Inventory, Session } from './auth-context';
import type { CreateResult, Domain, LinkDraft, ShortLink } from '../types/link';

async function fetchInventory(signal?: AbortSignal, isCurrentSession?: () => boolean) {
  const [first, domains] = await Promise.all([
    api('/links?page=1&pageSize=100', linksPageSchema, { signal, isCurrentSession }),
    api('/domains', z.array(domainSchema), { signal, isCurrentSession }),
  ]);
  const links = [...first.items];
  for (let page = 2; page <= first.totalPages; page++) {
    const next = await api(`/links?page=${page}&pageSize=100`, linksPageSchema, {
      signal,
      isCurrentSession,
    });
    links.push(...next.items);
  }
  return { links, domains };
}

function sessionError(error: unknown): Session {
  return error instanceof ApiError && error.status === 401
    ? { kind: 'anonymous' }
    : { kind: 'error', message: errorMessage(error) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ kind: 'loading' });
  const [inventory, setInventory] = useState<Inventory>({ kind: 'loading' });
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [message, notify] = useState('');
  const generation = useRef(0);
  const sessionEpoch = useRef(0);
  function assertSessionEpoch(epoch: number) {
    if (epoch !== sessionEpoch.current) {
      throw new Error(
        'Your session changed while this request was in progress. Reload before trying again.'
      );
    }
  }
  useEffect(() => {
    const expired = () => {
      sessionEpoch.current++;
      generation.current++;
      setLinks([]);
      setDomains([]);
      setInventory({ kind: 'loading' });
      setSession({ kind: 'anonymous' });
      notify('Your session expired. Please sign in again.');
    };
    window.addEventListener(sessionExpiredEvent, expired);
    return () => window.removeEventListener(sessionExpiredEvent, expired);
  }, []);
  const loadInventory = useCallback(
    async (options?: { background?: boolean; signal?: AbortSignal }) => {
      const current = ++generation.current;
      const epoch = sessionEpoch.current;
      try {
        const result = await fetchInventory(options?.signal, () => epoch === sessionEpoch.current);
        if (
          epoch !== sessionEpoch.current ||
          current !== generation.current ||
          options?.signal?.aborted
        )
          return;
        setLinks(result.links);
        setDomains(result.domains);
        setInventory({ kind: 'ready' });
      } catch (error) {
        if (
          epoch !== sessionEpoch.current ||
          current !== generation.current ||
          options?.signal?.aborted
        )
          return;
        if (error instanceof ApiError && error.status === 401) {
          sessionEpoch.current++;
          generation.current++;
          setSession({ kind: 'anonymous' });
          setLinks([]);
          setDomains([]);
        } else {
          if (!options?.background) setInventory({ kind: 'error', message: errorMessage(error) });
          else throw error;
        }
      }
    },
    []
  );
  const refresh = useCallback(
    async (options?: { background?: boolean }) => {
      if (!options?.background) setInventory({ kind: 'loading' });
      await loadInventory(options);
    },
    [loadInventory]
  );
  const loadSession = useCallback(async (signal?: AbortSignal) => {
    const epoch = sessionEpoch.current;
    try {
      const user = await api('/auth/me', userSchema, { signal });
      if (!signal?.aborted && epoch === sessionEpoch.current) {
        sessionEpoch.current++;
        generation.current++;
        setSession({ kind: 'authenticated', user });
      }
    } catch (error) {
      if (signal?.aborted || epoch !== sessionEpoch.current) return;
      if (error instanceof ApiError && error.status === 401) {
        sessionEpoch.current++;
        generation.current++;
      }
      setSession(sessionError(error));
    }
  }, []);
  const retrySession = useCallback(async () => {
    setSession({ kind: 'loading' });
    await loadSession();
  }, [loadSession]);
  useEffect(() => {
    const controller = new AbortController();
    const epoch = sessionEpoch.current;
    api('/auth/me', userSchema, { signal: controller.signal })
      .then((user) => {
        if (!controller.signal.aborted && epoch === sessionEpoch.current) {
          sessionEpoch.current++;
          generation.current++;
          setSession({ kind: 'authenticated', user });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || epoch !== sessionEpoch.current) return;
        if (error instanceof ApiError && error.status === 401) {
          sessionEpoch.current++;
          generation.current++;
        }
        setSession(sessionError(error));
      });
    return () => controller.abort();
  }, []);
  const userId = session.kind === 'authenticated' ? session.user.id : null;
  useEffect(() => {
    const controller = new AbortController();
    if (userId) {
      const current = ++generation.current;
      const epoch = sessionEpoch.current;
      fetchInventory(controller.signal, () => epoch === sessionEpoch.current)
        .then((result) => {
          if (controller.signal.aborted || current !== generation.current) return;
          setLinks(result.links);
          setDomains(result.domains);
          setInventory({ kind: 'ready' });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || current !== generation.current) return;
          if (error instanceof ApiError && error.status === 401) setSession({ kind: 'anonymous' });
          else setInventory({ kind: 'error', message: errorMessage(error) });
        });
    }
    return () => controller.abort();
  }, [userId]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => notify(''), 4500);
    return () => window.clearTimeout(timer);
  }, [message]);
  async function createLink(draft: LinkDraft): Promise<CreateResult> {
    const epoch = sessionEpoch.current;
    try {
      const link = await api('/links', linkSchema, {
        method: 'POST',
        body: JSON.stringify(draft),
        isCurrentSession: () => epoch === sessionEpoch.current,
      });
      assertSessionEpoch(epoch);
      setLinks((items) => [link, ...items]);
      return { ok: true, link };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }
  async function bulk(ids: string[], action: 'archive' | 'restore' | 'delete') {
    const epoch = sessionEpoch.current;
    if (ids.length > 100) throw new Error('Select at most 100 links for one atomic bulk action.');
    await api('/links/bulk', z.object({ affected: z.number() }), {
      method: 'POST',
      body: JSON.stringify({ ids, action }),
      isCurrentSession: () => epoch === sessionEpoch.current,
    });
    assertSessionEpoch(epoch);
    try {
      await refresh({ background: true });
    } catch (error) {
      assertSessionEpoch(epoch);
      throw new Error(
        `The action was saved, but the inventory could not refresh. Reload before repeating it. ${errorMessage(error)}`,
        { cause: error }
      );
    }
    assertSessionEpoch(epoch);
    notify(
      `Links ${action === 'delete' ? 'deleted' : action === 'restore' ? 'restored' : 'archived'}.`
    );
  }
  const value: AuthState = {
    session,
    inventory,
    links,
    domains,
    profile: session.kind === 'authenticated' ? session.user : { id: '', name: '', email: '' },
    retrySession,
    refresh,
    createLink,
    notify,
    async authenticate(mode, input) {
      const epoch = sessionEpoch.current;
      const body =
        mode === 'signup'
          ? input
          : { email: input.email, password: input.password, remember: input.remember };
      const user = await api(mode === 'signup' ? '/auth/register' : '/auth/login', userSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      assertSessionEpoch(epoch);
      sessionEpoch.current++;
      generation.current++;
      setLinks([]);
      setDomains([]);
      setInventory({ kind: 'loading' });
      setSession({ kind: 'authenticated', user });
    },
    async logout() {
      const epoch = sessionEpoch.current;
      await api('/auth/logout', z.undefined(), {
        method: 'POST',
        isCurrentSession: () => epoch === sessionEpoch.current,
      });
      assertSessionEpoch(epoch);
      sessionEpoch.current++;
      generation.current++;
      setLinks([]);
      setDomains([]);
      setSession({ kind: 'anonymous' });
    },
    async editLink(id, update) {
      const epoch = sessionEpoch.current;
      const link = await api(`/links/${encodeURIComponent(id)}`, linkSchema, {
        method: 'PATCH',
        body: JSON.stringify(update),
        isCurrentSession: () => epoch === sessionEpoch.current,
      });
      assertSessionEpoch(epoch);
      setLinks((items) => items.map((item) => (item.id === id ? link : item)));
      notify('Link updated.');
    },
    archiveLinks: (ids) => bulk(ids, 'archive'),
    restoreLinks: (ids) => bulk(ids, 'restore'),
    deleteLinks: (ids) => bulk(ids, 'delete'),
    async addDomain(hostname) {
      const epoch = sessionEpoch.current;
      const domain = await api('/domains', domainSchema, {
        method: 'POST',
        body: JSON.stringify({ hostname }),
        isCurrentSession: () => epoch === sessionEpoch.current,
      });
      assertSessionEpoch(epoch);
      setDomains((items) => [...items, domain]);
      return domain;
    },
    async verifyDomain(hostname) {
      const epoch = sessionEpoch.current;
      const domain = await api('/domains/verify', domainSchema, {
        method: 'POST',
        body: JSON.stringify({ hostname }),
        isCurrentSession: () => epoch === sessionEpoch.current,
      });
      assertSessionEpoch(epoch);
      setDomains((items) => items.map((item) => (item.hostname === hostname ? domain : item)));
      notify('DNS ownership verified.');
    },
    async saveProfile(profile) {
      const epoch = sessionEpoch.current;
      const user = await api('/auth/me', userSchema, {
        method: 'PATCH',
        body: JSON.stringify(profile),
        isCurrentSession: () => epoch === sessionEpoch.current,
      });
      assertSessionEpoch(epoch);
      setSession({ kind: 'authenticated', user });
      notify('Profile saved.');
    },
    async copy(text) {
      try {
        await navigator.clipboard.writeText(text);
        notify('Copied to clipboard.');
      } catch {
        notify(`Clipboard unavailable. Copy manually: ${text}`);
      }
    },
  };
  return (
    <AuthContext value={value}>
      {children}
      <div aria-live="polite" className="fixed bottom-6 right-4 z-[70] max-w-lg">
        {message && (
          <div className="card flex gap-3 p-4 shadow-2xl">
            <p className="break-words text-sm">{message}</p>
            <button aria-label="Dismiss notification" onClick={() => notify('')}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </AuthContext>
  );
}
