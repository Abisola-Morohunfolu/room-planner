import { emailConfigured } from './email';
import { Hono } from 'hono';
import { z } from 'zod';
import { createAuth } from './auth';
import { projectSchema, type ProjectDocument } from '../src/domain/model';
const retention = 30 * 86400000;
interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  document_json: string;
  revision: number;
  schema_version: number;
  last_mutation_id: string;
  last_mutation_hash: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}
type Bindings = { Bindings: Env; Variables: { ownerId: string; requestId: string } };
const app = new Hono<Bindings>();
class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 503,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const mutationSchema = z
  .object({ baseRevision: z.number().int().positive(), mutationId: z.uuid() })
  .strict();
const saveSchema = mutationSchema.extend({ document: projectSchema });
const createSchema = z
  .object({ projectId: z.uuid(), mutationId: z.uuid(), document: projectSchema })
  .strict();
function envelope(row: ProjectRow) {
  return {
    projectId: row.id,
    revision: row.revision,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    document: JSON.parse(row.document_json) as ProjectDocument,
  };
}
async function hash(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
async function boundedBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > 1100000)
    throw new ApiError(413, 'oversized_body', 'Plan is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(422, 'invalid_document', 'A JSON body is required.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1100000) {
      await reader.cancel();
      throw new ApiError(413, 'oversized_body', 'Plan is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(422, 'invalid_document', 'Invalid JSON.');
  }
}
app.use('/api/*', async (context, next) => {
  context.set('requestId', crypto.randomUUID());
  context.header('Cache-Control', 'no-store');
  context.header('X-Content-Type-Options', 'nosniff');
  await next();
});
app.get('/api/health', (context) => context.json({ ok: true }));
app.get('/api/config', (context) =>
  context.json({
    emailConfigured: emailConfigured(context.env),
  }),
);
app.on(['GET', 'POST'], '/api/auth/*', async (context) => {
  if (
    context.req.path === '/api/auth/email-otp/send-verification-otp' &&
    context.env.EMAIL_PROVIDER === 'disabled'
  )
    throw new ApiError(
      503,
      'email_unavailable',
      'Online backup needs a configured email sender. Your device plans remain available.',
    );
  return createAuth(context.env).handler(context.req.raw);
});
app.use('/api/projects*', async (context, next) => {
  if (context.req.method !== 'GET') {
    const origin = context.req.header('Origin');
    if (origin !== context.env.APP_ORIGIN)
      throw new ApiError(403, 'invalid_origin', 'Request origin is not permitted.');
  }
  const session = await createAuth(context.env).api.getSession({
    headers: context.req.raw.headers,
  });
  if (!session) throw new ApiError(401, 'unauthenticated', 'Sign in to open online plans.');
  context.set('ownerId', session.user.id);
  await next();
});
async function owned(database: D1Database, projectId: string, owner: string) {
  const row = await database
    .prepare('SELECT * FROM projects WHERE id = ? AND owner_id = ?')
    .bind(projectId, owner)
    .first<ProjectRow>();
  if (!row) throw new ApiError(404, 'not_found', 'Project not found.');
  return row;
}
app.get('/api/projects', async (context) => {
  const state = context.req.query('state') ?? 'active';
  if (!['active', 'trash'].includes(state))
    throw new ApiError(422, 'invalid_document', 'Choose active or trash.');
  let cursor: { updatedAt: number; id: string } | null = null;
  const rawInput = context.req.query('cursor');
  if (rawInput) {
    try {
      cursor = z
        .object({ updatedAt: z.number().int(), id: z.uuid() })
        .parse(JSON.parse(atob(rawInput)));
    } catch {
      throw new ApiError(422, 'invalid_document', 'Invalid page cursor.');
    }
  }
  const args: unknown[] = [context.get('ownerId')];
  let sql = `SELECT id, name, revision, updated_at, deleted_at FROM projects WHERE owner_id = ? AND deleted_at IS ${state === 'trash' ? 'NOT ' : ''}NULL`;
  if (state === 'trash') {
    sql += ' AND deleted_at > ?';
    args.push(Date.now() - retention);
  }
  if (cursor) {
    sql += ' AND (updated_at < ? OR (updated_at = ? AND id < ?))';
    args.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  const rows = (
    await context.env.DB.prepare(sql + ' ORDER BY updated_at DESC, id DESC LIMIT 21')
      .bind(...args)
      .all<{
        id: string;
        name: string;
        revision: number;
        updated_at: number;
        deleted_at: number | null;
      }>()
  ).results;
  const page = rows.slice(0, 20),
    last = page.at(-1);
  return context.json({
    projects: page.map((room) => ({
      projectId: room.id,
      name: room.name,
      revision: room.revision,
      updatedAt: room.updated_at,
      deletedAt: room.deleted_at,
    })),
    cursor:
      rows.length > 20 && last
        ? btoa(JSON.stringify({ updatedAt: last.updated_at, id: last.id }))
        : null,
  });
});
app.get('/api/projects/:id', async (context) =>
  context.json(
    envelope(await owned(context.env.DB, context.req.param('id'), context.get('ownerId'))),
  ),
);
app.post('/api/projects', async (context) => {
  const body = createSchema.parse(await boundedBody(context.req.raw));
  if (body.document.projectId !== body.projectId)
    throw new ApiError(422, 'invalid_document', 'Project ID does not match.');
  const digest = await hash({ operation: 'create', document: body.document }),
    now = Date.now();
  const created = await context.env.DB.prepare(
    'INSERT INTO projects (id,owner_id,name,document_json,revision,schema_version,last_mutation_id,last_mutation_hash,created_at,updated_at) VALUES (?,?,?,?,1,1,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING *',
  )
    .bind(
      body.projectId,
      context.get('ownerId'),
      body.document.name,
      JSON.stringify(body.document),
      body.mutationId,
      digest,
      now,
      now,
    )
    .first<ProjectRow>();
  if (created) return context.json(envelope(created), 201);
  const row = await owned(context.env.DB, body.projectId, context.get('ownerId'));
  if (
    row.last_mutation_id === body.mutationId &&
    row.last_mutation_hash === digest &&
    row.deleted_at === null
  )
    return context.json(envelope(row));
  throw new ApiError(409, 'conflict', 'A project already exists with this ID.');
});
app.put('/api/projects/:id', async (context) => {
  const body = saveSchema.parse(await boundedBody(context.req.raw)),
    projectId = context.req.param('id');
  if (body.document.projectId !== projectId)
    throw new ApiError(422, 'invalid_document', 'Project ID does not match.');
  const digest = await hash({ operation: 'update', document: body.document }),
    row = await owned(context.env.DB, projectId, context.get('ownerId'));
  if (row.last_mutation_id === body.mutationId) {
    if (row.last_mutation_hash !== digest)
      throw new ApiError(422, 'mutation_reused', 'Mutation ID was reused for different content.');
    return context.json(envelope(row));
  }
  const updated = await context.env.DB.prepare(
    'UPDATE projects SET name=?, document_json=?, revision=revision+1,last_mutation_id=?,last_mutation_hash=?,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND deleted_at IS NULL RETURNING *',
  )
    .bind(
      body.document.name,
      JSON.stringify(body.document),
      body.mutationId,
      digest,
      Date.now(),
      projectId,
      context.get('ownerId'),
      body.baseRevision,
    )
    .first<ProjectRow>();
  if (!updated)
    throw new ApiError(409, 'conflict', 'Another device changed or deleted this project.');
  return context.json(envelope(updated));
});
async function changeDeletion(context: import('hono').Context<Bindings>, restore: boolean) {
  const body = mutationSchema.parse(await boundedBody(context.req.raw)),
    projectId = context.req.param('id')!,
    row = await owned(context.env.DB, projectId, context.get('ownerId')),
    digest = await hash({
      operation: restore ? 'restore' : 'delete',
      baseRevision: body.baseRevision,
    });
  if (row.last_mutation_id === body.mutationId) {
    if (row.last_mutation_hash !== digest)
      throw new ApiError(422, 'mutation_reused', 'Mutation ID was reused.');
    return context.json(envelope(row));
  }
  if (restore && row.deleted_at !== null && row.deleted_at <= Date.now() - retention)
    throw new ApiError(410, 'expired', 'The restore window has expired.');
  const updated = await context.env.DB.prepare(
    `UPDATE projects SET deleted_at=?,revision=revision+1,last_mutation_id=?,last_mutation_hash=?,updated_at=? WHERE id=? AND owner_id=? AND revision=? AND deleted_at IS ${restore ? 'NOT ' : ''}NULL RETURNING *`,
  )
    .bind(
      restore ? null : Date.now(),
      body.mutationId,
      digest,
      Date.now(),
      projectId,
      context.get('ownerId'),
      body.baseRevision,
    )
    .first<ProjectRow>();
  if (!updated) throw new ApiError(409, 'conflict', 'Another device changed this project.');
  return context.json(envelope(updated));
}
app.delete('/api/projects/:id', (context) => changeDeletion(context, false));
app.post('/api/projects/:id/restore', (context) => changeDeletion(context, true));
app.notFound((context) =>
  context.json(
    {
      error: { code: 'not_found', message: 'Endpoint not found.' },
      requestId: context.get('requestId'),
    },
    404,
  ),
);
app.onError((error, context) => {
  if (error instanceof z.ZodError)
    return context.json(
      {
        error: {
          code: 'invalid_document',
          message: 'Check the plan values.',
          fieldErrors: error.flatten(),
        },
        requestId: context.get('requestId'),
      },
      422,
    );
  if (error instanceof ApiError)
    return context.json(
      {
        error: { code: error.code, message: error.message },
        requestId: context.get('requestId'),
      },
      error.status,
    );
  console.error(JSON.stringify({ event: 'request_failed', requestId: context.get('requestId') }));
  return context.json(
    {
      error: {
        code: 'temporarily_unavailable',
        message: 'The service is temporarily unavailable.',
      },
      requestId: context.get('requestId'),
    },
    503,
  );
});
export default {
  fetch: app.fetch,
  async scheduled(_event, env) {
    await env.DB.prepare(
      'DELETE FROM projects WHERE id IN (SELECT id FROM projects WHERE deleted_at <= ? ORDER BY deleted_at LIMIT 100)',
    )
      .bind(Date.now() - retention)
      .run();
  },
} satisfies ExportedHandler<Env>;
