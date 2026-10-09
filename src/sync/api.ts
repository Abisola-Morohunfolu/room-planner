import { z } from 'zod';
import { projectSchema, type CloudEnvelope } from '../domain/model';
export class SyncError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const envelopeSchema = z.object({
  projectId: z.uuid(),
  revision: z.number().int().positive(),
  updatedAt: z.number().int(),
  deletedAt: z.number().int().nullable(),
  document: projectSchema,
});
export interface ProjectMetadata {
  projectId: string;
  name: string;
  revision: number;
  updatedAt: number;
  deletedAt: number | null;
}
export async function apiRequest(
  path: string,
  method = 'GET',
  body?: unknown,
  request: typeof fetch = fetch,
): Promise<unknown> {
  const response = await request('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new SyncError(503, 'The backup service returned an invalid response.');
  }
  if (!response.ok) {
    const failure = z.object({ error: z.object({ message: z.string() }) }).safeParse(result);
    throw new SyncError(
      response.status,
      failure.success ? failure.data.error.message : 'The online save could not be completed.',
    );
  }
  return result;
}
export const parseEnvelope = (value: unknown): CloudEnvelope => envelopeSchema.parse(value);
export async function fetchCloudProject(projectId: string, request?: typeof fetch) {
  return parseEnvelope(await apiRequest(`/projects/${projectId}`, 'GET', undefined, request));
}
export async function fetchCloudList(trash = false, request?: typeof fetch) {
  const result: ProjectMetadata[] = [];
  let cursor: string | null = null;
  do {
    const value = z
      .object({
        projects: z.array(
          z.object({
            projectId: z.uuid(),
            name: z.string(),
            revision: z.number(),
            updatedAt: z.number(),
            deletedAt: z.number().nullable(),
          }),
        ),
        cursor: z.string().nullable(),
      })
      .parse(
        await apiRequest(
          `/projects?state=${trash ? 'trash' : 'active'}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          'GET',
          undefined,
          request,
        ),
      );
    result.push(...value.projects);
    cursor = value.cursor;
  } while (cursor);
  return result;
}
