import {
  env,
  applyD1Migrations,
  SELF,
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeAll, it, expect } from 'vitest';
import { createAuthClient } from 'better-auth/react';
import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuth } from '../../worker/auth';
import worker from '../../worker';
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
it('forwards refreshed and expired session cookies from protected API requests', async () => {
  const { cookie } = await signIn('refresh@example.test');
  const previousExpiry = Date.now() + 5 * 86400000;
  await env.DB.prepare(
    'UPDATE session SET expires_at = ? WHERE user_id = (SELECT id FROM user WHERE email = ?)',
  )
    .bind(previousExpiry, 'refresh@example.test')
    .run();
  const refreshed = await request('/api/projects', cookie);
  expect(refreshed.status).toBe(200);
  expect(refreshed.headers.get('set-cookie')).toContain('better-auth.session_token=');
  expect(refreshed.headers.get('set-cookie')).toContain('Max-Age=604800');
  const session = await env.DB.prepare(
    'SELECT expires_at FROM session WHERE user_id = (SELECT id FROM user WHERE email = ?)',
  )
    .bind('refresh@example.test')
    .first<{ expires_at: number }>();
  expect(session!.expires_at).toBeGreaterThan(previousExpiry);
  await env.DB.prepare(
    'UPDATE session SET expires_at = 0 WHERE user_id = (SELECT id FROM user WHERE email = ?)',
  )
    .bind('refresh@example.test')
    .run();
  const expired = await request('/api/projects', cookie);
  expect(expired.status).toBe(401);
  expect(expired.headers.get('set-cookie')).toContain('Max-Age=0');
});
it('rejects an incomplete sender configuration before storing a sign-in code', async () => {
  const context = createExecutionContext();
  const response = await worker.fetch(
    new Request(origin + '/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'unconfigured@example.test', type: 'sign-in' }),
    }),
    { ...env, EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'sender@example.test', RESEND_API_KEY: '' },
    context,
  );
  await waitOnExecutionContext(context);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: 'email_unavailable' } });
  expect(
    await env.DB.prepare('SELECT id FROM verification WHERE identifier = ?')
      .bind('sign-in-otp-unconfigured@example.test')
      .first(),
  ).toBeNull();
});
it('integrates the React OTP client with HTTP auth, sessions and sign-out', async () => {
  let code = '',
    cookie = '';
  const email = 'client@example.test';
  const auth = createAuth(env, async (_email, otp) => {
    code = otp;
  });
  const client = createAuthClient({
    baseURL: origin,
    plugins: [emailOTPClient()],
    fetchOptions: {
      customFetchImpl: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('origin', origin);
        headers.set('cf-connecting-ip', '192.0.2.1');
        if (cookie) headers.set('cookie', cookie);
        const response = await auth.handler(new Request(input, { ...init, headers }));
        const sessionCookie = response.headers
          .getSetCookie()
          .find((value) => value.startsWith('better-auth.session_token='));
        if (sessionCookie) cookie = sessionCookie.split(';')[0];
        for (const value of response.headers.getSetCookie()) {
          if (value.startsWith('better-auth.session_data=')) expect(value).toContain('Max-Age=0');
        }
        return response;
      },
    },
  });
  expect((await client.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })).error).toBeNull();
  expect(code).toMatch(/^\d{6}$/);
  const signedIn = await client.signIn.emailOtp({ email, otp: code });
  expect(signedIn.error).toBeNull();
  expect(signedIn.data?.user.emailVerified).toBe(true);
  expect((await client.getSession()).data?.user.email).toBe(email);
  expect((await request('/api/auth/get-session', cookie)).headers.get('cache-control')).toBe(
    'no-store',
  );
  expect((await request('/api/projects', cookie)).status).toBe(200);
  const signedInCookie = cookie;
  expect((await client.signOut()).error).toBeNull();
  expect((await client.getSession()).data).toBeNull();
  expect((await request('/api/projects', signedInCookie)).status).toBe(401);
});
it('enforces persisted OTP send limits across concurrent HTTP requests and auth instances', async () => {
  let delivered = 0;
  const responses = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      createAuth(env, async () => {
        delivered++;
      }).handler(
        new Request(origin + '/api/auth/email-otp/send-verification-otp', {
          method: 'POST',
          headers: { origin, 'cf-connecting-ip': '192.0.2.2', 'content-type': 'application/json' },
          body: JSON.stringify({ email: `limit-${index}@example.test`, type: 'sign-in' }),
        }),
      ),
    ),
  );
  expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 200, 429]);
  expect(delivered).toBe(3);
  expect(
    Number(responses.find((response) => response.status === 429)!.headers.get('x-retry-after')),
  ).toBeGreaterThan(0);
  expect(await env.DB.prepare('SELECT count FROM rate_limit WHERE count = 3').first()).toBeTruthy();
});
it('rejects foreign origins and sets protected cookies on HTTPS', async () => {
  const httpsOrigin = 'https://room-planner.example.test';
  let code = '';
  const auth = createAuth({ ...env, APP_ORIGIN: httpsOrigin }, async (_email, otp) => {
    code = otp;
  });
  const email = 'https@example.test';
  const send = (requestOrigin: string) =>
    auth.handler(
      new Request(httpsOrigin + '/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        headers: {
          origin: requestOrigin,
          'cf-connecting-ip': '192.0.2.3',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email, type: 'sign-in' }),
      }),
    );
  expect((await send('https://wrong.test')).status).toBe(403);
  expect(code).toBe('');
  expect((await send(httpsOrigin)).status).toBe(200);
  const result = await auth.handler(
    new Request(httpsOrigin + '/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: {
        origin: httpsOrigin,
        'cf-connecting-ip': '192.0.2.3',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, otp: code }),
    }),
  );
  expect(result.status).toBe(200);
  const cookie = result.headers.get('set-cookie');
  expect(cookie).toContain('__Secure-better-auth.session_token=');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('SameSite=Lax');
  expect(cookie).toContain('Max-Age=604800');
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
