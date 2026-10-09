import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
test('complete keyboard/numeric journey, independent alternative, reload, colours, exports and Trash', async ({
  page,
}, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Plan your room', exact: true }).click();
  await page.getByLabel('Room name').fill('Living room test');
  await page.getByLabel('Room name').press('Tab');
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page).toHaveURL(/\/plan\//);
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await page.getByLabel('Room width', { exact: true }).fill('5000');
  await page.getByLabel('Room width', { exact: true }).press('Enter');
  await page.getByRole('button', { name: '+ Door', exact: true }).click();
  await page.getByLabel('New opening wall').selectOption('north');
  await page.getByRole('button', { name: 'Place door', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: '+ Window', exact: true }).click();
  await page.getByLabel('New opening wall').selectOption('east');
  await page.getByRole('button', { name: 'Place window', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Furniture', exact: true }).click();
  await page.getByRole('button', { name: 'Place Three-seat sofa', exact: true }).click();
  await page.getByRole('button', { name: 'Place in centre' }).click();
  await expect(page.getByLabel('Item width')).toHaveValue('2200 mm');
  await page.getByLabel('Position X').fill('1500');
  await page.getByLabel('Position X').press('Enter');
  await page.getByLabel('Item colour').fill('#aa7755');
  await page.getByLabel('Purchase status').selectOption('to-buy');
  await page.getByLabel('Price (USD)').fill('899');
  await page.getByLabel('Price (USD)').press('Enter');
  await page.getByRole('button', { name: 'Use USD for this estimate' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate alternative', exact: true }).click();
  await expect(page.getByLabel('Active alternative')).toHaveValue(/.+/);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: /Three-seat sofa.*2200|Three-seat sofa.*2\.2/ }).click();
  await page.getByLabel('Position X').fill('2500');
  await page.getByLabel('Position X').press('Enter');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByLabel('Active alternative').selectOption({ label: 'Layout A' });
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: /Three-seat sofa.*2200|Three-seat sofa.*2\.2/ }).click();
  await expect(page.getByLabel('Position X')).toHaveValue('1500 mm');
  await expect(page.getByLabel('Item colour')).toHaveValue('#aa7755');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Finishes', exact: true }).click();
  await page.getByLabel('north wall colour').fill('#aabbcc');
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Finishes', exact: true }).click();
  await expect(page.getByLabel('north wall colour')).toHaveValue('#aabbcc');
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save this view as PNG' })).toBeVisible();
  await expect(page.locator('.scene-3d canvas')).toBeVisible();
  if (testInfo.project.name === 'desktop-chromium') {
    await page.locator('.scene-3d canvas').screenshot({ path: 'docs/screenshots/scene-3d.png' });
  }
  const sceneDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save this view as PNG' }).click();
  const sceneDownload = await sceneDownloadPromise;
  expect(sceneDownload.suggestedFilename()).toBe('room-view.png');
  const imagePath = await sceneDownload.path();
  expect((await readFile(imagePath!)).length).toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
  await page.getByRole('button', { name: 'Export plan' }).click();
  let restorablePath = '';
  for (const name of [
    'Dimensioned PDF',
    'Floor-plan PNG',
    'Furniture CSV',
    'Restorable plan file',
  ]) {
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: new RegExp(name) }).click();
    const download = await downloadPromise,
      path = (await download.path())!;
    const bytes = await readFile(path);
    expect(bytes.length).toBeGreaterThan(50);
    if (name === 'Dimensioned PDF') expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    if (name === 'Restorable plan file') restorablePath = path;
  }
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: 'Back to your rooms' }).click();
  await page.locator('input[type=file]').setInputFiles(restorablePath);
  await expect(page).toHaveURL(/\/plan\//);
  await expect(page.getByText('Living room test — imported', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to your rooms' }).click();
  await page.getByRole('button', { name: 'Move project to Trash' }).first().click();
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await page.getByRole('button', { name: 'Restore project' }).click();
  await page.getByRole('button', { name: 'Your rooms', exact: true }).click();
  await expect(page.locator('.project-card')).toHaveCount(2);
  expect(runtimeErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: `docs/screenshots/projects-${testInfo.project.name}.png`,
    fullPage: true,
  });
});
test('3D failure keeps the local planner available', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      contextId: string,
      ...args: unknown[]
    ) {
      if (contextId.includes('webgl')) return null;
      return Reflect.apply(original, this, [contextId, ...args]);
    } as typeof original;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore a furnished example' }).click();
  await expect(page).toHaveURL(/\/plan\//);
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Return to floor plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Return to floor plan' }).click();
  await expect(page.getByRole('button', { name: 'Fit room' })).toBeVisible();
});
