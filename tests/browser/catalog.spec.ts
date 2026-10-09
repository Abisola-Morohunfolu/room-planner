import { test, expect } from '@playwright/test';

test('places consoles, appliances and glass tables, saves finishes and renders in 3D', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Plan your room', exact: true }).click();
  await page.getByLabel('Room name').fill('Home catalog');
  await page.getByRole('button', { name: 'Start planning' }).click();
  await page.getByRole('button', { name: 'Furniture', exact: true }).click();
  await page.getByRole('combobox', { name: 'Category' }).selectOption('Appliances');
  await expect(page.locator('.catalog-item')).toHaveCount(13);
  await page.getByLabel('Search furniture').fill('  washing  ');
  await expect(page.locator('.catalog-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Place Washing machine', exact: true }).click();
  await page.getByRole('button', { name: 'Place in centre' }).click();
  await expect(page.getByRole('combobox', { name: 'Finish', exact: true })).toHaveValue('metal');
  await page.getByLabel('Position X').fill('3200');
  await page.getByLabel('Position X').press('Enter');
  await page.getByLabel('Position Y').fill('1000');
  await page.getByLabel('Position Y').press('Enter');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('combobox', { name: 'Category' }).selectOption('Storage');
  await page.getByLabel('Search furniture').fill('TV console');
  await expect(page.locator('.catalog-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Place TV console', exact: true }).click();
  await page.getByRole('button', { name: 'Place in centre' }).click();
  await page.getByLabel('Position Y').fill('700');
  await page.getByLabel('Position Y').press('Enter');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('combobox', { name: 'Category' }).selectOption('Tables');
  await page.getByLabel('Search furniture').fill('glass');
  await expect(page.locator('.catalog-item')).toHaveCount(5);
  await page
    .getByRole('button', { name: 'Place Glass coffee table', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `.impeccable/review/catalog-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Place Glass coffee table', exact: true }).click();
  await page.getByRole('button', { name: 'Place in centre' }).click();
  await expect(page.getByRole('combobox', { name: 'Finish', exact: true })).toHaveValue('glass');
  await page.getByLabel('Item width').fill('1200');
  await page.getByLabel('Item width').press('Enter');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page
    .getByRole('button', { name: /Glass coffee table.*1200|Glass coffee table.*1\.2/ })
    .click();
  await expect(page.getByRole('combobox', { name: 'Finish', exact: true })).toHaveValue('glass');
  await expect(page.getByLabel('Item width')).toHaveValue('1200 mm');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(page.locator('.scene-3d canvas')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save this view as PNG' }).click();
  await (await download).saveAs(`.impeccable/review/home-3d-${testInfo.project.name}.png`);
  await page.screenshot({
    path: `.impeccable/review/scene-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
