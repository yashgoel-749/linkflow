import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { setTimeout } from 'node:timers/promises';

const base = process.env.DOCKER_SMOKE_URL ?? 'http://localhost:8080';
const statePath = process.env.DOCKER_SMOKE_STATE ?? '.local/docker-smoke.json';
const verify = process.argv.includes('--verify');
const deadline = Date.now() + 30000;
while (true) {
  try {
    const ready = await fetch(new URL('/health', base));
    if (ready.ok) break;
  } catch {
    // Container recreation can briefly replace the proxy or database connection.
  }
  assert.ok(Date.now() < deadline, 'Stack did not become ready within 30 seconds');
  await setTimeout(500);
}
let state;
async function request(path, options = {}, status = 200) {
  const response = await fetch(new URL(path, base), {
    redirect: 'manual',
    ...options,
    headers: { Cookie: state?.cookie ?? '', ...options.headers },
  });
  assert.equal(response.status, status, `${path}: ${response.status}`);
  return response;
}
if (verify) {
  state = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(state.base, base, 'Persistence state belongs to another stack');
} else {
  const response = await request(
    '/api/auth/register',
    {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Docker persistence verification',
        email: `docker-${randomUUID()}@example.com`,
        password: randomUUID() + randomUUID(),
        remember: true,
      }),
    },
    201
  );
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  if (base.startsWith('https:')) assert.match(cookie, /; Secure/i);
  else assert.doesNotMatch(cookie, /; Secure/i);
  state = { base, cookie: cookie.split(';')[0] };
  const domains = await (await request('/api/domains')).json();
  const domain = domains.data.find((item) => item.status === 'verified');
  assert.ok(domain);
  const link = await (
    await request(
      '/api/links',
      {
        method: 'POST',
        headers: { Origin: base, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Docker persistence fixture',
          domain: domain.hostname,
          slug: `docker-${randomUUID().slice(0, 12)}`,
          destination: 'https://example.com/docker-persistence',
          tags: ['docker'],
          protected: false,
          expiresAt: null,
        }),
      },
      201
    )
  ).json();
  state.link = link.data;
  for (const ip of ['198.51.100.11', '203.0.113.22']) {
    const redirect = await request(
      new URL(state.link.shortUrl).pathname,
      {
        headers: {
          'X-Forwarded-For': ip,
          'X-Forwarded-Host': 'evil.invalid',
          'User-Agent': 'DockerSmoke/1',
        },
      },
      302
    );
    assert.equal(redirect.headers.get('location'), state.link.destination);
  }
  const report = await (await request(`/api/analytics?source=${state.link.id}`)).json();
  assert.equal(report.data.total, 2);
  assert.equal(report.data.visitors, 1, 'Spoofed forwarded IPs must not create visitors');
  state.minimumClicks = 2;
  await mkdir('.local', { recursive: true });
  await writeFile(statePath, JSON.stringify(state), { mode: 0o600 });
}
await request('/health');
await request('/api/auth/me');
const links = await (await request('/api/links')).json();
assert.ok(links.data.items.some((link) => link.id === state.link.id));
const report = await (await request(`/api/analytics?source=${state.link.id}`)).json();
assert.ok(report.data.total >= state.minimumClicks);
await request(
  '/api/links',
  {
    method: 'POST',
    headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' },
    body: '{}',
  },
  403
);
await new Promise((resolve, reject) => {
  const send = base.startsWith('https:') ? httpsRequest : httpRequest;
  const req = send(
    new URL('/unknown-alias', base),
    {
      servername: new URL(base).hostname,
      headers: { Host: 'unknown.invalid' },
    },
    (res) => {
      res.resume();
      try {
        assert.equal(res.statusCode, 404, 'Unknown Host must reach alias validation, not the SPA');
        resolve();
      } catch (error) {
        reject(error);
      }
    }
  );
  req.on('error', reject);
  req.end();
});
const spa = await request('/settings');
assert.match(await spa.text(), /<div id="root"><\/div>/);
console.log(
  `${verify ? 'Persistence/outage' : 'Initial'} checks passed: auth, links, analytics, Origin, Host, SPA${verify ? '' : ', cookies and proxy spoof rejection'}.`
);
