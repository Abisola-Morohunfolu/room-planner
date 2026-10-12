import {
  env,
  applyD1Migrations,
  SELF,
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, it, expect } from 'vitest';
import worker from '../../worker';
import { newProject, newItem, cloneLayout } from '../../src/domain/model';
import { checkShareLimit } from '../../worker/shares';
const origin = 'http://127.0.0.1:5173';
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
function request(path = '', method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
  return SELF.fetch(origin + '/api/shares' + path, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': crypto.randomUUID(),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function create() {
  const document = newProject('Shared room');
  document.layouts[0].items.push(newItem('dining-rect', 2000, 2000));
  document.layouts.push(cloneLayout(document.layouts[0], 'Second alternative'));
  const response = await request('', 'POST', { document });
  expect(response.status).toBe(201);
  const result = await response.json<{
    shareId: string;
    managementToken: string;
    createdAt: number;
    expiresAt: number;
    url: string;
  }>();
  return { document, result };
}
it('creates anonymously, retrieves all immutable alternatives, hides credentials and rejects writes', async () => {
  const { document, result } = await create();
  expect(result.url).toBe(origin + '/share/' + result.shareId);
  expect(result.url).not.toContain(result.managementToken);
  expect(result.expiresAt - result.createdAt).toBe(30 * 86400000);
  const row = await env.DB.prepare(
    'SELECT management_token_hash FROM shared_snapshots WHERE share_id = ?',
  )
    .bind(result.shareId)
    .first<{ management_token_hash: string }>();
  expect(row!.management_token_hash).not.toBe(result.managementToken);
  document.name = 'Later edit';
  const response = await request('/' + result.shareId);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const body = await response.json<{
    document: typeof document;
    managementToken?: string;
    management_token_hash?: string;
  }>();
  expect(body.document.name).toBe('Shared room');
  expect(body.document.layouts).toHaveLength(2);
  expect(body.managementToken).toBeUndefined();
  expect(body.management_token_hash).toBeUndefined();
  expect((await request('/' + result.shareId, 'PUT', { document })).status).toBe(404);
  expect((await request()).status).toBe(404);
});
it('requires the management token and server confirmation for revocation', async () => {
  const { result } = await create();
  for (const token of ['', 'a'.repeat(64), 'short']) {
    expect(
      (
        await request('/' + result.shareId, 'DELETE', undefined, {
          Authorization: 'Bearer ' + token,
        })
      ).status,
    ).toBe(403);
  }
  expect((await request('/' + result.shareId)).status).toBe(200);
  expect(
    (
      await request('/' + result.shareId, 'DELETE', undefined, {
        Authorization: 'Bearer ' + result.managementToken,
      })
    ).status,
  ).toBe(204);
  const missing = await request('/missing');
  const revoked = await request('/' + result.shareId);
  expect(revoked.status).toBe(404);
  expect((await revoked.json<{ error: unknown }>()).error).toEqual(
    (await missing.json<{ error: unknown }>()).error,
  );
});
it('immediately rejects expiry and cleans at most 100 expired rows per scheduled run', async () => {
  const { result } = await create();
  await env.DB.prepare('UPDATE shared_snapshots SET expires_at = 0 WHERE share_id = ?')
    .bind(result.shareId)
    .run();
  expect((await request('/' + result.shareId)).status).toBe(404);
  await env.DB.batch(
    Array.from({ length: 100 }, (_, index) =>
      env.DB.prepare('INSERT INTO shared_snapshots VALUES (?, ?, 0, 0, ?)').bind(
        'expired-' + index,
        '{}',
        'a'.repeat(64),
      ),
    ),
  );
  const context = createExecutionContext();
  await worker.scheduled({} as ScheduledController, env);
  await waitOnExecutionContext(context);
  expect(
    (await env.DB.prepare(
      'SELECT count(*) AS total FROM shared_snapshots WHERE expires_at = 0',
    ).first<{ total: number }>())!.total,
  ).toBe(1);
  await worker.scheduled({} as ScheduledController, env);
  expect(
    (await env.DB.prepare(
      'SELECT count(*) AS total FROM shared_snapshots WHERE expires_at = 0',
    ).first<{ total: number }>())!.total,
  ).toBe(0);
});
it('validates document limits, bounded input, origin and cloud feature gate', async () => {
  expect((await request('', 'POST', { document: {} })).status).toBe(422);
  const document = newProject();
  document.layouts[0].items = Array.from({ length: 201 }, () => newItem('armchair', 2000, 2000));
  expect((await request('', 'POST', { document })).status).toBe(422);
  expect((await request('', 'POST', { document: 'x'.repeat(1100001) })).status).toBe(413);
  const oversizedDocument = newProject();
  oversizedDocument.layouts[0].room.wallColours = Object.fromEntries(
    Array.from({ length: 28000 }, (_, index) => [
      'wall-' + String(index).padStart(20, '0'),
      '#ffffff',
    ]),
  );
  const bytes = new TextEncoder().encode(JSON.stringify(oversizedDocument)).byteLength;
  expect(bytes).toBeGreaterThan(1048576);
  expect(bytes).toBeLessThan(1100000);
  expect((await request('', 'POST', { document: oversizedDocument })).status).toBe(422);

  for (const badOrigin of ['https://evil.test', ''])
    expect(
      (await request('', 'POST', { document: newProject() }, { Origin: badOrigin })).status,
    ).toBe(403);
  const context = createExecutionContext();
  const disabledEnv = { ...env, ENABLE_CLOUD: 'false' };
  for (const path of ['/api/auth/get-session', '/api/projects', '/api/config']) {
    const response = await worker.fetch(new Request(origin + path), disabledEnv, context);
    expect(response.status).toBe(404);
  }
  const response = await worker.fetch(
    new Request(origin + '/api/shares', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: newProject() }),
    }),
    disabledEnv,
    context,
  );
  expect(response.status).toBe(201);
});
it('throttles anonymous creation with retry guidance using the configured binding', async () => {
  await expect(
    checkShareLimit({ limit: async () => ({ success: false }) }, 'test'),
  ).rejects.toMatchObject({ status: 429 });
  await expect(
    checkShareLimit({ limit: async () => ({ success: true }) }, 'test'),
  ).resolves.toBeUndefined();
  const ip = crypto.randomUUID();
  for (let n = 0; n < 10; n++)
    expect(
      (await request('', 'POST', { document: newProject() }, { 'CF-Connecting-IP': ip })).status,
    ).toBe(201);
  const response = await request(
    '',
    'POST',
    { document: newProject() },
    { 'CF-Connecting-IP': ip },
  );
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
});
