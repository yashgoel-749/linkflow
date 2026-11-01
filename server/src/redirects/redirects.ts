import { Router, type Request, type RequestHandler } from 'express';
import helmet from 'helmet';
import { Prisma } from '@prisma/client';
import { UAParser } from 'ua-parser-js';
import { z } from 'zod';
import { db } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { cacheGet, cacheSet, checkPassword, privateHash, rateLimit } from '../security.js';
import { routingKey } from '../links/links.js';
import { idSchema, passwordSchema, slugSchema } from '../schemas.js';

export function clickMetadata(req: Request) {
  const ua = (req.get('user-agent') ?? '').slice(0, 512);
  const parsed = new UAParser(ua).getResult();
  const device =
    parsed.device.type === 'mobile'
      ? 'Mobile'
      : parsed.device.type === 'tablet'
        ? 'Tablet'
        : parsed.device.type === 'console'
          ? 'Console'
          : parsed.device.type === 'smarttv'
            ? 'TV'
            : parsed.device.type === 'wearable'
              ? 'Wearable'
              : parsed.device.type === 'embedded'
                ? 'Embedded'
                : 'Desktop';
  let referrer: string | null = null;
  try {
    const url = new URL((req.get('referer') ?? '').slice(0, 4096));
    if (['http:', 'https:'].includes(url.protocol)) referrer = url.hostname.toLowerCase();
  } catch {
    /* Missing/malformed referrer is direct traffic. */
  }
  const channel = !referrer
    ? 'Direct'
    : /(^|\.)(google\.[a-z.]+|bing.com|duckduckgo.com|yahoo.com|baidu.com|yandex\.[a-z.]+)$/.test(
          referrer
        )
      ? 'Search'
      : /(^|\.)(facebook.com|instagram.com|twitter.com|x.com|t.co|linkedin.com|reddit.com|pinterest.com|youtube.com|tiktok.com)$/.test(
            referrer
          )
        ? 'Social'
        : 'Referral';
  return {
    visitorHash: privateHash(`${req.ip ?? 'unknown'}\n${ua}`),
    channel,
    referrer,
    device,
    system: parsed.os.name ?? 'Unknown',
  };
}
function host(req: Request) {
  const value = req.get('host')?.toLowerCase();
  if (!value || value.includes('/') || value.includes('@') || value.includes(','))
    throw new HttpError(404, 'NOT_FOUND', 'Redirect host not configured');
  return value;
}
async function resolveHost(req: Request, custom: boolean) {
  const hostname = host(req);
  if (!custom) {
    if (hostname !== config.defaultDomain)
      throw new HttpError(404, 'NOT_FOUND', 'Redirect host not configured');
  } else {
    if (
      hostname === config.defaultDomain ||
      !(await db.domain.findUnique({ where: { hostname, verifiedAt: { not: null } } }))
    )
      throw new HttpError(404, 'NOT_FOUND', 'Redirect host not configured');
  }
  return hostname;
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  );
}
function challenge(title: string, path: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Protected link</title></head><body><main><h1>Protected link</h1><p>${escapeHtml(title)}</p><form method="post" action="${escapeHtml(path)}"><label>Password <input name="password" type="password" required minlength="8" maxlength="128" autocomplete="current-password"></label><button type="submit">Continue</button></form></main></body></html>`;
}
function lifecycle(link: {
  deletedAt: Date | null;
  archivedAt: Date | null;
  expiresAt: Date | null;
}) {
  if (link.deletedAt) throw new HttpError(404, 'NOT_FOUND', 'Link not found');
  if (link.archivedAt || (link.expiresAt && link.expiresAt.getTime() <= Date.now()))
    throw new HttpError(410, 'LINK_UNAVAILABLE', 'Link is archived or expired');
}
function redirectHandler(custom: boolean): RequestHandler {
  return async (req, res) => {
    const domain = await resolveHost(req, custom);
    const slug = slugSchema.parse(req.params.slug);
    // Slug creation normalizes case; public aliases have a canonical lowercase path.
    if (req.params.slug !== slug) throw new HttpError(404, 'NOT_FOUND', 'Link not found');
    const key = routingKey({ domain, slug });
    const cachedId = idSchema.safeParse(await cacheGet(key));
    const preflight =
      (await db.link.findFirst({
        where: { domain, slug, ...(cachedId.success ? { id: cachedId.data } : {}) },
      })) ??
      (cachedId.success
        ? await db.link.findUnique({ where: { domain_slug: { domain, slug } } })
        : null);
    if (!preflight) throw new HttpError(404, 'NOT_FOUND', 'Link not found');
    lifecycle(preflight);
    await cacheSet(key, preflight.id);
    if (req.method === 'POST') {
      const origin = req.get('origin');
      // API origins plus this exact redirect origin; form posts without Origin are rejected.
      const ownOrigin = domain === config.defaultDomain ? config.publicOrigin : `https://${domain}`;
      if (!origin || (!config.origins.includes(origin) && origin !== ownOrigin))
        throw new HttpError(403, 'ORIGIN_FORBIDDEN', 'An exact allowed Origin is required');
    }
    if (preflight.passwordHash && req.method !== 'POST') {
      res
        .status(401)
        .type('html')
        .send(challenge(preflight.title, custom ? `/${slug}` : `/r/${slug}`));
      return;
    }
    if (req.method === 'POST') {
      const input = z.object({ password: passwordSchema }).strict().parse(req.body);
      if (!preflight.passwordHash || !(await checkPassword(input.password, preflight.passwordHash)))
        throw new HttpError(403, 'INVALID_PASSWORD', 'Incorrect link password');
    }
    let destination: string;
    try {
      destination = await db.$transaction(async (tx) => {
        // A redirect cannot race a delete/archive/password edit: both lock the same row.
        await tx.$queryRaw`SELECT "id" FROM "Link" WHERE "id" = ${preflight.id}::uuid FOR UPDATE`;
        const current = await tx.link.findUnique({ where: { id: preflight.id } });
        if (!current || current.domain !== domain || current.slug !== slug)
          throw new HttpError(404, 'NOT_FOUND', 'Link not found');
        lifecycle(current);
        if (current.passwordHash !== preflight.passwordHash)
          throw new HttpError(409, 'LINK_CHANGED', 'Link changed; retry the request');
        if (req.method !== 'HEAD')
          await tx.click.create({ data: { linkId: current.id, ...clickMetadata(req) } });
        return current.destination;
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError ||
        error instanceof Prisma.PrismaClientInitializationError ||
        error instanceof Prisma.PrismaClientUnknownRequestError
      )
        throw new HttpError(
          503,
          'CLICK_RECORDING_FAILED',
          'Redirect temporarily unavailable; try again later'
        );
      throw error;
    }
    res.redirect(302, destination);
  };
}
export const redirectsRouter = Router();
// A successful password form redirects externally; form-action 'self' blocks that in Chromium.
// Do not name the destination in the challenge policy; keep exact Origin checks on POST.
redirectsRouter.use(
  helmet.contentSecurityPolicy({ directives: { formAction: ["'self'", 'http:', 'https:'] } })
);
redirectsRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  // Keep same-origin form Origin usable; suppress referrers to external destinations.
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
redirectsRouter.get('/r/:slug', rateLimit('redirect', 600, 60000), redirectHandler(false));
redirectsRouter.post('/r/:slug', rateLimit('password', 20, 15 * 60000), redirectHandler(false));
redirectsRouter.get('/:slug', rateLimit('redirect', 600, 60000), redirectHandler(true));
redirectsRouter.post('/:slug', rateLimit('password', 20, 15 * 60000), redirectHandler(true));
