import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const output = 'test-results/visual';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const apiURL = process.env.API_BASE_URL || 'http://localhost:3001/api';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const reports = [];
try {
  for (const [mode, width, height] of [
    ['desktop', 1440, 1000],
    ['mobile', 390, 844],
    ['small-mobile', 320, 740],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const registered = await page.request.post(`${apiURL}/auth/register`, {
      headers: { Origin: baseURL },
      data: {
        name: 'Layout Inspector',
        email: `layout-${randomUUID()}@example.com`,
        password: `Inspect-${randomUUID()}`,
      },
    });
    if (registered.status() !== 201)
      throw new Error(
        `API registration failed (${registered.status()}). Start the API and check its allowed frontend Origin.`
      );
    for (const route of ['dashboard', 'links', 'analytics', 'qr-codes', 'domains', 'settings']) {
      await page.goto(`${baseURL}/${route}`);
      await page.locator('h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const dimensions = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('*')]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.right > innerWidth + 1 && !element.closest('.table-wrap');
          })
          .slice(0, 8)
          .map((element) => ({
            element: element.tagName,
            id: element.id,
            classes: element.className.baseVal ?? element.className,
            text: element.textContent?.slice(0, 70),
            width: Math.round(element.getBoundingClientRect().width),
            position: getComputedStyle(element).position,
            left: element.getBoundingClientRect().left,
          })),
      }));
      reports.push({ mode, route, ...dimensions });
      if (mode !== 'small-mobile')
        await page.screenshot({
          path: `${output}/${route}-${mode}.png`,
          fullPage: true,
          animations: 'disabled',
        });
    }
    await page.close();
  }
  await writeFile(`${output}/layout-report.json`, JSON.stringify(reports, null, 2));
  const failures = reports.filter((report) => report.document > report.viewport);
  console.log(
    JSON.stringify({ layoutsChecked: reports.length, failures, artifacts: output }, null, 2)
  );
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
