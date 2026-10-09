import { env, applyD1Migrations, SELF } from 'cloudflare:test';
import { beforeAll, it, expect } from 'vitest';
import { createAuth } from '../../worker/auth';
import { newProject, uid } from '../../src/domain/model';
import type { D1Migration } from '@cloudflare/vitest-plugin';
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
const origin = 'http://127.0.0.1:5173';
async function signIn(email: string) {
  let code = '';
  const auth = createAuth(env, async (_email, otp) => {
    code = otp;
  });
  await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  const result = await auth.api.signInEmailOTP({ body: { email, otp: code }, asResponse: true });
  expect(result.status).toBe(200);
  return { auth, code, cookie: result.headers.get('set-cookie')!.split(';')[0] };
}
async function request(path: string, cookie: string, method = 'GET', body?: unknown) {
  return SELF.fetch(origin + path, {
    method,
    headers: { cookie, origin, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
it('runs official auth on D1: hashed code, concurrent consumption, replay, session and revocation', async () => {
  let code = '';
  const auth = createAuth(env, async (_email, otp) => {
    code = otp;
  });
  const email = 'runtime@example.test';
  await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  const stored = await env.DB.prepare('SELECT value FROM verification WHERE identifier = ?')
    .bind('sign-in-otp-' + email)
    .first<{ value: string }>();
  expect(stored?.value).toBeTruthy();
  expect(stored?.value).not.toContain(code);
  const responses = await Promise.all(
    [1, 2].map(() => auth.api.signInEmailOTP({ body: { email, otp: code }, asResponse: true })),
  );
  expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
  expect(
    (await auth.api.signInEmailOTP({ body: { email, otp: code }, asResponse: true })).status,
  ).not.toBe(200);
  const cookie = responses
    .find((r) => r.status === 200)!
    .headers.get('set-cookie')!
    .split(';')[0];
  expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeTruthy();
  await auth.api.signOut({ headers: new Headers({ cookie }) });
  expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
});
it('enforces code expiry and attempts with the pinned plugin', async () => {
  let code = '';
  const auth = createAuth(env, async (_email, otp) => {
    code = otp;
  });
  const email = 'expiry@example.test';
  await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
  await env.DB.prepare('UPDATE verification SET expires_at = 0 WHERE identifier = ?')
    .bind('sign-in-otp-' + email)
    .run();
  expect(
    (await auth.api.signInEmailOTP({ body: { email, otp: code }, asResponse: true })).status,
  ).not.toBe(200);
  const attemptEmail = 'attempt@example.test';
  await auth.api.sendVerificationOTP({ body: { email: attemptEmail, type: 'sign-in' } });
  for (let n = 0; n < 5; n++)
    expect(
      (
        await auth.api.signInEmailOTP({
          body: { email: attemptEmail, otp: code === '000000' ? '999999' : '000000' },
          asResponse: true,
        })
      ).status,
    ).not.toBe(200);
  expect(
    (await auth.api.signInEmailOTP({ body: { email: attemptEmail, otp: code }, asResponse: true }))
      .status,
  ).not.toBe(200);
});
it('enforces ownership, idempotent writes, concurrent CAS, Trash and origin checks', async () => {
  const a = await signIn('owner-a@example.test'),
    b = await signIn('owner-b@example.test'),
    document = newProject(),
    mutationId = uid(),
    payload = { projectId: document.projectId, mutationId, document };
  expect((await request('/api/projects', '')).status).toBe(401);
  const created = await request('/api/projects', a.cookie, 'POST', payload);
  expect(created.status).toBe(201);
  expect(((await created.json()) as { revision: number }).revision).toBe(1);
  expect((await request('/api/projects', a.cookie, 'POST', payload)).status).toBe(200);
  expect((await request('/api/projects/' + document.projectId, b.cookie)).status).toBe(404);
  expect(
    (await request('/api/projects', a.cookie, 'POST', { ...payload, ownerId: 'forged' })).status,
  ).toBe(422);
  const update = {
    baseRevision: 1,
    mutationId: uid(),
    document: { ...document, name: 'Updated room' },
  };
  const simultaneous = await Promise.all([
    request('/api/projects/' + document.projectId, a.cookie, 'PUT', update),
    request('/api/projects/' + document.projectId, a.cookie, 'PUT', {
      ...update,
      mutationId: uid(),
      document: { ...document, name: 'Other update' },
    }),
  ]);
  expect(simultaneous.map((r) => r.status).sort()).toEqual([200, 409]);
  const current = (await (
    await request('/api/projects/' + document.projectId, a.cookie)
  ).json()) as { revision: number; document: typeof document };
  expect(current.revision).toBe(2);
  const edit = { baseRevision: 2, mutationId: uid(), document: current.document };
  expect((await request('/api/projects/' + document.projectId, a.cookie, 'PUT', edit)).status).toBe(
    200,
  );
  expect((await request('/api/projects/' + document.projectId, a.cookie, 'PUT', edit)).status).toBe(
    200,
  );
  expect(
    (
      await request('/api/projects/' + document.projectId, a.cookie, 'PUT', {
        ...edit,
        document: { ...document, name: 'Reused mutation' },
      })
    ).status,
  ).toBe(422);
  const deletion = { baseRevision: 3, mutationId: uid() };
  expect(
    (await request('/api/projects/' + document.projectId, a.cookie, 'DELETE', deletion)).status,
  ).toBe(200);
  expect(
    (await request('/api/projects/' + document.projectId, a.cookie, 'DELETE', deletion)).status,
  ).toBe(200);
  expect(
    (
      await request('/api/projects/' + document.projectId, a.cookie, 'PUT', {
        ...edit,
        baseRevision: 4,
        mutationId: uid(),
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request('/api/projects/' + document.projectId + '/restore', a.cookie, 'POST', {
        baseRevision: 4,
        mutationId: uid(),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await SELF.fetch(origin + '/api/projects', {
        method: 'POST',
        headers: {
          cookie: a.cookie,
          origin: 'https://wrong.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    ).status,
  ).toBe(403);
  expect((await request('/api/unknown', a.cookie)).headers.get('content-type')).toContain(
    'application/json',
  );
});
