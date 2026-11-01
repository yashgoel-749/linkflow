import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import supertest from 'supertest';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { testEnvironment } from '../scripts/test-env.js';

testEnvironment();
const { app } = await import('../src/app.js');
const { db } = await import('../src/db.js');
const { redis, connectRedis, privateHash, rateLimit } = await import('../src/security.js');
const { config } = await import('../src/config.js');
const { routingKey } = await import('../src/links/links.js');
const { SignJWT } = await import('jose');
const api = supertest(app);
const origin = 'http://localhost:5173';
const password = 'Valid-long-password-123';
const prefix = `integration-${randomUUID()}`;
const userSchema = z.object({ id: z.string().uuid(), name: z.string(), email: z.string().email() });
const linkSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  domain: z.string(),
  shortUrl: z.string().url(),
  title: z.string(),
  destination: z.string(),
  status: z.string(),
  clicks: z.number(),
  tags: z.array(z.string()),
  protected: z.boolean(),
  expiresAt: z.string().nullable(),
});
const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string(),
});
const reportSchema = z.object({
  total: z.number(),
  visitors: z.number(),
  conversions: z.number(),
  timeline: z.array(
    z.object({
      date: z.string(),
      clicks: z.number(),
      visitors: z.number(),
      conversions: z.number(),
    })
  ),
  channels: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
      share: z.number(),
      detail: z.string(),
      color: z.string(),
    })
  ),
  referrers: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
      share: z.number(),
      detail: z.string(),
      color: z.string(),
    })
  ),
  geography: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
      share: z.number(),
      code: z.string(),
      color: z.string(),
    })
  ),
  devices: z.array(
    z.object({ name: z.string(), count: z.number(), share: z.number(), color: z.string() })
  ),
  systems: z.array(z.object({ name: z.string(), count: z.number(), share: z.number() })),
  leaders: z.array(z.object({ link: linkSchema, clicks: z.number(), conversions: z.number() })),
  sourceName: z.string(),
  peakHour: z.string().nullable(),
  from: z.string(),
  to: z.string(),
  csv: z.object({ name: z.string(), content: z.string(), type: z.string() }),
});
type Account = { cookie: string; user: z.infer<typeof userSchema> };
let owner: Account;
let other: Account;
let empty: Account;
const users: string[] = [];
function cookieOf(response: supertest.Response) {
  const cookies = z.array(z.string()).parse(response.headers['set-cookie']);
  const cookie = cookies[0]?.split(';')[0];
  assert.ok(cookie);
  return cookie;
}
async function register(name: string): Promise<Account> {
  const response = await api
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({ name, email: `${prefix}-${name}@example.test`, password })
    .expect(201);
  const user = z.object({ data: userSchema }).parse(response.body).data;
  users.push(user.id);
  assert.match(String(response.headers['set-cookie']), /HttpOnly/);
  assert.match(String(response.headers['set-cookie']), /SameSite=Lax/);
  return { user, cookie: cookieOf(response) };
}
async function createLink(input: Record<string, unknown> = {}, account = owner) {
  const response = await api
    .post('/api/links')
    .set('Origin', origin)
    .set('Cookie', account.cookie)
    .send({
      title: 'A real link',
      destination: 'https://example.com/path?private=value',
      domain: config.defaultDomain,
      slug: '',
      tags: ['work'],
      protected: false,
      expiresAt: null,
      ...input,
    })
    .expect(201);
  return z.object({ data: linkSchema }).parse(response.body).data;
}
function redirect(slug: string) {
  return api.get(`/r/${slug}`).set('Host', config.defaultDomain);
}
function patch(id: string, input: unknown, account = owner) {
  return api
    .patch(`/api/links/${id}`)
    .set('Origin', origin)
    .set('Cookie', account.cookie)
    .send(input);
}
function remove(id: string, account = owner) {
  return api.delete(`/api/links/${id}`).set('Origin', origin).set('Cookie', account.cookie);
}

describe('real PostgreSQL / Redis API integration', { concurrency: false }, () => {
  before(async () => {
    await db.$connect();
    await db.$queryRaw`SELECT 1`;
    await connectRedis();
    assert.equal(
      await redis.ping(),
      'PONG',
      'A real Redis service is required for integration tests'
    );
    owner = await register('owner');
    other = await register('other');
    empty = await register('empty');
  });
  after(async () => {
    // Remove only this run's UUID-owned records. Never truncate or FLUSHALL shared services.
    const links = await db.link.findMany({ where: { userId: { in: users } } });
    for (const link of links) if (redis.isReady) await redis.del(routingKey(link));
    if (redis.isReady) {
      for await (const keys of redis.scanIterator({
        MATCH: `${config.REDIS_NAMESPACE}:*`,
        COUNT: 100,
      }))
        if (keys.length) await redis.del(keys);
    }
    await db.alias.deleteMany({ where: { link: { userId: { in: users } } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
    if (redis.isOpen) redis.destroy();
  });
  it('enforces exact Origin before auth, including login/register and missing Origin', async () => {
    for (const badOrigin of ['http://localhost:5173.evil.test', 'http://localhost:5173/', 'null']) {
      const response = await api
        .post('/api/auth/login')
        .set('Origin', badOrigin)
        .send({ email: owner.user.email, password })
        .expect(403);
      assert.equal(errorSchema.parse(response.body).error.code, 'ORIGIN_FORBIDDEN');
    }
    await api
      .post('/api/auth/register')
      .send({ name: 'bad', email: 'bad@example.test', password })
      .expect(403);
    await api.patch('/api/auth/me').set('Cookie', owner.cookie).send({ name: 'bad' }).expect(403);
    const preflight = await api
      .options('/api/links')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    assert.equal(preflight.headers['access-control-allow-origin'], origin);
    assert.equal(preflight.headers['access-control-allow-credentials'], 'true');
  });
  it('normalizes unique email, securely hashes passwords, supports remembered login/profile and revocable logout', async () => {
    await api
      .post('/api/auth/register')
      .set('Origin', origin)
      .send({ name: 'duplicate', email: owner.user.email.toUpperCase(), password })
      .expect(409);
    const stored = await db.user.findUniqueOrThrow({ where: { id: owner.user.id } });
    assert.match(stored.passwordHash, /^scrypt\$/);
    assert.ok(!stored.passwordHash.includes(password));
    await api.get('/api/auth/me').expect(401);
    await api.get('/api/auth/me').set('Cookie', owner.cookie).expect(200);
    await api
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: owner.user.email, password: 'wrong-password' })
      .expect(401);
    const login = await api
      .post('/api/auth/login')
      .set('Origin', config.publicOrigin)
      .send({ email: owner.user.email, password, remember: true })
      .expect(200);
    const remembered = cookieOf(login);
    assert.match(String(login.headers['set-cookie']), /Max-Age=2592000/);
    await api
      .patch('/api/auth/me')
      .set('Origin', origin)
      .set('Cookie', owner.cookie)
      .send({ name: 'Owner', email: `${prefix}-new@example.test` })
      .expect(403);
    const changed = await api
      .patch('/api/auth/me')
      .set('Origin', origin)
      .set('Cookie', owner.cookie)
      .send({ name: 'Owner', email: `${prefix}-new@example.test`, password })
      .expect(200);
    owner.user = z.object({ data: userSchema }).parse(changed.body).data;
    await api.post('/api/auth/logout').set('Origin', origin).set('Cookie', remembered).expect(204);
    await api.get('/api/auth/me').set('Cookie', remembered).expect(401);
    const revoked = await db.session.findFirst({
      where: { userId: owner.user.id, revokedAt: { not: null } },
    });
    assert.ok(revoked);
  });
  it('rejects forged, expired, wrong-algorithm/audience JWTs and database-expired sessions', async () => {
    const session = await db.session.create({
      data: { userId: owner.user.id, expiresAt: new Date(Date.now() + 100000) },
    });
    const key = new TextEncoder().encode(config.JWT_SECRET);
    for (const variant of ['audience', 'algorithm', 'expired']) {
      const token = await new SignJWT({ sid: session.id })
        .setProtectedHeader({ alg: variant === 'algorithm' ? 'HS384' : 'HS256' })
        .setIssuer('linkflow')
        .setAudience(variant === 'audience' ? 'other' : 'linkflow-api')
        .setSubject(owner.user.id)
        .setIssuedAt()
        .setExpirationTime(variant === 'expired' ? '1 second ago' : '10 minutes')
        .sign(key);
      await api.get('/api/auth/me').set('Cookie', `linkflow_session=${token}`).expect(401);
    }
    const token = await new SignJWT({ sid: session.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('linkflow')
      .setAudience('linkflow-api')
      .setSubject(owner.user.id)
      .setIssuedAt()
      .setExpirationTime('10 minutes')
      .sign(key);
    await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } });
    await api.get('/api/auth/me').set('Cookie', `linkflow_session=${token}`).expect(401);
    await api.get('/api/auth/me').set('Cookie', 'linkflow_session=garbage').expect(401);
  });
  it('new accounts have no seeded links or fabricated analytics', async () => {
    const page = await api.get('/api/links').set('Cookie', empty.cookie).expect(200);
    assert.deepEqual(
      z
        .object({
          data: z.object({
            items: z.array(z.unknown()),
            total: z.number(),
            totalPages: z.number(),
          }),
        })
        .parse(page.body).data,
      { items: [], total: 0, totalPages: 0 }
    );
    const response = await api.get('/api/analytics').set('Cookie', empty.cookie).expect(200);
    const report = z.object({ data: reportSchema }).parse(response.body).data;
    assert.equal(report.total, 0);
    assert.equal(report.visitors, 0);
    assert.equal(report.timeline.length, 31);
    assert.equal(report.peakHour, null);
    assert.ok(
      report.timeline.every(
        (row) => row.clicks === 0 && row.visitors === 0 && row.conversions === 0
      )
    );
    assert.deepEqual(report.channels, []);
    assert.deepEqual(report.leaders, []);
  });
  it('creates canonical/generated aliases and enforces unique aliases concurrently', async () => {
    const alias = `${prefix}-unique`;
    const results = await Promise.all(
      [owner, other].map((account) =>
        api.post('/api/links').set('Origin', origin).set('Cookie', account.cookie).send({
          title: 'Unique',
          destination: 'https://example.com',
          slug: alias.toUpperCase(),
          domain: config.defaultDomain,
        })
      )
    );
    assert.deepEqual(results.map((response) => response.status).sort(), [201, 409]);
    const generated = await createLink();
    assert.match(generated.slug, /^[a-z0-9-]+$/);
    assert.equal(generated.shortUrl, `${config.publicOrigin}/r/${generated.slug}`);
    assert.equal(generated.clicks, 0);
  });
  it('scopes every private link operation, filters, facets, exports and atomic bulk to ownership', async () => {
    const a = await createLink({
      title: 'Needle Alpha',
      category: 'Test Category',
      tags: ['specific-tag'],
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    const b = await createLink({
      title: 'Needle Beta',
      category: 'Test Category',
      tags: ['specific-tag'],
    });
    const foreign = await createLink(
      { title: 'Needle Foreign', category: 'Test Category', tags: ['specific-tag'] },
      other
    );
    await patch(a.id, { title: 'Stolen' }, other).expect(404);
    await remove(a.id, other).expect(404);
    await api.get(`/api/links/${a.id}/qr`).set('Cookie', other.cookie).expect(404);
    await api.get(`/api/links/${a.id}`).set('Cookie', other.cookie).expect(404);
    const bulk = (ids: string[], action: string) =>
      api
        .post('/api/links/bulk')
        .set('Origin', origin)
        .set('Cookie', owner.cookie)
        .send({ ids, action });
    await bulk([a.id, foreign.id], 'archive').expect(404);
    assert.equal((await db.link.findUniqueOrThrow({ where: { id: a.id } })).archivedAt, null);
    await bulk([a.id, a.id], 'archive').expect(400);
    const result = await bulk([a.id, b.id], 'archive').expect(200);
    assert.equal(
      z.object({ data: z.object({ affected: z.number() }) }).parse(result.body).data.affected,
      2
    );
    await redirect(a.slug).expect(410);
    await bulk([a.id, b.id], 'restore').expect(200);
    const page = await api
      .get('/api/links')
      .query({
        q: 'Needle',
        category: 'Test Category',
        tag: 'specific-tag',
        status: 'all',
        pageSize: 1,
        page: 2,
        sort: 'title',
      })
      .set('Cookie', owner.cookie)
      .expect(200);
    const parsed = z
      .object({
        data: z.object({
          items: z.array(linkSchema),
          total: z.number(),
          totalPages: z.number(),
          page: z.number(),
          pageSize: z.number(),
        }),
      })
      .parse(page.body).data;
    assert.equal(parsed.total, 2);
    assert.equal(parsed.totalPages, 2);
    assert.equal(parsed.items[0]?.id, b.id);
    const expiring = await api
      .get('/api/links')
      .query({ tag: 'specific-tag', status: 'expiring' })
      .set('Cookie', owner.cookie)
      .expect(200);
    assert.deepEqual(
      z
        .object({ data: z.object({ items: z.array(linkSchema) }) })
        .parse(expiring.body)
        .data.items.map((row) => row.id),
      [a.id]
    );
    const facets = await api.get('/api/links/facets').set('Cookie', owner.cookie).expect(200);
    assert.ok(JSON.stringify(facets.body).includes('specific-tag'));
    const exported = await api
      .get('/api/links/export')
      .query({ q: 'Needle', category: 'Test Category', pageSize: 1 })
      .set('Cookie', owner.cookie)
      .expect(200);
    assert.match(exported.text, /Needle Alpha/);
    assert.match(exported.text, /Needle Beta/);
    assert.doesNotMatch(exported.text, /Needle Foreign/);
    await bulk([a.id, b.id], 'delete').expect(200);
    await redirect(a.slug).expect(404);
  });
  it('cached routing cannot revive edited, deleted, expired or archived links; aliases remain reserved', async () => {
    const link = await createLink({ destination: 'https://example.com/old' });
    await redirect(link.slug).expect(302).expect('Location', 'https://example.com/old');
    assert.equal(await redis.get(routingKey(link)), link.id);
    await patch(link.id, { destination: 'https://example.com/new' }).expect(200);
    await redis.set(routingKey(link), link.id, { EX: 60 });
    await redirect(link.slug).expect(302).expect('Location', 'https://example.com/new');
    await patch(link.id, { expiresAt: new Date(Date.now() - 1000).toISOString() }).expect(200);
    await redis.set(routingKey(link), link.id, { EX: 60 });
    await redirect(link.slug).expect(410);
    await patch(link.id, { expiresAt: null, archived: true }).expect(200);
    await redirect(link.slug).expect(410);
    await patch(link.id, { archived: false, slug: `${prefix}-edited` }).expect(200);
    await redirect(link.slug).expect(404);
    await redirect(`${prefix}-edited`).expect(302);
    await api
      .post('/api/links')
      .set('Origin', origin)
      .set('Cookie', owner.cookie)
      .send({
        title: 'Reuse',
        destination: 'https://example.com',
        domain: config.defaultDomain,
        slug: link.slug,
      })
      .expect(409);
    await remove(link.id).expect(204);
    await redis.set(routingKey({ ...link, slug: `${prefix}-edited` }), link.id, { EX: 60 });
    await redirect(`${prefix}-edited`).expect(404);
    await api
      .post('/api/links')
      .set('Origin', origin)
      .set('Cookie', owner.cookie)
      .send({
        title: 'Reuse deleted',
        destination: 'https://example.com',
        domain: config.defaultDomain,
        slug: `${prefix}-edited`,
      })
      .expect(409);
    await redis.del(routingKey(link), routingKey({ ...link, slug: `${prefix}-edited` }));
  });
  it('requires real password, does not record challenges/HEAD/failed attempts, and supports password edits/removal', async () => {
    const link = await createLink({
      title: '<script>alert(1)</script>',
      protected: true,
      password,
    });
    const challenge = await redirect(link.slug).expect(401);
    assert.match(challenge.text, /type="password"/);
    assert.match(challenge.text, /&lt;script&gt;/);
    assert.doesNotMatch(challenge.text, /<script>/);
    await api.head(`/r/${link.slug}`).set('Host', config.defaultDomain).expect(401);
    const post = (value: string) =>
      api
        .post(`/r/${link.slug}`)
        .set('Host', config.defaultDomain)
        .set('Origin', config.publicOrigin)
        .send({ password: value });
    await post('wrong-password').expect(403);
    await api
      .post(`/r/${link.slug}`)
      .set('Host', config.defaultDomain)
      .send({ password })
      .expect(403);
    assert.equal(await db.click.count({ where: { linkId: link.id } }), 0);
    await post(password).expect(302);
    await patch(link.id, { password: 'a-new-valid-password' }).expect(200);
    await post(password).expect(403);
    await post('a-new-valid-password').expect(302);
    await patch(link.id, { protected: false }).expect(200);
    await api.head(`/r/${link.slug}`).set('Host', config.defaultDomain).expect(302);
    assert.equal(await db.click.count({ where: { linkId: link.id } }), 2);
    await redirect(link.slug).expect(302);
    await patch(link.id, { protected: true }).expect(400);
    assert.equal(await db.click.count({ where: { linkId: link.id } }), 3);
    const detail = await api.get(`/api/links/${link.id}`).set('Cookie', owner.cookie).expect(200);
    assert.equal(z.object({ data: linkSchema }).parse(detail.body).data.clicks, 3);
  });
  it('accepts browser form unlock from exact public origin without disclosing the destination', async () => {
    const destination = 'https://example.com/secret-destination';
    const link = await createLink({ protected: true, password, destination });
    const challenge = await redirect(link.slug).expect(401);
    assert.ok(!challenge.text.includes(destination));
    await api
      .post(`/r/${link.slug}`)
      .set('Host', config.defaultDomain)
      .set('Origin', config.publicOrigin)
      .type('form')
      .send({ password: 'wrong-password' })
      .expect(403);
    await api
      .post(`/r/${link.slug}`)
      .set('Host', config.defaultDomain)
      .set('Origin', config.publicOrigin)
      .type('form')
      .send({ password })
      .expect(302)
      .expect('Location', destination);
    assert.equal(await db.click.count({ where: { linkId: link.id } }), 1);
    const event = await db.click.findFirstOrThrow({ where: { linkId: link.id } });
    assert.ok(
      Math.abs(event.occurredAt.getTime() - Date.now()) < 30000,
      'Database defaults must store UTC, independent of server timezone'
    );
  });
  it('returns real PNG/SVG QR encoding authoritative default-host URL and safely quotes CSV', async () => {
    const link = await createLink({
      title: '=HYPERLINK("evil")\nquoted',
      tags: ['+formula'],
      category: '@category',
    });
    const svg = await api
      .get(`/api/links/${link.id}/qr`)
      .set('Cookie', owner.cookie)
      .expect(200)
      .expect('Content-Type', /image\/svg\+xml/);
    assert.ok(Buffer.isBuffer(svg.body));
    assert.equal(
      svg.body.toString('utf8'),
      await QRCode.toString(link.shortUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 })
    );
    const image = await api
      .get(`/api/links/${link.id}/qr?format=png`)
      .set('Cookie', owner.cookie)
      .buffer(true)
      .expect(200)
      .expect('Content-Type', /image\/png/);
    const png = PNG.sync.read(image.body);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    assert.equal(decoded?.data, link.shortUrl);
    const exported = await api
      .get('/api/links/export')
      .set('Cookie', owner.cookie)
      .query({ q: '=HYPERLINK' })
      .expect(200);
    assert.match(exported.text, /"'=HYPERLINK\(""evil""\)/);
    assert.match(exported.text, /"'@category"/);
    assert.match(exported.text, /Growth \(unavailable\)/);
  });
  it('aggregates recorded events, range-distinct visitors, UTC filters and conserved breakdowns; retains deleted history', async () => {
    const link = await createLink({ title: 'Analytics Needle' });
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
    await redirect(link.slug)
      .set('User-Agent', ua)
      .set('Referer', 'https://www.google.com/search?q=private')
      .expect(302);
    await redirect(link.slug)
      .set('User-Agent', ua)
      .set('Referer', 'https://www.google.com/search?q=other')
      .expect(302);
    await redirect(link.slug)
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/130.0')
      .expect(302);
    const events = await db.click.findMany({ where: { linkId: link.id }, orderBy: { id: 'asc' } });
    assert.equal(events.length, 3);
    assert.equal(events[0]?.referrer, 'www.google.com');
    assert.equal(events[0]?.visitorHash, events[1]?.visitorHash);
    assert.notEqual(events[1]?.visitorHash, events[2]?.visitorHash);
    assert.equal(events[0]?.device, 'Mobile');
    assert.equal(events[0]?.system, 'iOS');
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      assert.ok(event);
      await db.click.update({
        where: { id: event.id },
        data: {
          occurredAt: new Date(
            i === 0
              ? '2026-01-01T10:00:00Z'
              : i === 1
                ? '2026-01-02T10:00:00Z'
                : '2026-01-02T11:00:00Z'
          ),
        },
      });
    }
    const params = { source: link.id, from: '2026-01-01T00:00:00Z', to: '2026-01-03T00:00:00Z' };
    const response = await api
      .get('/api/analytics')
      .set('Cookie', owner.cookie)
      .query(params)
      .expect(200);
    const report = z.object({ data: reportSchema }).parse(response.body).data;
    assert.equal(report.total, 3);
    assert.equal(report.visitors, 2);
    assert.equal(report.conversions, 0);
    assert.equal(
      report.timeline.reduce((n, row) => n + row.visitors, 0),
      3,
      'Period uniques must not be sum of daily uniques'
    );
    assert.deepEqual(
      report.timeline.map((row) => row.clicks),
      [1, 2]
    );
    for (const breakdown of [
      report.channels,
      report.referrers,
      report.devices,
      report.systems,
      report.geography,
    ]) {
      assert.equal(
        breakdown.reduce((n, row) => n + row.count, 0),
        report.total
      );
      assert.ok(Math.abs(breakdown.reduce((n, row) => n + row.share, 0) - 100) < 1e-8);
    }
    assert.equal(report.geography[0]?.name, 'Unknown');
    assert.equal(report.peakHour, '10:00 UTC');
    assert.equal(report.leaders[0]?.clicks, 3);
    assert.match(report.csv.content, /Unavailable/);
    const exported = await api
      .get('/api/analytics/export')
      .set('Cookie', owner.cookie)
      .query(params)
      .expect(200);
    assert.equal(exported.text, report.csv.content);
    assert.ok(report.referrers.some((row) => row.name === 'www.google.com'));
    assert.match(exported.text, /www\.google\.com/);
    await api.get('/api/analytics').set('Cookie', other.cookie).query(params).expect(404);
    const narrow = await api
      .get('/api/analytics')
      .set('Cookie', owner.cookie)
      .query({ ...params, from: '2026-01-02T10:00:00Z', to: '2026-01-02T11:00:00Z' })
      .expect(200);
    assert.equal(
      z.object({ data: reportSchema }).parse(narrow.body).data.total,
      1,
      'Explicit end is exclusive'
    );
    await remove(link.id).expect(204);
    const historic = await api
      .get('/api/analytics')
      .set('Cookie', owner.cookie)
      .query(params)
      .expect(200);
    const history = z.object({ data: reportSchema }).parse(historic.body).data;
    assert.equal(history.total, 3);
    assert.equal(history.leaders[0]?.link.status, 'archived');
    const everything = await api
      .get('/api/analytics')
      .set('Cookie', owner.cookie)
      .query({ ...params, source: 'everything' })
      .expect(200);
    assert.equal(z.object({ data: reportSchema }).parse(everything.body).data.total, 3);
    const all = await api
      .get('/api/analytics')
      .set('Cookie', owner.cookie)
      .query({ ...params, source: 'all' })
      .expect(200);
    assert.equal(z.object({ data: reportSchema }).parse(all.body).data.total, 0);
    const archived = await createLink();
    await redirect(archived.slug).expect(302);
    await patch(archived.id, { archived: true }).expect(200);
    const archivedEvent = await db.click.findFirstOrThrow({ where: { linkId: archived.id } });
    await db.click.update({
      where: { id: archivedEvent.id },
      data: { occurredAt: new Date('2026-01-02T10:00:00Z') },
    });
    const allAfterArchive = await api
      .get('/api/analytics')
      .set('Cookie', owner.cookie)
      .query({ ...params, source: 'all' })
      .expect(200);
    const everythingAfterArchive = await api
      .get('/api/analytics')
      .set('Cookie', owner.cookie)
      .query({ ...params, source: 'everything' })
      .expect(200);
    assert.equal(z.object({ data: reportSchema }).parse(allAfterArchive.body).data.total, 0);
    assert.equal(z.object({ data: reportSchema }).parse(everythingAfterArchive.body).data.total, 4);
  });
  it('requires DNS verification, rejects unknown hosts, and scopes proof access', async () => {
    const hostname = `${prefix}.invalid`;
    const added = await api
      .post('/api/domains')
      .set('Origin', origin)
      .set('Cookie', owner.cookie)
      .send({ hostname })
      .expect(201);
    const domain = z
      .object({
        data: z.object({
          hostname: z.string(),
          status: z.literal('pending'),
          proof: z.object({ type: z.literal('TXT'), name: z.string(), value: z.string() }),
        }),
      })
      .parse(added.body).data;
    assert.equal(domain.proof.name, `_linkflow.${hostname}`);
    assert.match(domain.proof.value, /^linkflow-verification=[a-f0-9]{64}$/);
    await api
      .post('/api/domains/verify')
      .set('Origin', origin)
      .set('Cookie', other.cookie)
      .send({ hostname })
      .expect(404);
    await api
      .post('/api/domains/verify')
      .set('Origin', origin)
      .set('Cookie', owner.cookie)
      .send({ hostname })
      .expect(422);
    await api
      .post('/api/links')
      .set('Origin', origin)
      .set('Cookie', owner.cookie)
      .send({ title: 'unverified', destination: 'https://example.com', domain: hostname })
      .expect(400);
    const link = await createLink();
    await api
      .get(`/r/${link.slug}`)
      .set('Host', 'attacker.invalid')
      .set('X-Forwarded-Host', config.defaultDomain)
      .expect(404);
    await api.get(`/${link.slug}`).set('Host', 'attacker.invalid').expect(404);
    const domains = await api.get('/api/domains').set('Cookie', owner.cookie).expect(200);
    assert.ok(JSON.stringify(domains.body).includes(config.defaultDomain));
  });
  it('fails closed without redirect when actual PostgreSQL rejects click persistence', async () => {
    const link = await createLink();
    const name = `test_click_${randomUUID().replaceAll('-', '')}`;
    // An actual database trigger rejects only this test's link; no DB/client mocking or shared shutdown.
    await db.$executeRawUnsafe(
      `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."linkId" = '${link.id}'::uuid THEN RAISE EXCEPTION 'integration click failure'; END IF; RETURN NEW; END $$`
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER "${name}" BEFORE INSERT ON "Click" FOR EACH ROW EXECUTE FUNCTION "${name}"()`
    );
    try {
      const response = await redirect(link.slug).expect(503);
      assert.equal(response.headers.location, undefined);
      assert.equal(errorSchema.parse(response.body).error.code, 'CLICK_RECORDING_FAILED');
      assert.equal(await db.click.count({ where: { linkId: link.id } }), 0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "Click"`);
      await db.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
    }
    await redirect(link.slug).expect(302);
  });
  it('rejects bad inputs/body sizes and documents all actual routes', async () => {
    for (const input of [
      { destination: 'javascript:alert(1)' },
      { destination: 'https://user:secret@example.com' },
      { slug: '../bad' },
      { protected: true },
      { tags: Array(21).fill('x') },
      { unknown: true },
    ]) {
      const response = await api
        .post('/api/links')
        .set('Origin', origin)
        .set('Cookie', owner.cookie)
        .send({
          title: 'Bad',
          destination: 'https://example.com',
          domain: config.defaultDomain,
          ...input,
        })
        .expect(400);
      assert.equal(errorSchema.parse(response.body).error.code, 'VALIDATION_ERROR');
    }
    await api.get('/api/links?pageSize=101').set('Cookie', owner.cookie).expect(400);
    await api.get('/api/links?page=-1').set('Cookie', owner.cookie).expect(400);
    await api
      .patch('/api/links/not-a-uuid')
      .set('Origin', origin)
      .set('Cookie', owner.cookie)
      .send({ title: 'bad' })
      .expect(400);
    await api.get('/api/analytics?days=367').set('Cookie', owner.cookie).expect(400);
    await api
      .get('/api/analytics?from=2026-01-01T00:00:00Z')
      .set('Cookie', owner.cookie)
      .expect(400);
    await api
      .get('/api/analytics?from=2026-01-02T00:00:00Z&to=2026-01-01T00:00:00Z')
      .set('Cookie', owner.cookie)
      .expect(400);
    await api
      .post('/api/links')
      .set('Origin', origin)
      .set('Cookie', owner.cookie)
      .send({ title: 'x'.repeat(40000) })
      .expect(413);
    await api
      .post('/api/auth/login')
      .set('Origin', origin)
      .set('Content-Type', 'application/json')
      .send('{broken')
      .expect(400);
    const spec = await api.get('/api/openapi.json').expect(200);
    const doc = z
      .object({
        openapi: z.literal('3.0.3'),
        paths: z.record(z.string(), z.unknown()),
        components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
      })
      .parse(spec.body);
    for (const path of [
      '/api/auth/login',
      '/api/domains/verify',
      '/api/links/{id}/qr',
      '/api/links/bulk',
      '/api/analytics/export',
      '/r/{slug}',
      '/{slug}',
    ])
      assert.ok(path in doc.paths);
    assert.ok('AnalyticsReport' in doc.components.schemas);
    await api.get('/api/docs/').expect(200);
  });
  it('degrades Redis safely while keeping current database lifecycle and local security limits', async () => {
    const link = await createLink();
    redis.destroy();
    await redirect(link.slug).expect(302);
    await patch(link.id, { archived: true }).expect(200);
    await redirect(link.slug).expect(410);
    // Exercise the actual limiter, not a Redis mock, while the real client is disconnected.
    const express = (await import('express')).default;
    const limited = express();
    limited.get('/', rateLimit(`${prefix}-outage`, 2, 60000), (_req, res) => res.sendStatus(200));
    limited.use(
      (
        error: unknown,
        _req: import('express').Request,
        res: import('express').Response,
        _next: import('express').NextFunction
      ) => {
        void _next;
        if (error instanceof Error && 'status' in error && typeof error.status === 'number')
          res.sendStatus(error.status);
        else res.sendStatus(500);
      }
    );
    await supertest(limited).get('/').expect(200);
    await supertest(limited).get('/').expect(200);
    await supertest(limited).get('/').expect(429);
    assert.notEqual(privateHash('127.0.0.1'), '127.0.0.1');
    await connectRedis();
    assert.equal(await redis.ping(), 'PONG');
  });
});
