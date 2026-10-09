import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('furnished scene, chair/table colours and repeated view switches', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore a furnished example' }).click();
  await expect(page).toHaveURL(/\/plan\//);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: /Dining table/ }).click();
  await page.getByLabel('Item colour').fill('#ad6048');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page
    .getByRole('button', { name: /Dining chair/ })
    .first()
    .click();
  await page.getByLabel('Item colour').fill('#496b82');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Finishes', exact: true }).click();
  await page.getByLabel('north wall colour').fill('#d5d8c7');
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(page.locator('.scene-3d canvas')).toBeVisible();
  if (testInfo.project.name === 'mobile-chromium')
    await page.getByRole('button', { name: 'Collapse inspector' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save this view as PNG' }).click();
  const download = await downloadPromise;
  if (testInfo.project.name === 'desktop-chromium')
    await download.saveAs('public/furnished-room.png');
  expect((await readFile((await download.path())!)).length).toBeGreaterThan(10000);
  await page.screenshot({ path: `docs/screenshots/editor-3d-${testInfo.project.name}.png` });
  for (let index = 0; index < 20; index++) {
    await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Fit room' })).toBeVisible();
    await page.getByRole('button', { name: '3D view', exact: true }).click();
    await expect(page.locator('.scene-3d canvas')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Floor plan', exact: true }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: /Dining table/ }).click();
  await expect(page.getByLabel('Item colour')).toHaveValue('#ad6048');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.screenshot({ path: `docs/screenshots/editor-2d-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
