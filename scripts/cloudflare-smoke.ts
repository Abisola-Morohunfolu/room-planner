import process from 'node:process';
import { chromium, expect as playwrightExpect } from '@playwright/test';

const expect = playwrightExpect.configure({ timeout: 15000 });
const origin = process.argv[2];
if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://')) {
  throw new Error(
    'Pass the exact HTTPS APP_ORIGIN: pnpm smoke:cloud https://your-worker.workers.dev',
  );
}

const browser = await chromium.launch({ headless: true });
const creator = await browser.newContext();
let share: { shareId: string; url: string; managementToken: string } | undefined;
let revoked = false;
try {
  const health = await creator.request.get(origin + '/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ ok: true });
  expect((await creator.request.get(origin + '/api/config')).status()).toBe(404);
  const foreignOrigin = await creator.request.post(origin + '/api/shares', {
    headers: { Origin: 'https://foreign.example.test' },
    data: {},
  });
  expect(foreignOrigin.status()).toBe(403);

  const page = await creator.newPage();
  await page.goto(origin + '/projects');
  await page.getByRole('button', { name: 'New room', exact: true }).click();
  await page.getByLabel('Room name', { exact: true }).fill('Cloudflare smoke check');
  await page.getByRole('button', { name: 'Start planning →', exact: true }).click();
  await expect(page).toHaveURL(/\/plan\//);
  await page.getByRole('button', { name: 'Share room', exact: true }).click();
  const creation = page.waitForResponse(
    (response) =>
      response.url() === origin + '/api/shares' && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  const created = await creation;
  expect(created.status()).toBe(201);
  share = await created.json();
  if (!share) throw new Error('Share creation returned no data.');
  expect(share.url).toBe(origin + '/share/' + share.shareId);
  await expect(page.getByRole('textbox', { name: 'Public link', exact: true }).first()).toHaveValue(
    share.url,
  );

  const viewerResponse = await creator.request.get(share.url);
  expect(viewerResponse.status()).toBe(200);
  expect(viewerResponse.headers()['cache-control']).toBe('no-store');
  expect(viewerResponse.headers()['referrer-policy']).toBe('no-referrer');
  expect(viewerResponse.headers()['x-robots-tag']).toContain('noindex');
  const snapshot = await creator.request.get(origin + '/api/shares/' + share.shareId);
  expect(snapshot.status()).toBe(200);
  expect(snapshot.headers()['cache-control']).toBe('no-store');
  expect((await snapshot.json()).document.name).toBe('Cloudflare smoke check');

  const recipient = await browser.newContext();
  const view = await recipient.newPage();
  await view.goto(share.url);
  await expect(view.getByText('Shared snapshot · View only')).toBeVisible();
  await expect(view.locator('.floor-plan canvas').first()).toBeVisible();
  await view.getByRole('button', { name: 'Save a copy', exact: true }).click();
  await expect(view).toHaveURL(/\/plan\//);
  await expect(view.getByText('Cloudflare smoke check — copy', { exact: true })).toBeVisible();
  await view.reload();
  await expect(view.getByText('Cloudflare smoke check — copy', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Sharing stopped');
  revoked = true;
  expect((await creator.request.get(origin + '/api/shares/' + share.shareId)).status()).toBe(404);
  await view.goto(share.url);
  await expect(
    view.getByRole('heading', { name: 'This shared room is unavailable.' }),
  ).toBeVisible();
  console.log(
    'PASS: health, cloud gate, origin rejection, create, view, headers, copy/reload, revoke.',
  );
} finally {
  try {
    if (share && !revoked) {
      const cleanup = await creator.request.delete(origin + '/api/shares/' + share.shareId, {
        headers: { Origin: origin, Authorization: 'Bearer ' + share.managementToken },
      });
      expect([204, 404]).toContain(cleanup.status());
    }
  } finally {
    await browser.close();
  }
}
