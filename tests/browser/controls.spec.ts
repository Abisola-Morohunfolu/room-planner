import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function planPoint(page: Page, x: number, y: number) {
  const bounds = await page.locator('.floor-plan canvas').first().boundingBox();
  if (!bounds) throw new Error('Floor plan is unavailable');
  const scale = Math.max(
    0.001,
    Math.min(
      (bounds.width - 130) / 4000,
      (bounds.height - (bounds.width > 600 ? 210 : 195)) / 5000,
    ),
  );
  return {
    x: bounds.x + (bounds.width - 4000 * scale) / 2 + x * scale,
    y: bounds.y + (bounds.height - 5000 * scale) / 2 - (bounds.width > 600 ? 5 : 12.5) + y * scale,
    scale,
  };
}
async function tapPlan(page: Page, x: number, y: number) {
  await page.getByRole('button', { name: 'Fit room', exact: true }).click();
  const point = await planPoint(page, x, y);
  if (test.info().project.name === 'mobile-chromium') await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}
async function dragPlan(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  if (test.info().project.name === 'mobile-chromium') {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let step = 1; step <= 12; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: from.x + ((to.x - from.x) * step) / 12, y: from.y + ((to.y - from.y) * step) / 12 },
        ],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
    return;
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test('single-wall openings, direct plan editing, dragging and chair rotation', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.brand sup')).toHaveCount(0);
  await expect(page.getByText(/Free beta/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Plan your room', exact: true }).click();
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page.getByRole('button', { name: 'Fit room', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await page.getByRole('button', { name: '+ Door', exact: true }).click();
  await page.getByLabel('New opening wall').selectOption('east');
  await page.getByLabel('New opening offset').fill('700');
  await page.getByLabel('New opening offset').press('Enter');
  await page.getByRole('button', { name: 'Place door', exact: true }).click();
  await expect(page.getByLabel('Opening wall')).toHaveValue('east');
  await expect(page.getByLabel('Offset from wall start')).toHaveValue('700 mm');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.opening-list button')).toHaveCount(1);
  await page.getByRole('button', { name: '+ Window', exact: true }).click();
  await page.getByLabel('New opening wall').selectOption('west');
  await page.getByRole('button', { name: 'Place window', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.opening-list button')).toHaveCount(2);

  await tapPlan(page, 2000, 0);
  await expect(page.getByRole('heading', { name: 'north wall', exact: true })).toBeVisible();
  await page.getByLabel('Selected wall colour').fill('#aabbcc');
  await page.getByRole('button', { name: '+ Window', exact: true }).click();
  await expect(page.getByLabel('New opening wall')).toHaveValue('north');
  await tapPlan(page, 2000, 0);
  await expect(page.getByLabel('Opening wall')).toHaveValue('north');
  await expect(page.getByLabel('Offset from wall start')).toHaveValue('1550 mm');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.opening-list button')).toHaveCount(3);
  await tapPlan(page, 2000, 0);
  await expect(page.getByLabel('Opening wall')).toHaveValue('north');
  const openingFrom = await planPoint(page, 2000, 0);
  const openingTo = await planPoint(page, 2400, 0);
  await dragPlan(page, openingFrom, openingTo);
  await expect
    .poll(async () =>
      Math.abs(
        Number((await page.getByLabel('Offset from wall start').inputValue()).replace(' mm', '')) -
          1950,
      ),
    )
    .toBeLessThanOrEqual(2 / openingFrom.scale);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await tapPlan(page, 2000, 0);
  await expect(page.getByLabel('Offset from wall start')).toHaveValue('1550 mm');
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await tapPlan(page, 2000, 2500);
  await expect(page.getByRole('heading', { name: 'Floor', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'walnut', exact: true }).click();
  await expect(page.getByRole('button', { name: 'walnut', exact: true })).toHaveClass('is-active');
  await page.getByRole('button', { name: '+ Furniture', exact: true }).click();
  await page.getByRole('button', { name: 'Place Dining chair', exact: true }).click();
  await tapPlan(page, 2000, 2500);
  await expect(page.getByLabel('Item name')).toHaveValue('Dining chair');
  await page.getByRole('button', { name: 'Turn left 15 degrees', exact: true }).click();
  await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('345');
  await page.getByRole('button', { name: 'Turn right 15 degrees', exact: true }).click();
  await page.getByRole('button', { name: 'Turn 90 degrees', exact: true }).click();
  await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('90');
  await page.getByRole('button', { name: 'Turn right 15 degrees', exact: true }).press('r');
  await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('105');
  await page.getByRole('button', { name: 'Turn right 15 degrees', exact: true }).press('Shift+r');
  await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('90');
  await page.getByLabel('Rotation', { exact: true }).fill('0');
  await page.getByLabel('Rotation', { exact: true }).press('Enter');
  const centre = await planPoint(page, 2000, 2500);
  const radius = 260 * centre.scale + 32;
  await dragPlan(
    page,
    { x: centre.x, y: centre.y - radius },
    { x: centre.x + radius, y: centre.y },
  );
  await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('90');
  const violations = (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  ).violations;
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `docs/screenshots/controls-${testInfo.project.name}.png` });
});

test('context menu adds elements at the clicked spot and edits, copies and removes selections', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Plan your room', exact: true }).click();
  await page.getByRole('button', { name: 'Start planning' }).click();
  await expect(page.getByRole('button', { name: 'Fit room', exact: true })).toBeVisible();
  const rightClickPlan = async (x: number, y: number) => {
    await page.getByRole('button', { name: 'Fit room', exact: true }).click();
    const point = await planPoint(page, x, y);
    await page.mouse.click(point.x, point.y, { button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
  };
  await rightClickPlan(2000, 0);
  await page.getByRole('menuitem', { name: 'Add door here', exact: true }).click();
  await expect(page.getByLabel('Opening wall')).toHaveValue('north');
  await expect(page.getByLabel('Offset from wall start')).toHaveValue('1550 mm');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.opening-list button')).toHaveCount(1);
  await rightClickPlan(2000, 5000);
  await page.getByRole('menuitem', { name: 'Add window here', exact: true }).click();
  await expect(page.getByLabel('Opening wall')).toHaveValue('south');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.opening-list button')).toHaveCount(2);
  await rightClickPlan(2000, 0);
  await expect(page.getByRole('menuitem', { name: 'Add door here' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Remove opening', exact: true }).click();
  await expect(page.locator('.opening-list button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.opening-list button')).toHaveCount(2);
  await rightClickPlan(2000, 2500);
  await page.getByRole('menuitem', { name: 'Add furniture here', exact: true }).click();
  await page.getByLabel('Find furniture to add here').fill('Dining chair');
  await page.getByRole('menuitem', { name: 'Dining chair', exact: true }).click();
  await expect(page.getByLabel('Item name')).toHaveValue('Dining chair');
  await expect(page.getByLabel('Position X')).toHaveValue('2000 mm');
  await expect(page.getByLabel('Position Y')).toHaveValue('2500 mm');
  await rightClickPlan(2000, 2500);
  await page.getByRole('menuitem', { name: 'Turn right 15°', exact: true }).click();
  await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('15');
  await rightClickPlan(2000, 2500);
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await expect(page.locator('.sidebar-footer')).toContainText('2 / 200 pieces');
  await rightClickPlan(2100, 2600);
  await page.getByRole('menuitem', { name: 'Remove furniture', exact: true }).click();
  await expect(page.locator('.sidebar-footer')).toContainText('1 / 200 pieces');
  await page.locator('.floor-plan').press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
  await page
    .getByRole('menuitem', { name: 'Edit finishes & details', exact: true })
    .press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await rightClickPlan(2000, 2500);
  const menuBounds = await page.getByRole('menu').boundingBox();
  expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds!.y).toBeGreaterThanOrEqual(0);
  expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const violations = (
    await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
  ).violations;
  expect(violations).toEqual([]);
  await page.screenshot({ path: `docs/screenshots/context-menu-${testInfo.project.name}.png` });
});
