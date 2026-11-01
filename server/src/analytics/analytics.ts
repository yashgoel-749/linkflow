import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../db.js';
import { authOf, authenticate } from '../auth/auth.js';
import { idSchema } from '../schemas.js';
import { HttpError } from '../errors.js';
import { linkView } from '../links/links.js';
import { csv } from '../csv.js';

const day = 86400000;
export const rangeSchema = z
  .object({
    days: z.coerce.number().int().min(1).max(366).default(31),
    source: z.union([z.literal('all'), z.literal('everything'), idSchema]).default('all'),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (!!input.from !== !!input.to)
      ctx.addIssue({ code: 'custom', message: 'Provide both from and to' });
    if (input.from && input.to) {
      const length = new Date(input.to).getTime() - new Date(input.from).getTime();
      if (length <= 0 || length > 366 * day)
        ctx.addIssue({ code: 'custom', message: 'Range must be positive and at most 366 days' });
    }
  });
export function analyticsRange(input: z.infer<typeof rangeSchema>, now = new Date()) {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    from: input.from ? new Date(input.from) : new Date(midnight - (input.days - 1) * day),
    to: input.to ? new Date(input.to) : new Date(midnight + day),
  };
}
const numberSchema = z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const totalRows = z.array(z.object({ clicks: numberSchema, visitors: numberSchema }));
const dailyRows = z.array(
  z.object({ date: z.string(), clicks: numberSchema, visitors: numberSchema })
);
const countRows = z.array(z.object({ name: z.string(), count: numberSchema }));
const leaderRows = z.array(z.object({ id: idSchema, count: numberSchema }));
const palette = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];
export async function report(
  user: { id: string; name: string },
  input: z.infer<typeof rangeSchema>
) {
  const { from, to } = analyticsRange(input);
  const linkId = input.source === 'all' || input.source === 'everything' ? null : input.source;
  const sourceLink = linkId
    ? await db.link.findFirst({ where: { id: linkId, userId: user.id } })
    : null;
  if (linkId && !sourceLink) throw new HttpError(404, 'NOT_FOUND', 'Analytics source not found');
  // Prisma DateTime is a UTC timestamp without zone. Bind canonical UTC text explicitly;
  // raw Date bindings are timestamptz and otherwise inherit the server's local timezone.
  const lifecycle =
    input.source === 'all'
      ? Prisma.sql`AND l."deletedAt" IS NULL AND l."archivedAt" IS NULL AND (l."expiresAt" IS NULL OR l."expiresAt" > ${new Date().toISOString()}::timestamp)`
      : Prisma.empty;
  const filter = Prisma.sql`l."userId" = ${user.id}::uuid AND c."occurredAt" >= ${from.toISOString()}::timestamp AND c."occurredAt" < ${to.toISOString()}::timestamp ${lifecycle} ${linkId ? Prisma.sql`AND l."id" = ${linkId}::uuid` : Prisma.empty}`;
  const joins = Prisma.sql`FROM "Click" c JOIN "Link" l ON l."id" = c."linkId" WHERE ${filter}`;
  const results = await db.$transaction(
    async (tx) => {
      const totals = totalRows.parse(
        await tx.$queryRaw`SELECT COUNT(*) AS clicks, COUNT(DISTINCT c."visitorHash") AS visitors ${joins}`
      );
      const timeline = dailyRows.parse(
        await tx.$queryRaw`SELECT to_char(c."occurredAt", 'YYYY-MM-DD') AS date, COUNT(*) AS clicks, COUNT(DISTINCT c."visitorHash") AS visitors ${joins} GROUP BY date ORDER BY date`
      );
      const channels = countRows.parse(
        await tx.$queryRaw`SELECT c."channel" AS name, COUNT(*) AS count ${joins} GROUP BY c."channel" ORDER BY count DESC, name`
      );
      const referrers = countRows.parse(
        await tx.$queryRaw`SELECT COALESCE(c."referrer", 'Direct') AS name, COUNT(*) AS count ${joins} GROUP BY c."referrer" ORDER BY count DESC, name`
      );
      const devices = countRows.parse(
        await tx.$queryRaw`SELECT c."device" AS name, COUNT(*) AS count ${joins} GROUP BY c."device" ORDER BY count DESC, name`
      );
      const systems = countRows.parse(
        await tx.$queryRaw`SELECT c."system" AS name, COUNT(*) AS count ${joins} GROUP BY c."system" ORDER BY count DESC, name`
      );
      const hours = countRows.parse(
        await tx.$queryRaw`SELECT to_char(c."occurredAt", 'HH24') AS name, COUNT(*) AS count ${joins} GROUP BY name ORDER BY count DESC, name LIMIT 1`
      );
      const leaders = leaderRows.parse(
        await tx.$queryRaw`SELECT l."id" AS id, COUNT(*) AS count ${joins} GROUP BY l."id" ORDER BY count DESC, l."id" LIMIT 10`
      );
      const links = await tx.link.findMany({
        where: { id: { in: leaders.map((row) => row.id) }, userId: user.id },
        include: { _count: { select: { events: true } } },
      });
      return { totals, timeline, channels, referrers, devices, systems, hours, leaders, links };
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 }
  );
  const total = results.totals[0]?.clicks ?? 0;
  const visitors = results.totals[0]?.visitors ?? 0;
  const timeline = [];
  const daily = new Map(results.timeline.map((row) => [row.date, row]));
  let current = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  while (current < to.getTime()) {
    const date = new Date(current).toISOString().slice(0, 10);
    const row = daily.get(date);
    timeline.push({ date, clicks: row?.clicks ?? 0, visitors: row?.visitors ?? 0, conversions: 0 });
    current += day;
  }
  const breakdown = (rows: z.infer<typeof countRows>) =>
    rows.map((row, index) => ({
      ...row,
      share: total ? (row.count / total) * 100 : 0,
      color: palette[index % palette.length] ?? '#64748b',
    }));
  const details: Record<string, string> = {
    Direct: 'No referrer provided',
    Search: 'Search engine referrer hostname',
    Social: 'Social network referrer hostname',
    Referral: 'Other referrer hostname',
  };
  const channels = breakdown(results.channels).map((row) => ({
    ...row,
    detail: details[row.name] ?? 'Referrer hostname',
  }));
  const referrers = breakdown(results.referrers).map((row) => ({
    ...row,
    detail: row.name === 'Direct' ? 'No referrer provided' : 'Recorded referrer hostname',
  }));
  const geography = total
    ? [{ name: 'Unknown', code: 'XX', share: 100, count: total, color: '#64748b' }]
    : [];
  const devices = breakdown(results.devices);
  const systems = results.systems.map((row) => ({
    ...row,
    share: total ? (row.count / total) * 100 : 0,
  }));
  const links = new Map(results.links.map((link) => [link.id, link]));
  const leaders = results.leaders.flatMap((row) => {
    const link = links.get(row.id);
    return link
      ? [{ link: linkView(link, user.name, link._count.events), clicks: row.count, conversions: 0 }]
      : [];
  });
  const sourceName =
    sourceLink?.title ?? (input.source === 'everything' ? 'Everything' : 'All active links');
  const peakHour = results.hours[0] ? `${results.hours[0].name}:00 UTC` : null;
  const rows: (string | number | null)[][] = [
    ['LinkFlow analytics', sourceName],
    ['From (inclusive UTC)', from.toISOString()],
    ['To (exclusive UTC)', to.toISOString()],
    ['Clicks', total],
    ['Visitors (range-distinct estimate)', visitors],
    ['Conversions', 'Unavailable'],
    ['Geography', 'Unavailable; reported as Unknown'],
    [],
    ['Date (UTC)', 'Clicks', 'Visitors (daily-distinct estimate)', 'Conversions (unavailable)'],
    ...timeline.map((row) => [row.date, row.clicks, row.visitors, 'Unavailable']),
    [],
    ['Channel', 'Clicks', 'Share (%)'],
    ...channels.map((row) => [row.name, row.count, row.share]),
    [],
    ['Referrer hostname', 'Clicks', 'Share (%)'],
    ...referrers.map((row) => [row.name, row.count, row.share]),
    [],
    ['Geography', 'Clicks', 'Share (%)'],
    ...geography.map((row) => [row.name, row.count, row.share]),
    [],
    ['Device', 'Clicks', 'Share (%)'],
    ...devices.map((row) => [row.name, row.count, row.share]),
    [],
    ['System', 'Clicks', 'Share (%)'],
    ...systems.map((row) => [row.name, row.count, row.share]),
    [],
    ['Top links', 'Short URL', 'Clicks', 'Conversions (unavailable)'],
    ...leaders.map((row) => [row.link.title, row.link.shortUrl, row.clicks, 'Unavailable']),
  ];
  return {
    timeline,
    total,
    visitors,
    conversions: 0,
    channels,
    referrers,
    geography,
    devices,
    systems,
    leaders,
    sourceName,
    peakHour,
    from: from.toISOString(),
    to: to.toISOString(),
    csv: {
      name: `linkflow-analytics-${from.toISOString().slice(0, 10)}.csv`,
      content: csv(rows),
      type: 'text/csv',
    },
  };
}
export const analyticsRouter = Router();
analyticsRouter.use(authenticate);
analyticsRouter.get('/', async (req, res) => {
  res.json({ data: await report(authOf(req).user, rangeSchema.parse(req.query)) });
});
analyticsRouter.get('/export', async (req, res) => {
  const result = await report(authOf(req).user, rangeSchema.parse(req.query));
  res
    .type(result.csv.type)
    .setHeader('Content-Disposition', `attachment; filename="${result.csv.name}"`);
  res.send(result.csv.content);
});
