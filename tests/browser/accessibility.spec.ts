import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('landing, editor, export dialog, project list and sign-in pass automated WCAG checks', async ({
  page,
}) => {
  const violations: unknown[] = [];
  for (const surface of ['landing', 'editor', 'export', 'projects', 'sign-in']) {
    if (surface === 'landing') await page.goto('/');
    if (surface === 'editor') {
      await page.getByRole('button', { name: 'Explore a furnished example' }).click();
      await expect(page.getByRole('button', { name: 'Fit room' })).toBeVisible();
      await page.getByRole('button', { name: 'Room', exact: true }).click();
    }
    if (surface === 'export') await page.getByRole('button', { name: 'Export plan' }).click();
    if (surface === 'projects') {
      await page.getByRole('button', { name: 'Close dialog' }).click();
      await page.getByRole('link', { name: 'Back to your rooms' }).click();
      await expect(page.getByRole('heading', { name: 'Rooms with possibility.' })).toBeVisible();
    }
    if (surface === 'sign-in') {
      await page.getByRole('link', { name: 'Back up online' }).click();
      await expect(page.getByLabel('Email address')).toBeVisible();
    }
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    violations.push(
      ...result.violations.map((violation) => ({
        surface,
        id: violation.id,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      })),
    );
  }
  expect(violations).toEqual([]);
});
