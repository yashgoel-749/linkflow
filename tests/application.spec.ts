import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { z } from 'zod';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const api = process.env.API_BASE_URL || 'http://localhost:3001/api';
const origin = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const password = 'Local-test-password-42!';
const linkSchema = z.object({
  id: z.string(),
  title: z.string(),
  shortUrl: z.string().url(),
  slug: z.string(),
  destination: z.string().url(),
  clicks: z.number(),
});

async function register(request: APIRequestContext, name = 'Browser Tester') {
  const email = `browser-${randomUUID()}@example.com`;
  const response = await request.post(`${api}/auth/register`, {
    headers: { Origin: origin },
    data: { name, email, password, remember: true },
  });
  expect(response.status(), await response.text()).toBe(201);
  return { email, name };
}

async function create(request: APIRequestContext, title: string, options = {}) {
  const domains = await request.get(`${api}/domains`);
  expect(domains.ok()).toBe(true);
  const data = z
    .object({ data: z.array(z.object({ hostname: z.string(), status: z.string() })) })
    .parse(await domains.json());
  const domain = data.data.find((item) => item.status === 'verified');
  if (!domain) throw new Error('The API did not return the configured default redirect domain.');
  const response = await request.post(`${api}/links`, {
    headers: { Origin: origin },
    data: {
      title,
      destination: 'https://example.com/original',
      slug: `test-${randomUUID().slice(0, 12)}`,
      domain: domain.hostname,
      tags: ['launch'],
      protected: false,
      expiresAt: null,
      ...options,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return z.object({ data: linkSchema }).parse(await response.json()).data;
}

async function ready(page: Page, route: string) {
  await page.goto(route);
  await expect(page.locator('h1')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

test('frontend serving does not expose backend environment or local database secrets', async ({
  request,
}) => {
  for (const path of ['/.local/pg-password', '/.local/database.env', '/server/.env']) {
    const response = await request.get(`${origin}${path}`);
    const body = await response.text();
    expect(
      /DATABASE_URL=|JWT_SECRET=|TEST_DATABASE_URL=/.test(body),
      `Secret environment exposed at ${path}`
    ).toBe(false);
    expect(/^[0-9a-f]{48}\s*$/.test(body), `Private database password exposed at ${path}`).toBe(
      false
    );
  }
});

test('anonymous routes require login; signup, persistence, logout and real login work', async ({
  page,
  context,
}) => {
  await page.goto('/links');
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  const email = `ui-${randomUUID()}@example.com`;
  await page.getByLabel(/full name|your name/i).fill('New Member');
  await page.getByLabel('Work Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /create (?:your )?account|create workspace/i }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('h1')).toContainText('New');
  await page.reload();
  await expect(page.locator('h1')).toContainText('New');
  expect((await context.cookies()).some((cookie) => cookie.httpOnly)).toBe(true);
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      cookie: document.cookie,
    })
  );
  expect(storage).not.toContain(password);
  expect(storage).not.toContain('eyJ');
  await page.getByRole('button', { name: /sign out|log out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Work Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Wrong-password-42!');
  await page.getByRole('button', { name: 'Sign in to Dashboard' }).click();
  await expect(page.getByRole('alert')).toContainText(/invalid|incorrect/i);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in to Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test.describe('connected workspace', () => {
  test.beforeEach(async ({ page }) => {
    await register(page.request);
  });

  test('network failures show a retry state rather than demo or fabricated data', async ({
    page,
  }) => {
    await page.route('**/api/auth/me', (route) => route.abort());
    await page.goto('/dashboard');
    await expect(page.getByRole('alert')).toContainText('Cannot reach the server');
    await expect(page.getByText(/welcome back/i)).toHaveCount(0);
    await page.unroute('**/api/auth/me');
    await page.getByRole('button', { name: /retry/i }).click();
    await expect(page.locator('h1')).toContainText('Browser');
  });

  test('Swagger renders and its same-origin login request succeeds', async ({ page }) => {
    const account = await register(page.request, 'Swagger Tester');
    await page.goto(`${api}/docs`);
    await expect(page.locator('.swagger-ui .info .title')).toContainText('LinkFlow');
    const operation = page
      .locator('.opblock-post')
      .filter({ has: page.locator('[data-path$="/auth/login"]') });
    await operation.locator('.opblock-summary').click();
    await operation.getByRole('button', { name: 'Try it out', exact: true }).click();
    await operation
      .locator('textarea')
      .fill(JSON.stringify({ email: account.email, password, remember: true }));
    await operation.getByRole('button', { name: 'Execute', exact: true }).click();
    await expect(
      operation.locator('.live-responses-table tbody .response-col_status')
    ).toContainText('200');
  });

  test('UI creation persists, copies a working redirect and can be edited', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await ready(page, '/links');
    await page.getByRole('button', { name: 'Create Link', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Create a new link', exact: true });
    await form.getByLabel('Link title', { exact: true }).fill('Persistent Campaign');
    await form
      .getByLabel('Destination URL', { exact: true })
      .fill('https://example.com/persistent');
    await form.getByRole('button', { name: 'Create short link', exact: true }).click();
    await expect(form).not.toBeVisible();
    const row = page.getByRole('row').filter({ hasText: 'Persistent Campaign' });
    await expect(row).toBeVisible();
    await page.reload();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /copy short url/i }).click();
    const shortUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(new URL(shortUrl).origin).toBe(new URL(api).origin);
    expect(new URL(shortUrl).pathname).toMatch(/^\/r\//);
    const redirect = await page.request.get(shortUrl, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers().location).toBe('https://example.com/persistent');
    await row.getByRole('button', { name: /edit persistent campaign/i }).click();
    const editor = page.getByRole('dialog', { name: /edit link/i });
    await editor.getByLabel('Link title', { exact: true }).fill('Updated Campaign');
    await editor.getByLabel('Destination URL', { exact: true }).fill('https://example.com/updated');
    await editor.getByRole('button', { name: 'Save link', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: 'Updated Campaign' })).toBeVisible();
    const updated = await page.request.get(shortUrl, { maxRedirects: 0 });
    expect(updated.headers().location).toBe('https://example.com/updated');
  });

  test('actual redirects populate analytics, source/date filters and CSV', async ({ page }) => {
    const link = await create(page.request, 'Tracked Campaign');
    const other = await create(page.request, 'Unvisited Campaign');
    for (let i = 0; i < 3; i += 1) {
      const response = await page.request.get(link.shortUrl, {
        maxRedirects: 0,
        headers: {
          Referer: 'https://news.example.com/article?private=query',
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        },
      });
      expect(response.status()).toBe(302);
    }
    await ready(page, '/analytics');
    const source = page.getByLabel('Analytics link source', { exact: true });
    await source.selectOption(link.id);
    await expect(
      page
        .getByRole('table', { name: 'Selected analytics timeline', exact: true })
        .locator('tbody tr')
    ).toHaveCount(31);
    await expect(page.getByRole('region', { name: 'Unique visitors', exact: true })).toContainText(
      '1'
    );
    await expect(page.getByText('news.example.com', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Analytics timeframe', { exact: true }).selectOption('7');
    await expect(
      page
        .getByRole('table', { name: 'Selected analytics timeline', exact: true })
        .locator('tbody tr')
    ).toHaveCount(7);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV Telemetry', exact: true }).click();
    const path = await (await pending).path();
    if (!path) throw new Error('Analytics export was not saved.');
    const csv = await readFile(path, 'utf8');
    expect(csv).toContain('news.example.com');
    expect(csv).not.toContain('private=query');
    expect(csv).toContain('Tracked Campaign');
    await source.selectOption(other.id);
    await expect(page.getByRole('region', { name: 'Peak click hour', exact: true })).toContainText(
      /no traffic/i
    );
    const apiReport = await page.request.get(`${api}/analytics?days=7&source=${link.id}`);
    const report = z
      .object({
        data: z.object({
          total: z.number(),
          visitors: z.number(),
          channels: z.array(z.object({ count: z.number() })),
        }),
      })
      .parse(await apiReport.json()).data;
    expect(report.total).toBe(3);
    expect(report.visitors).toBe(1);
    expect(report.channels.reduce((sum, item) => sum + item.count, 0)).toBe(3);
  });

  test('search, tag/status filters, pagination, selection and persistent deletion work', async ({
    page,
  }) => {
    for (let index = 1; index <= 7; index += 1) {
      await create(page.request, `Campaign ${index}`, { tags: [index % 2 ? 'odd' : 'even'] });
    }
    await ready(page, '/links');
    const table = page.getByRole('table', { name: 'Managed links', exact: true });
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await page.getByRole('searchbox', { name: 'Search links', exact: true }).fill('Campaign 1');
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table).toContainText('Campaign 1');
    await page.getByRole('searchbox', { name: 'Search links', exact: true }).fill('');
    await page.getByLabel('Filter by campaign tag', { exact: true }).selectOption('even');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await page.getByRole('checkbox', { name: 'Select all visible links', exact: true }).check();
    const selection = page.getByRole('region', { name: 'Selected links', exact: true });
    await selection.getByRole('button', { name: 'Bulk actions', exact: true }).click();
    await page.getByRole('button', { name: 'Archive selected links', exact: true }).click();
    await page.getByLabel('Link status', { exact: true }).selectOption('archived');
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await page.getByRole('button', { name: 'Delete Campaign 2', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Delete links?', exact: true });
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(table).toContainText('Campaign 2');
    await page.getByRole('button', { name: 'Delete Campaign 2', exact: true }).click();
    await confirmation.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await page.reload();
    await page.getByLabel('Link status', { exact: true }).selectOption('archived');
    await expect(table).not.toContainText('Campaign 2');
  });

  test('QR images encode actual URLs and downloads are real SVG/PNG', async ({ page }) => {
    const link = await create(page.request, 'QR Campaign');
    const svg = await page.request.get(`${api}/links/${link.id}/qr?format=svg`);
    expect(svg.status()).toBe(200);
    expect(svg.headers()['content-type']).toContain('image/svg+xml');
    expect(await svg.text()).toContain('<svg');
    const png = await page.request.get(`${api}/links/${link.id}/qr?format=png`);
    expect(png.status()).toBe(200);
    const image = PNG.sync.read(await png.body());
    const decoded = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
    expect(decoded?.data).toBe(link.shortUrl);
    await ready(page, '/links');
    await page.getByRole('button', { name: 'Show QR for QR Campaign', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Link QR code' }).getByRole('img')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Link QR code' })).toContainText(link.shortUrl);
    await page.keyboard.press('Escape');
    await ready(page, '/qr-codes');
    await expect(page.locator('main')).toContainText('QR Campaign');
  });

  test('protected short URLs challenge in the browser and record only successful unlocks', async ({
    page,
  }) => {
    const gatePassword = 'Private-link-password-42!';
    const destination = new URL('/health', api);
    destination.hostname = '127.0.0.1';
    const link = await create(page.request, 'Protected Campaign', {
      protected: true,
      password: gatePassword,
      destination: destination.href,
    });
    const challenge = await page.request.get(link.shortUrl, { maxRedirects: 0 });
    expect(challenge.status()).toBe(401);
    expect((await challenge.text()).includes(link.destination)).toBe(false);
    const wrong = await page.request.post(link.shortUrl, {
      maxRedirects: 0,
      headers: { Origin: new URL(link.shortUrl).origin },
      form: { password: 'Wrong-link-password!' },
    });
    expect(wrong.status()).toBe(403);
    const before = await page.request.get(`${api}/links/${link.id}`);
    expect(z.object({ data: linkSchema }).parse(await before.json()).data.clicks).toBe(0);
    await page.goto(link.shortUrl);
    await page.locator('input[name="password"]').fill(gatePassword);
    await page.locator('button[type="submit"], input[type="submit"]').click();
    await expect(page).toHaveURL(link.destination);
    await expect(page.locator('body')).toContainText('"status":"ok"');
    const after = await page.request.get(`${api}/links/${link.id}`);
    expect(z.object({ data: linkSchema }).parse(await after.json()).data.clicks).toBe(1);
  });

  test('all workspace routes and responsive layouts have no runtime errors or overflow', async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    await create(page.request, 'Layout Campaign');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [1440, 971, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of [
        '/dashboard',
        '/links',
        '/analytics',
        '/qr-codes',
        '/domains',
        '/settings',
      ]) {
        await ready(page, route);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${route} at ${width}`
        ).toBe(true);
        if (width === 1440 || width === 390)
          await page.screenshot({
            path: info.outputPath(`${route.slice(1)}-${width}.png`),
            fullPage: true,
            animations: 'disabled',
          });
      }
    }
    expect(errors).toEqual([]);
  });

  test('profile changes and theme persist on refresh', async ({ page }) => {
    await ready(page, '/settings');
    await page.getByLabel(/full name|display name/i).fill('Updated Member');
    await page.getByRole('button', { name: /save changes|save profile/i }).click();
    await page.reload();
    await expect(page.getByLabel(/full name|display name/i)).toHaveValue('Updated Member');
    await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('a delayed profile response cannot restore a logged-out session', async ({ page }) => {
    let release = () => {};
    let saved = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const committed = new Promise<void>((resolve) => {
      saved = resolve;
    });
    await page.route('**/api/auth/me', async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      saved();
      await gate;
      await route.fulfill({ response });
    });
    await ready(page, '/settings');
    await page.getByLabel('Full name', { exact: true }).fill('Delayed Member');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    try {
      await committed;
      await page.getByRole('button', { name: 'Log out', exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      const staleRequests: string[] = [];
      page.on('request', (request) => {
        if (/\/api\/(links|domains)(?:[/?]|$)/.test(request.url()))
          staleRequests.push(request.url());
      });
      release();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
      expect(staleRequests).toEqual([]);
    } finally {
      release();
    }
  });

  test('a revoked session on profile PATCH clears authenticated workspace state', async ({
    page,
  }) => {
    await ready(page, '/settings');
    const revoked = await page.request.post(`${api}/auth/logout`, { headers: { Origin: origin } });
    expect(revoked.status()).toBe(204);
    await page.getByLabel('Full name', { exact: true }).fill('Revoked Member');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('heading', { name: 'Workspace Settings', exact: true })
    ).toHaveCount(0);
  });
});
