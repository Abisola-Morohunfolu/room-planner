import 'fake-indexeddb/auto';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { newProject, newItem, cloneLayout } from '../../src/domain/model';
import { useEditor } from '../../src/state/editor';
import { database, makeRecord, projectKey } from '../../src/persistence/database';
import { connectAutosave } from '../../src/persistence/autosave';
import {
  saveSharedCopy,
  createManagedShare,
  revokeManagedShare,
} from '../../src/sharing/persistence';
import * as api from '../../src/sharing/api';
beforeEach(async () => {
  await database.projects.clear();
  await database.shares.clear();
  useEditor.getState().reset();
});
afterEach(() => vi.restoreAllMocks());
function stacked() {
  const document = newProject('Stacked snapshot');
  const table = newItem('dining-rect', 2000, 2000),
    piece = newItem('floor-lamp', 2000, 2000);
  piece.supportedById = table.id;
  document.layouts[0].items = [table, piece];
  document.layouts.push(cloneLayout(document.layouts[0], 'Layout B'));
  return document;
}
it('guards every document mutation and switches alternatives without persistence changes', () => {
  const document = stacked();
  useEditor.getState().load(document, true);
  const state = useEditor.getState(),
    id = document.layouts[0].items[0].id;
  state.setPlacement('armchair');
  state.setOpeningPlacement('door');
  expect(
    state.command('Edit', (doc) => {
      doc.name = 'Changed';
    }),
  ).toBe(false);
  state.updateItem(id, { xMm: 1000 });
  state.moveItem(id, 1000, 1000);
  state.stackItem(id, null);
  state.updateOpening('missing', { widthMm: 1000 });
  expect(state.addOpening('door', 'north', 0)).toBe(false);
  state.removeItem(id);
  state.duplicateItem(id);
  state.duplicateLayout();
  state.deleteLayout(document.layouts[0].id);
  state.undo();
  state.redo();
  expect(useEditor.getState().document).toEqual(document);
  state.select(id);
  state.setView('3d');
  state.switchLayout(document.layouts[1].id);
  expect(useEditor.getState()).toMatchObject({
    generation: 0,
    saveState: 'saved',
    history: [],
    future: [],
    placement: null,
    openingPlacement: null,
  });
  expect(document.activeLayoutId).toBe(document.layouts[0].id);
  state.reset();
  state.load(document);
  expect(useEditor.getState().readOnly).toBe(false);
  expect(state.updateItem(id, { xMm: 1800 })).toBe(true);
});
it('copies into guest storage with fresh identifiers and stacked relationships, preserving the original', async () => {
  const document = stacked();
  await database.projects.add(makeRecord(document));
  const id = await saveSharedCopy(document),
    record = await database.projects.get(projectKey('guest', id));
  expect(await database.projects.count()).toBe(2);
  expect((await database.projects.get(projectKey('guest', document.projectId)))!.document).toEqual(
    document,
  );
  for (let index = 0; index < 2; index++) {
    const copy = record!.document.layouts[index];
    expect(copy.id).not.toBe(document.layouts[index].id);
    expect(copy.items[0].id).not.toBe(document.layouts[index].items[0].id);
    expect(copy.items[1].supportedById).toBe(copy.items[0].id);
  }
});
it('outgoing autosave cannot write a read-only snapshot even when its project ID matches', async () => {
  const document = stacked();
  await database.projects.add(makeRecord(document));
  useEditor.getState().load(document);
  const saver = connectAutosave('guest');
  useEditor.getState().command('Original edit', (doc) => {
    doc.name = 'Committed edit';
  });
  const flushed = saver.flush();
  saver.dispose();
  useEditor.getState().load({ ...document, name: 'Shared snapshot' }, true);
  await flushed;
  await saver.flush();
  expect(
    (await database.projects.get(projectKey('guest', document.projectId)))!.document.name,
  ).toBe('Committed edit');
  expect(useEditor.getState().document!.name).toBe('Shared snapshot');
  expect(useEditor.getState().saveState).toBe('saved');
});
it('keeps successful server creation honest on storage failure and never retries creation', async () => {
  const document = stacked();
  const create = vi.spyOn(api, 'createShare').mockResolvedValue({
    shareId: 'a'.repeat(24),
    url: 'https://room.test/share/' + 'a'.repeat(24),
    createdAt: 1,
    expiresAt: 2,
    managementToken: 'b'.repeat(64),
  });
  vi.spyOn(database.shares, 'add').mockRejectedValue(new Error('Quota exceeded'));
  const result = await createManagedShare(document);
  expect(result.saved).toBe(false);
  expect(result.record.managementToken).toHaveLength(64);
  expect(create).toHaveBeenCalledTimes(1);
  const stop = vi.spyOn(api, 'stopShare').mockRejectedValue(new Error('Offline'));
  await expect(revokeManagedShare(result.record)).rejects.toThrow('Offline');
  expect(result.record.revokedAt).toBeNull();
  stop.mockResolvedValue();
  const stopped = await revokeManagedShare(result.record);
  expect(stopped.record.revokedAt).not.toBeNull();
});
it('keeps management records when room records are removed', async () => {
  const document = stacked();
  vi.spyOn(api, 'createShare').mockResolvedValue({
    shareId: 'a'.repeat(24),
    url: 'https://room.test/share/' + 'a'.repeat(24),
    createdAt: 1,
    expiresAt: 2,
    managementToken: 'b'.repeat(64),
  });
  await database.projects.add(makeRecord(document));
  await createManagedShare(document);
  await database.projects.clear();
  expect(await database.shares.count()).toBe(1);
});
