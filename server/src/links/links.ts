import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { Prisma, type Link } from '@prisma/client';
import QRCode from 'qrcode';
import { z } from 'zod';
import { db } from '../db.js';
import { config } from '../config.js';
import { authOf, authenticate } from '../auth/auth.js';
import { assertDomain } from '../domains/domains.js';
import { HttpError } from '../errors.js';
import { cacheDelete, hashPassword } from '../security.js';
import { draftSchema, patchSchema, listSchema, idSchema } from '../schemas.js';
import { csv } from '../csv.js';

export const expiringWindow = 7 * 86400000;
export function linkStatus(link: Link, now = new Date()) {
  if (link.deletedAt || link.archivedAt) return 'archived';
  if (link.expiresAt && link.expiresAt <= now) return 'expired';
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime() + expiringWindow)
    return 'expiring';
  return 'active';
}
export function shortUrl(link: Pick<Link, 'domain' | 'slug'>) {
  return link.domain === config.defaultDomain
    ? `${config.publicOrigin}/r/${link.slug}`
    : `https://${link.domain}/${link.slug}`;
}
export function linkView(link: Link, author: string, clicks = 0) {
  return {
    id: link.id,
    title: link.title,
    destination: link.destination,
    slug: link.slug,
    domain: link.domain,
    shortUrl: shortUrl(link),
    tags: link.tags,
    category: link.category,
    status: linkStatus(link),
    clicks,
    growth: 0,
    createdAt: link.createdAt.getTime(),
    author,
    protected: link.passwordHash !== null,
    expiresAt: link.expiresAt?.toISOString() ?? null,
  };
}
export function routingKey(link: Pick<Link, 'domain' | 'slug'>) {
  return `${config.REDIS_NAMESPACE}:route:${link.domain}:${link.slug}`;
}
export function listWhere(
  userId: string,
  input: z.infer<typeof listSchema>,
  now = new Date()
): Prisma.LinkWhereInput {
  const lifecycle: Prisma.LinkWhereInput = {};
  const soon = new Date(now.getTime() + expiringWindow);
  switch (input.status) {
    case 'active':
      lifecycle.archivedAt = null;
      lifecycle.OR = [{ expiresAt: null }, { expiresAt: { gt: soon } }];
      break;
    case 'expiring':
      lifecycle.archivedAt = null;
      lifecycle.expiresAt = { gt: now, lte: soon };
      break;
    case 'expired':
      lifecycle.archivedAt = null;
      lifecycle.expiresAt = { lte: now };
      break;
    case 'archived':
      lifecycle.archivedAt = { not: null };
      break;
    case 'all':
      break;
  }
  return {
    userId,
    deletedAt: null,
    AND: [
      lifecycle,
      ...(input.q
        ? [
            {
              OR: [
                { title: { contains: input.q, mode: 'insensitive' } },
                { slug: { contains: input.q, mode: 'insensitive' } },
                { destination: { contains: input.q, mode: 'insensitive' } },
              ],
            } satisfies Prisma.LinkWhereInput,
          ]
        : []),
    ],
    ...(input.category && input.category !== 'all' ? { category: input.category } : {}),
    ...(input.tag && input.tag !== 'all' ? { tags: { has: input.tag } } : {}),
  };
}
function listOrder(
  sort: z.infer<typeof listSchema>['sort']
): Prisma.LinkOrderByWithRelationInput[] {
  switch (sort) {
    case 'oldest':
      return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'clicks':
      return [{ events: { _count: 'desc' } }, { id: 'asc' }];
    case 'title':
      return [{ title: 'asc' }, { id: 'asc' }];
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'asc' }];
  }
}
export const linksRouter = Router();
linksRouter.use(authenticate);
linksRouter.get('/', async (req, res) => {
  const input = listSchema.parse(req.query);
  const user = authOf(req).user;
  const where = listWhere(user.id, input);
  const [total, links] = await db.$transaction(
    [
      db.link.count({ where }),
      db.link.findMany({
        where,
        orderBy: listOrder(input.sort),
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { _count: { select: { events: true } } },
      }),
    ],
    { isolationLevel: 'RepeatableRead' }
  );
  res.json({
    data: {
      items: links.map((link) => linkView(link, user.name, link._count.events)),
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.ceil(total / input.pageSize),
    },
  });
});
linksRouter.get('/facets', async (req, res) => {
  const links = await db.link.findMany({
    where: { userId: authOf(req).user.id, deletedAt: null },
    select: { archivedAt: true, expiresAt: true, tags: true, category: true },
  });
  const counts = { all: links.length, active: 0, expiring: 0, expired: 0, archived: 0 };
  const tags = new Map<string, number>();
  const categories = new Map<string, number>();
  const now = Date.now();
  for (const link of links) {
    const status = link.archivedAt
      ? 'archived'
      : link.expiresAt && link.expiresAt.getTime() <= now
        ? 'expired'
        : link.expiresAt && link.expiresAt.getTime() <= now + expiringWindow
          ? 'expiring'
          : 'active';
    counts[status]++;
    for (const tag of link.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    categories.set(link.category, (categories.get(link.category) ?? 0) + 1);
  }
  const entries = (map: Map<string, number>) =>
    [...map].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count }));
  res.json({ data: { counts, tags: entries(tags), categories: entries(categories) } });
});
linksRouter.get('/export', async (req, res) => {
  const input = listSchema.parse(req.query);
  const user = authOf(req).user;
  const links = await db.link.findMany({
    where: listWhere(user.id, input),
    orderBy: listOrder(input.sort),
    include: { _count: { select: { events: true } } },
  });
  const rows: (string | number | null)[][] = [
    [
      'Title',
      'Destination',
      'Slug',
      'Domain',
      'Short URL',
      'Tags',
      'Category',
      'Status',
      'Clicks',
      'Growth (unavailable)',
      'Created at',
      'Author',
      'Protected',
      'Expires at',
    ],
  ];
  for (const link of links)
    rows.push([
      link.title,
      link.destination,
      link.slug,
      link.domain,
      shortUrl(link),
      link.tags.join('; '),
      link.category,
      linkStatus(link),
      link._count.events,
      'Unavailable',
      link.createdAt.toISOString(),
      user.name,
      link.passwordHash ? 'Yes' : 'No',
      link.expiresAt?.toISOString() ?? null,
    ]);
  res
    .type('text/csv')
    .setHeader('Content-Disposition', 'attachment; filename="linkflow-links.csv"');
  res.send(csv(rows));
});
linksRouter.post('/', async (req, res) => {
  const input = draftSchema.parse(req.body);
  const user = authOf(req).user;
  await assertDomain(user.id, input.domain);
  const passwordHash =
    input.protected && input.password ? await hashPassword(input.password) : null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = input.slug || randomBytes(6).toString('hex');
    try {
      const link = await db.$transaction(async (tx) => {
        const created = await tx.link.create({
          data: {
            userId: user.id,
            title: input.title,
            destination: input.destination,
            slug,
            domain: input.domain,
            tags: input.tags,
            category: input.category,
            passwordHash,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
        });
        await tx.alias.create({ data: { domain: created.domain, slug, linkId: created.id } });
        return created;
      });
      return res.status(201).json({ data: linkView(link, user.name) });
    } catch (error) {
      if (
        !input.slug &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        continue;
      throw error;
    }
  }
  throw new HttpError(503, 'ALIAS_GENERATION_FAILED', 'Could not allocate an alias; try again');
});
linksRouter.post('/bulk', async (req, res) => {
  const input = z
    .object({
      ids: z
        .array(idSchema)
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length, 'IDs must be unique'),
      action: z.enum(['archive', 'restore', 'delete']),
    })
    .strict()
    .parse(req.body);
  const userId = authOf(req).user.id;
  const links = await db.$transaction(async (tx) => {
    // Row locks serialize bulk ownership/lifecycle validation with edits/deletes and redirect recording.
    await tx.$queryRaw`SELECT "id" FROM "Link" WHERE "userId" = ${userId}::uuid AND "deletedAt" IS NULL AND "id" IN (${Prisma.join(input.ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY "id" FOR UPDATE`;
    const owned = await tx.link.findMany({
      where: { id: { in: input.ids }, userId, deletedAt: null },
    });
    if (owned.length !== input.ids.length)
      throw new HttpError(404, 'NOT_FOUND', 'One or more links were not found');
    await tx.link.updateMany({
      where: { id: { in: input.ids }, userId, deletedAt: null },
      data:
        input.action === 'delete'
          ? { deletedAt: new Date() }
          : { archivedAt: input.action === 'archive' ? new Date() : null },
    });
    return owned;
  });
  await Promise.all(links.map((link) => cacheDelete(routingKey(link))));
  res.json({ data: { affected: links.length } });
});
linksRouter.get('/:id/qr', async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { format } = z
    .object({ format: z.enum(['svg', 'png']).default('svg') })
    .strict()
    .parse(req.query);
  const link = await db.link.findFirst({
    where: { id, userId: authOf(req).user.id, deletedAt: null },
  });
  if (!link) throw new HttpError(404, 'NOT_FOUND', 'Link not found');
  res.setHeader('Cache-Control', 'private, no-store');
  if (format === 'svg')
    res
      .type('image/svg+xml')
      .send(
        await QRCode.toString(shortUrl(link), { type: 'svg', errorCorrectionLevel: 'M', margin: 4 })
      );
  else
    res.type('image/png').send(
      await QRCode.toBuffer(shortUrl(link), {
        type: 'png',
        errorCorrectionLevel: 'M',
        margin: 4,
        width: 512,
      })
    );
});
linksRouter.patch('/:id', async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const input = patchSchema.parse(req.body);
  const user = authOf(req).user;
  const newHash =
    typeof input.password === 'string' ? await hashPassword(input.password) : undefined;
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Link" WHERE "id" = ${id}::uuid AND "userId" = ${user.id}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
    const old = await tx.link.findFirst({ where: { id, userId: user.id, deletedAt: null } });
    if (!old) throw new HttpError(404, 'NOT_FOUND', 'Link not found');
    if (input.protected === true && !newHash && !old.passwordHash)
      throw new HttpError(400, 'PASSWORD_REQUIRED', 'Protected links require a password');
    const passwordHash = input.protected === false || input.password === null ? null : newHash;
    if (input.slug && input.slug !== old.slug) {
      const reserved = await tx.alias.findUnique({
        where: { domain_slug: { domain: old.domain, slug: input.slug } },
      });
      if (reserved && reserved.linkId !== old.id)
        throw new HttpError(409, 'ALIAS_RESERVED', 'Alias is permanently reserved');
      if (!reserved)
        await tx.alias.create({ data: { domain: old.domain, slug: input.slug, linkId: old.id } });
    }
    const archived =
      input.archived ?? (input.status === undefined ? undefined : input.status === 'archived');
    const updated = await tx.link.update({
      where: { id },
      data: {
        title: input.title,
        destination: input.destination,
        tags: input.tags,
        category: input.category,
        slug: input.slug,
        expiresAt:
          input.expiresAt === undefined
            ? undefined
            : input.expiresAt === null
              ? null
              : new Date(input.expiresAt),
        archivedAt: archived === undefined ? undefined : archived ? new Date() : null,
        passwordHash,
      },
      include: { _count: { select: { events: true } } },
    });
    return { old, updated };
  });
  await Promise.all([cacheDelete(routingKey(result.old)), cacheDelete(routingKey(result.updated))]);
  res.json({ data: linkView(result.updated, user.name, result.updated._count.events) });
});
linksRouter.get('/:id', async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const user = authOf(req).user;
  const link = await db.link.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    include: { _count: { select: { events: true } } },
  });
  if (!link) throw new HttpError(404, 'NOT_FOUND', 'Link not found');
  res.json({ data: linkView(link, user.name, link._count.events) });
});
linksRouter.delete('/:id', async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const userId = authOf(req).user.id;
  const link = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Link" WHERE "id" = ${id}::uuid AND "userId" = ${userId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
    const owned = await tx.link.findFirst({ where: { id, userId, deletedAt: null } });
    if (!owned) throw new HttpError(404, 'NOT_FOUND', 'Link not found');
    await tx.link.update({ where: { id }, data: { deletedAt: new Date() } });
    return owned;
  });
  await cacheDelete(routingKey(link));
  res.status(204).end();
});
