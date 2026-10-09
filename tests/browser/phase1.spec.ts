import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('device planning, backup files and Trash work without any API requests', async ({
  page,
}, testInfo) => {
  const apiRequests: string[] = [];
  const runtimeErrors: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.route('**/api/**', (route) => route.abort());

  await page.goto('/');
  await page.getByRole('button', { name: 'Plan your room', exact: true }).click();
  await page.getByLabel('Room name').fill('Phase 1 room');
  await page.getByLabel('Room name').press('Tab');
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page).toHaveURL(/\/plan\//);
  await expect(page.getByRole('link', { name: /Back up online|Account/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await page.getByLabel('Room width', { exact: true }).fill('6400');
  await page.getByLabel('Room width', { exact: true }).press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await expect(page.getByLabel('Room width', { exact: true })).toHaveValue('6400 mm');
  await page.screenshot({ path: testInfo.outputPath('phase1-editor.png'), fullPage: true });

  await page.getByRole('link', { name: 'Back to your rooms' }).click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Back up online|Account/ })).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Plan file', exact: true }).click();
  const downloadPath = (await (await downloadPromise).path())!;
  const backup = JSON.parse(await readFile(downloadPath, 'utf8'));
  expect(backup.document.name).toBe('Phase 1 room');
  expect(backup.document.layouts[0].room.widthMm).toBe(6400);
  await page.getByRole('button', { name: 'Move project to Trash' }).click();
  await expect(page.locator('.project-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await page.getByRole('button', { name: 'Restore project' }).click();
  await page.getByRole('button', { name: 'Your rooms', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  await page.locator('input[type=file]').setInputFiles(downloadPath);
  await expect(page).toHaveURL(/\/plan\//);
  await expect(page.getByText('Phase 1 room — imported', { exact: true })).toBeVisible();

  await page.goto('/sign-in?returnTo=/projects');
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByLabel('Email address')).toHaveCount(0);
  await expect(page.locator('.project-card')).toHaveCount(2);
  await expect(
    page.getByText('Download a plan file to back up a room', { exact: false }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(apiRequests).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('phase1-projects.png'), fullPage: true });
});
