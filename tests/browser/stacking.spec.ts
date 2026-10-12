import { test, expect } from '@playwright/test';

test('stacks a television, keeps it with its console, and saves both couch variants', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Plan your room', exact: true }).click();
  await page.getByLabel('Room name').fill('Stacked living room');
  await page.getByRole('button', { name: 'Start planning' }).click();
  await page.getByRole('button', { name: 'Furniture', exact: true }).click();
  await page.getByLabel('Search furniture').fill('TV console');
  await page.getByRole('button', { name: 'Place TV console', exact: true }).click();
  await page.getByRole('button', { name: 'Place in centre' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByLabel('Search furniture').fill('television');
  await page.getByRole('button', { name: 'Place Television with stand', exact: true }).click();
  await page.getByRole('button', { name: 'Place in centre' }).click();
  const placedOn = page.getByRole('combobox', { name: 'Place on', exact: true });
  await expect(placedOn.locator('option:checked')).toHaveText('TV console');
  await expect(page.getByText(/On TV console.*550 mm above floor/)).toBeVisible();
  await placedOn.selectOption('');
  await expect(page.getByLabel('Height above floor')).toHaveValue('0 mm');
  await placedOn.selectOption({ label: 'TV console' });
  await page.screenshot({
    path: `.impeccable/review/stacking-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: /^TV console/ }).click();
  await page.getByLabel('Position X').fill('1700');
  await page.getByLabel('Position X').press('Enter');
  await page.getByRole('button', { name: 'Rotate selected item 90 degrees', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: /^Television with stand/ }).click();
  await expect(page.getByLabel('Position X')).toHaveValue('1700 mm');
  await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('90');
  await expect(placedOn.locator('option:checked')).toHaveText('TV console');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Furniture', exact: true }).click();
  await page.getByLabel('Search furniture').fill('L-shaped couch');
  await expect(page.locator('.catalog-item')).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Place L-shaped couch · left chaise', exact: true })
    .click();
  await page.getByRole('button', { name: 'Place in centre' }).click();
  await page.getByLabel('Position Y').fill('3900');
  await page.getByLabel('Position Y').press('Enter');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page
    .getByRole('button', { name: 'Place L-shaped couch · right chaise', exact: true })
    .click();
  await page.getByRole('button', { name: 'Place in centre' }).click();
  await page.getByLabel('Position Y').fill('1000');
  await page.getByLabel('Position Y').press('Enter');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: /^Television with stand/ }).click();
  await expect(placedOn.locator('option:checked')).toHaveText('TV console');
  await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('90');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: /^L-shaped couch · left chaise/ }).click();
  await expect(page.getByLabel('Item depth')).toHaveValue('1700 mm');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.screenshot({
    path: `.impeccable/review/couches-2d-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(page.locator('.scene-3d canvas')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save this view as PNG' }).click();
  await (await download).saveAs(`.impeccable/review/stacked-room-3d-${testInfo.project.name}.png`);
  await page.screenshot({
    path: `.impeccable/review/couches-3d-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
