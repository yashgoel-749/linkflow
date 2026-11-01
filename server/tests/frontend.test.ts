import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import request from 'supertest';

const directory = fileURLToPath(new URL('../../dist/', import.meta.url));
Object.assign(process.env, {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1/linkflow_test',
  REDIS_URL: 'redis://127.0.0.1:1',
  JWT_SECRET: 'j'.repeat(32),
  VISITOR_SECRET: 'v'.repeat(32),
  PUBLIC_BASE_URL: 'https://linkflow.example',
  FRONTEND_ORIGIN: 'https://linkflow.example',
  FRONTEND_DIST: directory,
  TRUST_PROXY_HOPS: '1',
});
delete process.env.TRUST_PROXY_IP;
const { app } = await import('../src/app.js');
const index = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');

test('single-service deployment serves the real frontend and deep routes with a self-only script policy', async () => {
  for (const path of ['/', '/login', '/dashboard', '/links', '/settings', '/unknown/deep/route']) {
    const response = await request(app).get(path).set('Host', 'linkflow.example').expect(200);
    assert.equal(response.text, index);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  }
  await request(app).head('/dashboard').set('Host', 'linkflow.example').expect(200);
  const theme = await request(app).get('/theme.js').set('Host', 'linkflow.example').expect(200);
  assert.match(theme.text, /linkflow-theme/);
  const asset = index.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
  assert.ok(asset, 'built frontend must reference its JavaScript asset');
  await request(app).get(asset).set('Host', 'linkflow.example').expect(200);
});

test('SPA fallback does not swallow API errors, redirect errors, assets or unconfigured hosts', async () => {
  for (const path of ['/api/missing', '/assets/missing.js', '/missing.svg']) {
    await request(app).get(path).set('Host', 'linkflow.example').expect(404);
  }
  for (const path of ['/', '/unknown/deep/route', '/r/example']) {
    await request(app).get(path).set('Host', 'unconfigured.example').expect(404);
  }
  await request(app).get('/r/INVALID!').set('Host', 'linkflow.example').expect(400);
  await request(app).post('/dashboard').set('Host', 'linkflow.example').expect(404);
});

test('one-hop proxy mode ignores spoofed leftmost addresses', async () => {
  const server = (await import('express')).default();
  server.set('trust proxy', app.get('trust proxy'));
  server.get('/', (req, res) => res.json({ ip: req.ip }));
  const response = await request(server)
    .get('/')
    .set('X-Forwarded-For', '198.51.100.7, 203.0.113.9')
    .expect(200);
  assert.equal(response.body.ip, '203.0.113.9');
});
