import { z } from 'zod';

export const userSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });
export const linkSchema = z.object({
  id: z.string(),
  title: z.string(),
  destination: z.string().url(),
  slug: z.string(),
  domain: z.string(),
  shortUrl: z.string().url(),
  tags: z.array(z.string()),
  category: z.string(),
  status: z.enum(['active', 'expiring', 'expired', 'archived']),
  clicks: z.number().nonnegative(),
  growth: z.number(),
  createdAt: z.number(),
  author: z.string(),
  protected: z.boolean(),
  expiresAt: z.string().nullable(),
});
export const domainSchema = z.object({
  hostname: z.string(),
  status: z.enum(['verified', 'pending']),
  added: z.string(),
  proof: z.object({ type: z.literal('TXT'), name: z.string(), value: z.string() }).optional(),
});
export const linksPageSchema = z.object({
  items: z.array(linkSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});
const breakdown = z.object({
  name: z.string(),
  share: z.number(),
  count: z.number(),
  color: z.string(),
});
export const reportSchema = z.object({
  timeline: z.array(
    z.object({
      date: z.string(),
      clicks: z.number(),
      visitors: z.number(),
      conversions: z.number(),
    })
  ),
  total: z.number(),
  visitors: z.number(),
  conversions: z.number(),
  channels: z.array(breakdown.extend({ detail: z.string() })),
  referrers: z.array(breakdown.extend({ detail: z.string() })),
  geography: z.array(breakdown.extend({ code: z.string() })),
  devices: z.array(breakdown),
  systems: z.array(z.object({ name: z.string(), share: z.number(), count: z.number() })),
  leaders: z.array(z.object({ link: linkSchema, clicks: z.number(), conversions: z.number() })),
  sourceName: z.string(),
  peakHour: z.string().nullable(),
  from: z.string(),
  to: z.string(),
  csv: z.object({ name: z.string(), content: z.string(), type: z.string() }),
});
export type User = z.infer<typeof userSchema>;
export type AnalyticsReport = z.infer<typeof reportSchema>;
export const apiBase = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export const sessionExpiredEvent = 'linkflow:session-expired';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request failed. Please try again.';
}
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit & { isCurrentSession?: () => boolean } = {}
): Promise<T> {
  const { isCurrentSession, ...requestOptions } = options;
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...requestOptions,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the server. Check your connection and retry.', 0, 'NETWORK');
  }
  const bootstrap = path === '/auth/me' && (options.method || 'GET').toUpperCase() === 'GET';
  if (
    response.status === 401 &&
    !bootstrap &&
    !['/auth/login', '/auth/register'].includes(path) &&
    (!isCurrentSession || isCurrentSession())
  ) {
    window.dispatchEvent(new Event(sessionExpiredEvent));
  }
  if (response.status === 204) return schema.parse(undefined);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      'The server returned an invalid response. Please retry.',
      response.status,
      'INVALID_RESPONSE'
    );
  }
  if (!response.ok) {
    const parsed = errorSchema.safeParse(payload);
    throw new ApiError(
      parsed.success ? parsed.data.error.message : `Request failed (${response.status}).`,
      response.status,
      parsed.success ? parsed.data.error.code : 'HTTP_ERROR'
    );
  }
  const parsed = z.object({ data: schema }).safeParse(payload);
  if (!parsed.success)
    throw new ApiError(
      'The server response does not match the API contract.',
      response.status,
      'INVALID_RESPONSE'
    );
  return parsed.data.data;
}
export async function downloadQr(id: string, slug: string, format: 'svg' | 'png') {
  const response = await fetch(`${apiBase}/links/${encodeURIComponent(id)}/qr?format=${format}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event(sessionExpiredEvent));
    const payload: unknown = await response.json().catch(() => null);
    const parsed = errorSchema.safeParse(payload);
    throw new Error(
      parsed.success ? parsed.data.error.message : `QR download failed (${response.status}).`
    );
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `linkflow-${slug}.${format}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
