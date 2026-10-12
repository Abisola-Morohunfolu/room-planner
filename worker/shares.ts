import { Hono } from 'hono';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { projectSchema } from '../src/domain/model';
import { ApiError, boundedBody } from './api';
import { snapshotStorage } from './snapshot-storage';
const lifetime = 30 * 86400000;
const createSchema = z.object({ document: projectSchema }).strict();
export const shares = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();
function randomSecret(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
async function tokenHash(token: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
const unavailable = () =>
  new ApiError(
    404,
    'share_unavailable',
    'This shared room is unavailable. The link may have expired or sharing may have stopped.',
  );
// Accept a limiter interface to exercise throttling without time-dependent tests.
export async function checkShareLimit(limiter: Pick<Env['SHARE_LIMITER'], 'limit'>, key: string) {
  if (!(await limiter.limit({ key })).success)
    throw new ApiError(
      429,
      'rate_limited',
      'Too many links created. Wait one minute before trying again.',
    );
}
shares.use('*', async (context, next) => {
  context.header('Cache-Control', 'no-store');
  context.header('Referrer-Policy', 'no-referrer');
  context.header('X-Robots-Tag', 'noindex, nofollow');
  if (context.req.method !== 'GET' && context.req.method !== 'HEAD') {
    if (context.req.header('Origin') !== context.env.APP_ORIGIN)
      throw new ApiError(403, 'invalid_origin', 'Request origin is not permitted.');
  }
  if (context.req.method === 'POST') {
    context.header('Retry-After', '60');
    await checkShareLimit(
      context.env.SHARE_LIMITER,
      'create:' + (context.req.header('CF-Connecting-IP') ?? 'local'),
    );
    context.header('Retry-After', undefined);
  }
  await next();
});
shares.post('/', async (context) => {
  const { document } = createSchema.parse(await boundedBody(context.req.raw));
  const shareId = randomSecret(12),
    managementToken = randomSecret(32),
    createdAt = Date.now(),
    expiresAt = createdAt + lifetime;
  await snapshotStorage(context.env.DB).create(
    shareId,
    document,
    createdAt,
    expiresAt,
    await tokenHash(managementToken),
  );
  console.log(JSON.stringify({ event: 'share_created', requestId: context.get('requestId') }));
  return context.json(
    {
      shareId,
      url: new URL('/share/' + shareId, context.env.APP_ORIGIN).href,
      createdAt,
      expiresAt,
      managementToken,
    },
    201,
  );
});
shares.get('/:shareId', async (context) => {
  const row = await snapshotStorage(context.env.DB).get(context.req.param('shareId'), Date.now());
  if (!row) throw unavailable();
  return context.json({
    shareId: row.share_id,
    document: JSON.parse(row.document_json),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  });
});
shares.delete('/:shareId', async (context) => {
  const row = await snapshotStorage(context.env.DB).get(context.req.param('shareId'), Date.now());
  if (!row) throw unavailable();
  const token = context.req.header('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1] ?? '';
  const digest = await tokenHash(token);
  if (
    !timingSafeEqual(
      new TextEncoder().encode(digest),
      new TextEncoder().encode(row.management_token_hash),
    )
  )
    throw new ApiError(
      403,
      'invalid_management_token',
      'This device cannot stop sharing this link.',
    );
  await snapshotStorage(context.env.DB).remove(row.share_id, digest);
  console.log(JSON.stringify({ event: 'share_revoked', requestId: context.get('requestId') }));
  return context.body(null, 204);
});
