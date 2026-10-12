import { test, expect, type Page } from '@playwright/test';
import type { ProjectDocument } from '../../src/domain/model';
async function seed(page: Page) {
  await page.goto('/projects');
  return page.evaluate(async () => {
    const modelPath = '/src/domain/model.ts',
      dbPath = '/src/persistence/database.ts';
    const { newProject, newItem, cloneLayout } = await import(modelPath);
    const { database, makeRecord } = await import(dbPath);
    const document = newProject('Snapshot room');
    const table = newItem('dining-rect', 2000, 2000),
      lamp = newItem('floor-lamp', 2000, 2000);
    lamp.supportedById = table.id;
    lamp.heightMm = 500;
    lamp.status = 'to-buy';
    lamp.priceMinor = 12345;
    document.currency = 'GBP';
    document.displayUnits = 'imperial';
    document.layouts[0].items = [table, lamp];
    document.layouts.push(
      cloneLayout(document.layouts[0], 'Layout B'),
      cloneLayout(document.layouts[0], 'Layout C'),
    );
    document.layouts[1].room.floorFinish = 'walnut';
    await database.projects.add(makeRecord(document));
    return document as ProjectDocument;
  });
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const statePath = '/src/state/editor.ts';
    return (await import(statePath)).useEditor.getState().document as ProjectDocument;
  });
}
async function counts(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/persistence/database.ts';
    const { database } = await import(path);
    return { projects: await database.projects.count(), shares: await database.shares.count() };
  });
}
async function link(page: Page, pendingEdit = false) {
  await page.getByRole('button', { name: 'Share room', exact: true }).click();
  let pendingSnapshot: ProjectDocument | undefined;
  if (pendingEdit) {
    pendingSnapshot = await page.evaluate(async () => {
      const path = '/src/state/editor.ts';
      const { useEditor } = await import(path);
      useEditor
        .getState()
        .command('Committed finish awaiting autosave', (document: ProjectDocument) => {
          document.layouts[0].room.wallColours.north = '#aabbcc';
        });
      if (useEditor.getState().saveState !== 'saving') throw new Error('Expected pending autosave');
      // Trigger the real creation handler in the same turn, before the autosave debounce.
      const button = Array.from(document.querySelectorAll('dialog button')).find(
        (button) => button.textContent === 'Create link',
      ) as HTMLButtonElement;
      button.click();
      return useEditor.getState().document as ProjectDocument;
    });
  } else await page.getByRole('button', { name: 'Create link', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Public link', exact: true }).first();
  await expect(input).toBeVisible();
  const url = await input.inputValue();
  return { url, shareId: url.split('/').at(-1)!, pendingSnapshot };
}
async function transition(page: Page, path: string) {
  // A client-side transition exercises the singleton store and outgoing effects.
  await page.evaluate((path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
test('creator committed edits, immutable alternatives, read-only gestures, 3D, independent copy and revoke', async ({
  page,
  browser,
}, info) => {
  const original = await seed(page);
  await page.goto('/plan/' + original.projectId);
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await page.getByLabel('Room width', { exact: true }).fill('21 ft');
  await page.getByLabel('Room width', { exact: true }).press('Enter');
  const { url, shareId, pendingSnapshot } = await link(page, true);
  const sharedResponse = await page.request.get('/api/shares/' + shareId);
  const shared = (await sharedResponse.json()).document as ProjectDocument;
  expect(shared).toEqual(pendingSnapshot);
  expect(shared.layouts).toHaveLength(3);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  // Later edits cannot change the already created snapshot.
  await page.getByLabel('Room width', { exact: true }).fill('20 ft');
  await page.getByLabel('Room width', { exact: true }).press('Enter');
  const edited = await state(page);
  expect(edited.layouts[0].room.widthMm).not.toBe(shared.layouts[0].room.widthMm);
  const recipient = await browser.newContext({ viewport: info.project.use.viewport });
  const view = await recipient.newPage();
  await view.goto(url);
  await expect(view.getByText('Shared snapshot · View only')).toBeVisible();
  const htmlResponse = await page.request.get(
    process.env.PLAYWRIGHT_BASE_URL ? url : 'http://127.0.0.1:8787/share/' + shareId,
  );
  expect(htmlResponse.headers()['referrer-policy']).toBe('no-referrer');
  expect(htmlResponse.headers()['x-robots-tag']).toContain('noindex');
  expect(await counts(view)).toEqual({ projects: 0, shares: 0 });
  expect(await state(view)).toEqual(shared);
  expect(await view.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');
  await expect(view.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await expect(view.getByLabel('Item width')).toHaveCount(0);
  const before = await state(view);
  // Click/drag canvas, keyboard shortcuts and context-menu gestures must remain harmless.
  const canvas = view.locator('.floor-plan canvas').first();
  const bounds = (await canvas.boundingBox())!;
  const scale = Math.max(
    0.001,
    Math.min(
      (bounds.width - 130) / shared.layouts[0].room.widthMm,
      (bounds.height - (bounds.width > 600 ? 210 : 195)) / shared.layouts[0].room.depthMm,
    ),
  );
  const pieceX =
    bounds.x + (bounds.width - shared.layouts[0].room.widthMm * scale) / 2 + 2000 * scale;
  const pieceY =
    bounds.y +
    (bounds.height - shared.layouts[0].room.depthMm * scale) / 2 -
    (bounds.width > 600 ? 5 : 12.5) +
    2000 * scale;
  await view.mouse.click(pieceX, pieceY);
  await expect
    .poll(() =>
      view.evaluate(async () => {
        const path = '/src/state/editor.ts';
        return (await import(path)).useEditor.getState().selection;
      }),
    )
    .toBe(shared.layouts[0].items[1].id);
  await view.mouse.move(pieceX, pieceY);
  await view.mouse.down();
  await view.mouse.move(pieceX + 80, pieceY + 50, {
    steps: 6,
  });
  await view.mouse.up();
  await view.getByRole('region', { name: 'Interactive floor plan' }).focus();
  for (const key of ['Delete', 'Backspace', 'r', 'Control+d', 'Control+z', 'Shift+F10'])
    await view.keyboard.press(key);
  await canvas.click({ button: 'right', position: { x: 150, y: 150 } });
  await expect(view.getByRole('menu')).toHaveCount(0);
  expect(await state(view)).toEqual(before);
  await view.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await view.getByRole('button', { name: 'Point-to-point ruler' }).click();
  await canvas.click({ position: { x: 100, y: 100 } });
  await canvas.click({ position: { x: 180, y: 160 } });
  await view.getByRole('button', { name: 'Cancel', exact: true }).click();
  await view.getByLabel('Active alternative').selectOption({ label: 'Layout B' });
  await expect.poll(async () => (await state(view)).activeLayoutId).toBe(shared.layouts[1].id);
  await view.getByLabel('Active alternative').selectOption({ label: 'Layout C' });
  const expand = view.getByRole('button', { name: 'Expand inspector' });
  if (await expand.isVisible()) await expand.click();
  await expect(view.getByText('£123.45', { exact: false }).first()).toBeVisible();
  await view.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(view.locator('.scene-3d canvas')).toBeVisible();
  await view.getByRole('button', { name: 'Floor plan', exact: true }).click();
  expect(await view.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await view.screenshot({
    path: `docs/screenshots/shared-viewer-${info.project.name}.png`,
    fullPage: true,
  });
  await view.getByRole('button', { name: 'Save a copy', exact: true }).click();
  await expect(view).toHaveURL(/\/plan\//);
  const copy = await state(view);
  expect(copy.projectId).not.toBe(shared.projectId);
  expect(copy.layouts[0].items[1].supportedById).toBe(copy.layouts[0].items[0].id);
  expect(await counts(view)).toEqual({ projects: 1, shares: 0 });
  await view.getByRole('button', { name: 'Room', exact: true }).click();
  await view.getByLabel('Room width', { exact: true }).fill('25 ft');
  await view.getByLabel('Room width', { exact: true }).press('Enter');
  await expect(view.getByRole('status').filter({ hasText: 'Saved on this device' })).toBeVisible();
  const ownCopy = await state(view);
  await view.reload();
  await expect(view.getByText('Snapshot room — copy', { exact: true })).toBeVisible();
  expect(await state(view)).toEqual(ownCopy);
  // Same-ID local room survives shared viewing and outgoing autosave.
  await transition(page, '/share/' + shareId);
  await expect(page.getByText('Shared snapshot · View only')).toBeVisible();
  await page.getByRole('link', { name: 'Go to your rooms' }).click();
  await page.getByRole('button', { name: 'Open room', exact: false }).click();
  await expect(page.getByText('Snapshot room', { exact: true })).toBeVisible();
  await expect.poll(() => state(page)).toEqual(edited);
  await page.getByRole('link', { name: 'Back to your rooms' }).click();
  await page.getByRole('button', { name: 'Move project to Trash' }).click();
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await page.getByRole('button', { name: 'Manage shared links' }).click();
  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Sharing stopped');
  await view.goto(url);
  await expect(
    view.getByRole('heading', { name: 'This shared room is unavailable.' }),
  ).toBeVisible();
  expect(await counts(view)).toEqual({ projects: 1, shares: 0 });
  await recipient.close();
});

test('clipboard fallback, upload/offline/storage/revocation failures are honest and recoverable', async ({
  page,
  context,
}) => {
  const original = await seed(page);
  await page.goto('/plan/' + original.projectId);
  let posts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/shares')) posts++;
  });
  await page.route('**/api/shares', (route) =>
    route.fulfill({ status: 503, json: { error: { message: 'Sharing unavailable for test.' } } }),
  );
  await page.getByRole('button', { name: 'Share room', exact: true }).click();
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sharing unavailable');
  expect(posts).toBe(1);
  expect(await state(page)).toEqual(original);
  await page.unroute('**/api/shares');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('offline');
  expect(posts).toBe(1);
  await context.setOffline(false);
  await page.evaluate(async () => {
    const path = '/src/persistence/database.ts';
    const { database } = await import(path);
    const original = database.shares.add.bind(database.shares);
    database.shares.add = async () => {
      throw new Error('Quota exceeded');
    };
    (window as unknown as { restoreSharing: () => void }).restoreSharing = () => {
      database.shares.add = original;
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Denied');
        },
      },
    });
  });
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Link created, but');
  expect(posts).toBe(2);
  expect((await counts(page)).shares).toBe(0);
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  const fallback = page.getByLabel('Link to copy');
  await expect(fallback).toBeFocused();
  expect(await fallback.inputValue()).toContain('/share/');
  await page.getByRole('button', { name: 'Save management access' }).click();
  expect((await counts(page)).shares).toBe(1);
  await page.route('**/api/shares/*', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 503, json: { error: { message: 'Cannot revoke now.' } } })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot revoke');
  await expect(page.getByRole('button', { name: 'Stop sharing', exact: true })).toBeEnabled();
  await page.unroute('**/api/shares/*');
  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Sharing stopped');
});

test('retryable viewer load, WebGL fallback, failed copy and stale route loads', async ({
  page,
}) => {
  const original = await seed(page);
  await page.goto('/plan/' + original.projectId);
  const { url, shareId } = await link(page);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.route('**/api/shares/*', (route) => route.abort());
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await page.unroute('**/api/shares/*');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Shared snapshot · View only')).toBeVisible();
  await page.evaluate(() => {
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
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Return to floor plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Return to floor plan' }).click();
  await page.evaluate(async () => {
    const path = '/src/persistence/database.ts';
    const { database } = await import(path);
    database.projects.add = async () => {
      throw new Error('Full storage');
    };
  });
  await page.getByRole('button', { name: 'Save a copy', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be saved');
  await expect(page).toHaveURL(url);
  expect((await counts(page)).projects).toBe(1);
  await page.getByRole('link', { name: 'Go to your rooms' }).click();
  await expect(page.getByRole('heading', { name: 'Rooms with possibility.' })).toBeVisible();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/shares/*', async (route) => {
    await pending;
    await route.continue().catch(() => {});
  });
  await transition(page, '/share/' + shareId);
  await expect(page.getByRole('status')).toContainText('Opening shared room');
  await transition(page, '/projects');
  release();
  await expect(page.getByRole('heading', { name: 'Rooms with possibility.' })).toBeVisible();
  await page.getByRole('button', { name: 'Open room', exact: false }).click();
  await page.getByRole('button', { name: 'Room', exact: true }).click();
  await expect(page.getByLabel('Room width', { exact: true })).toBeVisible();
  const readOnly = await page.evaluate(async () => {
    const path = '/src/state/editor.ts';
    return (await import(path)).useEditor.getState().readOnly;
  });
  expect(readOnly).toBe(false);
});
