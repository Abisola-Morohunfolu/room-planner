import 'fake-indexeddb/auto';
import { afterEach, it, expect, vi } from 'vitest';
import { SyncEngine, uploadGuestProject } from '../../src/sync/engine';
import {
  PlannerDatabase,
  makeRecord,
  projectKey,
  database,
  saveSnapshot,
  LocalConflictError,
} from '../../src/persistence/database';
import { newProject } from '../../src/domain/model';
const stores: PlannerDatabase[] = [];
const engines: SyncEngine[] = [];
afterEach(async () => {
  engines.splice(0).forEach((engine) => engine.dispose());
  await Promise.all(stores.splice(0).map((store) => store.delete()));
  await database.projects.clear();
});
function fixture(request: typeof fetch, online = () => true) {
  const storage = new PlannerDatabase(`sync-test-${crypto.randomUUID()}`);
  const engine = new SyncEngine('account:test', storage, request, online);
  stores.push(storage);
  engines.push(engine);
  return { storage, engine };
}
function accepted(document: ReturnType<typeof newProject>, revision = 1) {
  return Response.json({
    projectId: document.projectId,
    document,
    revision,
    updatedAt: Date.now(),
    deletedAt: null,
  });
}
it('sends Trash after a create acknowledgment and ignores client/server timestamp differences', async () => {
  const document = newProject();
  const request = vi.fn<typeof fetch>(async (_url, init) =>
    init?.method === 'DELETE'
      ? Response.json({
          projectId: document.projectId,
          document,
          revision: 2,
          updatedAt: Date.now(),
          deletedAt: Date.now(),
        })
      : accepted(document),
  );
  const { storage, engine } = fixture(request);
  const record = {
    ...makeRecord(document, 'account:test'),
    generation: 1,
    deletedAt: Date.now() - 5000,
  };
  await storage.projects.add(record);
  await engine.flush(record.key);
  await engine.flush(record.key);
  await engine.flush(record.key);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'DELETE']);
  expect((await storage.projects.get(record.key))!.revision).toBe(2);
});
it('reconciles deletion from another device without discarding new local edits', async () => {
  const document = newProject();
  const request = vi.fn<typeof fetch>(async (url) =>
    String(url).includes('?state=')
      ? Response.json({ projects: [], cursor: null })
      : Response.json({
          projectId: document.projectId,
          document,
          revision: 2,
          updatedAt: Date.now(),
          deletedAt: Date.now(),
        }),
  );
  const { storage, engine } = fixture(request);
  const record = {
    ...makeRecord(document, 'account:test'),
    revision: 1,
    acknowledgedGeneration: 0,
  };
  await storage.projects.add(record);
  await engine.refresh();
  expect((await storage.projects.get(record.key))!.deletedAt).not.toBeNull();
  await storage.projects.update(record.key, { generation: 1, deletedAt: null });
  await engine.refresh();
  expect((await storage.projects.get(record.key))!.deletedAt).toBeNull();
});
it('pauses offline and retries exactly the stored payload after a lost response', async () => {
  let connected = false;
  const bodies: string[] = [];
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    bodies.push(String(init?.body));
    if (bodies.length === 1) throw new TypeError('network interruption');
    return accepted(JSON.parse(bodies[0]).document);
  });
  const { storage, engine } = fixture(request, () => connected),
    record = makeRecord(newProject(), 'account:test');
  await storage.projects.add(record);
  await engine.flush(record.key);
  expect(request).not.toHaveBeenCalled();
  connected = true;
  await engine.flush(record.key);
  const pending = (await storage.projects.get(record.key))!.pendingMutation!;
  await storage.projects.update(record.key, {
    document: { ...record.document, name: 'Newer local edit' },
    generation: 1,
  });
  await engine.flush(record.key);
  expect(bodies[1]).toBe(bodies[0]);
  const saved = (await storage.projects.get(record.key))!;
  expect(saved.acknowledgedGeneration).toBe(pending.generation);
  expect(saved.generation).toBe(1);
  expect(saved.document.name).toBe('Newer local edit');
});
it('serializes in-flight writes and acknowledges only the captured generation', async () => {
  let finish: ((response: Response) => void) | undefined;
  const request = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { storage, engine } = fixture(request),
    record = makeRecord(newProject(), 'account:test');
  await storage.projects.add(record);
  const statuses: string[] = [];
  engine.subscribe((event) => statuses.push(event.status));
  const first = engine.flush(record.key);
  await vi.waitFor(() => expect(finish).toBeDefined());
  await storage.projects.update(record.key, {
    generation: 1,
    document: { ...record.document, name: 'Edited during request' },
  });
  const second = engine.flush(record.key);
  finish!(accepted(record.document));
  await Promise.all([first, second]);
  expect(request).toHaveBeenCalledTimes(1);
  const latest = (await storage.projects.get(record.key))!;
  expect(latest.generation).toBe(1);
  expect(latest.acknowledgedGeneration).toBe(0);
  expect(statuses.at(-1)).toBe('syncing');
});
it('preserves a single recovered copy, then adopts the authoritative cloud original', async () => {
  const local = newProject('Local edited room'),
    cloud = { ...local, name: 'Other device room' };
  const request = vi.fn<typeof fetch>(async (_url, init) =>
    init?.method === 'PUT'
      ? Response.json({ error: { message: 'Conflict' } }, { status: 409 })
      : accepted(cloud, 3),
  );
  const { storage, engine } = fixture(request),
    record = {
      ...makeRecord(local, 'account:test'),
      revision: 1,
      generation: 2,
      acknowledgedGeneration: 1,
    };
  await storage.projects.add(record);
  await engine.flush(record.key);
  const original = (await storage.projects.get(record.key))!,
    recovered = (await storage.projects.get(projectKey('account:test', original.recoveryId!)))!;
  expect(original.document.name).toBe('Other device room');
  expect(recovered.document.layouts).toEqual(expect.any(Array));
  expect(recovered.document.projectId).not.toBe(local.projectId);
  expect(original.revision).toBe(3);
  await engine.flush(record.key);
  expect(await storage.projects.count()).toBe(2);
});
it('keeps the guest original and gives separate accounts separate idempotent upload identities', async () => {
  const request = vi.fn<typeof fetch>(async (_url, init) =>
    accepted(JSON.parse(String(init?.body)).document),
  );
  const { storage, engine } = fixture(request);
  const secondEngine = new SyncEngine('account:other', storage, request, () => true);
  engines.push(secondEngine);
  const guest = makeRecord(newProject());
  await storage.projects.add(guest);
  const first = await uploadGuestProject(guest, 'account:test', engine, storage);
  const retry = await uploadGuestProject(guest, 'account:test', engine, storage);
  const second = await uploadGuestProject(guest, 'account:other', secondEngine, storage);
  expect(first.key).toBe(retry.key);
  expect(second.document.projectId).not.toBe(first.document.projectId);
  expect(await storage.projects.get(guest.key)).toBeDefined();
  expect(request).toHaveBeenCalledTimes(2);
});
it('never overwrites a competing tab and commits a recoverable local copy', async () => {
  const original = newProject('Original');
  await database.projects.add(makeRecord(original));
  await saveSnapshot({ ...original, name: 'First tab' }, 'guest', 1, 0);
  await expect(
    saveSnapshot({ ...original, name: 'Second tab' }, 'guest', 1, 0),
  ).rejects.toBeInstanceOf(LocalConflictError);
  expect(
    (await database.projects.get(projectKey('guest', original.projectId)))!.document.name,
  ).toBe('First tab');
  expect(await database.projects.count()).toBe(2);
});
it('stops authorization retries while retaining pending work', async () => {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ error: { message: 'Sign in again' } }, { status: 401 }),
  );
  const { storage, engine } = fixture(request),
    record = makeRecord(newProject(), 'account:test');
  await storage.projects.add(record);
  const events: string[] = [];
  engine.subscribe((event) => events.push(event.status));
  await engine.flush(record.key);
  expect(events.at(-1)).toBe('session-expired');
  expect((await storage.projects.get(record.key))!.pendingMutation).toBeDefined();
  expect(request).toHaveBeenCalledTimes(1);
});

it('preserves edits committed while the conflicting cloud original is loading', async () => {
  const document = newProject('Local room');
  let finishRefresh: ((response: Response) => void) | undefined;
  const request = vi.fn<typeof fetch>(async (_url, init) =>
    init?.method === 'PUT'
      ? Response.json({ error: { message: 'Conflict' } }, { status: 409 })
      : new Promise((resolve) => {
          finishRefresh = resolve;
        }),
  );
  const { storage, engine } = fixture(request);
  const record = {
    ...makeRecord(document, 'account:test'),
    revision: 1,
    generation: 1,
    acknowledgedGeneration: 0,
  };
  await storage.projects.add(record);
  const saving = engine.flush(record.key);
  await vi.waitFor(() => expect(finishRefresh).toBeDefined());
  await storage.projects.update(record.key, {
    document: {
      ...document,
      layouts: document.layouts.map((layout) => ({
        ...layout,
        room: { ...layout.room, widthMm: 7500 },
      })),
    },
    generation: 2,
  });
  finishRefresh!(accepted({ ...document, name: 'Cloud original' }, 3));
  await saving;
  const original = (await storage.projects.get(record.key))!;
  const recovered = (await storage.projects.get(projectKey('account:test', original.recoveryId!)))!;
  expect(recovered.document.name).toMatch(/^Recovered copy/);
  expect(recovered.generation).toBe(1);
  expect(original.document.name).toBe('Cloud original');
  expect(recovered.document.layouts[0].room.widthMm).toBe(7500);
  expect(original.recoveryGeneration).toBe(2);
  expect(await storage.projects.count()).toBe(2);
});
it('reuses the recovery identity after a failed refresh and preserves the latest room', async () => {
  const document = newProject();
  let refreshAttempts = 0;
  const request = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === 'PUT')
      return Response.json({ error: { message: 'Conflict' } }, { status: 409 });
    refreshAttempts += 1;
    return refreshAttempts === 1
      ? Response.json({ error: { message: 'Unavailable' } }, { status: 503 })
      : accepted(document, 3);
  });
  const { storage, engine } = fixture(request);
  const record = {
    ...makeRecord(document, 'account:test'),
    revision: 1,
    generation: 1,
    acknowledgedGeneration: 0,
  };
  await storage.projects.add(record);
  await engine.flush(record.key);
  const recoveryId = (await storage.projects.get(record.key))!.recoveryId;
  const edited = structuredClone(document);
  edited.layouts[0].room.widthMm = 7000;
  await storage.projects.update(record.key, { document: edited, generation: 2 });
  await engine.flush(record.key);
  expect((await storage.projects.get(record.key))!.recoveryId).toBe(recoveryId);
  const recovered = (await storage.projects.get(projectKey('account:test', recoveryId!)))!;
  expect(recovered.document.layouts[0].room.widthMm).toBe(7000);
  expect(await storage.projects.count()).toBe(2);
});
it('settles a missing cloud original without repeatedly deleting or duplicating recovery', async () => {
  const request = vi.fn<typeof fetch>(async () =>
    Response.json({ error: { message: 'Missing' } }, { status: 404 }),
  );
  const { storage, engine } = fixture(request);
  const record = {
    ...makeRecord(newProject(), 'account:test'),
    revision: 1,
    generation: 1,
    acknowledgedGeneration: 0,
  };
  await storage.projects.add(record);
  await engine.flush(record.key);
  await engine.flush(record.key);
  expect(request).toHaveBeenCalledTimes(2);
  const original = (await storage.projects.get(record.key))!;
  expect(original.deletedAt).toBe(original.cloudDeletedAt);
  expect(original.acknowledgedGeneration).toBe(original.generation);
  expect(original.pendingMutation).toBeUndefined();
  expect(await storage.projects.count()).toBe(2);
});
