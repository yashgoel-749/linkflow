import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { config } from '../src/config.js';

// Explicit opt-in: this check stops only the project's native Windows Redis.
assert.equal(
  process.argv.includes('--stop-project-redis'),
  true,
  'Pass --stop-project-redis to opt in.'
);
assert.equal(config.NODE_ENV, 'development');
assert.equal(config.REDIS_URL, 'redis://127.0.0.1:6379');
assert.equal(config.publicOrigin, 'http://localhost:3001');
const directory = resolve('../.local/redis/Redis-8.10.3-Windows-x64-msys2');
const executable = resolve(directory, 'redis-server.exe');
const actual = execFileSync(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    '(Get-Process -Id (Get-NetTCPConnection -LocalPort 6379 -State Listen | Select-Object -First 1).OwningProcess).Path',
  ],
  { encoding: 'utf8' }
).trim();
assert.equal(
  actual.toLowerCase(),
  executable.toLowerCase(),
  'Refusing to stop a Redis process outside this project.'
);
const base = `${config.publicOrigin}/api`;
const account = await fetch(`${base}/auth/register`, {
  method: 'POST',
  headers: { Origin: config.publicOrigin, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Redis Outage Check',
    email: `outage-${randomUUID()}@example.com`,
    password: randomUUID(),
  }),
});
assert.equal(account.status, 201);
const cookie = account.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie);
const headers = { Cookie: cookie, Origin: config.publicOrigin, 'Content-Type': 'application/json' };
const created = await fetch(`${base}/links`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    title: 'Outage verification',
    destination: 'https://example.com/outage',
    domain: config.defaultDomain,
    slug: '',
    tags: [],
    protected: false,
    expiresAt: null,
  }),
});
assert.equal(created.status, 201);
const link = z
  .object({ data: z.object({ id: z.string(), shortUrl: z.string() }) })
  .parse(await created.json()).data;
assert.equal((await fetch(link.shortUrl, { redirect: 'manual' })).status, 302);
try {
  execFileSync(resolve(directory, 'redis-cli.exe'), [
    '-h',
    '127.0.0.1',
    '-p',
    '6379',
    'shutdown',
    'nosave',
  ]);
  const during = await fetch(link.shortUrl, { redirect: 'manual' });
  assert.equal(during.status, 302);
  assert.equal(during.headers.get('location'), 'https://example.com/outage');
  const archived = await fetch(`${base}/links/${link.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ archived: true }),
  });
  assert.equal(archived.status, 200);
  assert.equal((await fetch(link.shortUrl, { redirect: 'manual' })).status, 410);
} finally {
  const process = spawn(
    executable,
    ['--bind', '127.0.0.1', '--port', '6379', '--appendonly', 'no'],
    { cwd: directory, detached: true, stdio: 'ignore' }
  );
  if (process.pid) writeFileSync(resolve('../.local/redis.pid'), String(process.pid));
  process.unref();
}
let recovered = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    recovered =
      execFileSync(resolve(directory, 'redis-cli.exe'), ['ping'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() === 'PONG';
  } catch {
    /* Wait for native startup. */
  }
  if (recovered) break;
  await setTimeout(100);
}
assert.ok(recovered, 'Redis did not recover. Run npm run services:start.');
assert.equal((await fetch(link.shortUrl, { redirect: 'manual' })).status, 410);
const detail = await fetch(`${base}/links/${link.id}`, { headers });
assert.equal(
  z.object({ data: z.object({ clicks: z.number() }) }).parse(await detail.json()).data.clicks,
  2
);
assert.equal((await fetch(`${base}/links/${link.id}`, { method: 'DELETE', headers })).status, 204);
console.log(
  'Verified running API: Redis outage redirects persisted, archived links stayed disabled, Redis recovered, exactly two clicks recorded.'
);
