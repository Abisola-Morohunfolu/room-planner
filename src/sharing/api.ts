import { z } from 'zod';
import { projectSchema, type ProjectDocument } from '../domain/model';
const timestamps = {
  shareId: z.string().regex(/^[a-f0-9]{24}$/),
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
};
const publicShareSchema = z.object({ ...timestamps, document: projectSchema }).strict();
const createdShareSchema = z
  .object({ ...timestamps, url: z.url(), managementToken: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export type PublicShare = z.infer<typeof publicShareSchema>;
export class ShareApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function sharingRequest(path: string, options: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch('/api/shares' + path, {
      ...options,
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ShareApiError(
      0,
      options.method === 'POST'
        ? 'The upload could not be confirmed. A link may have been created and will expire in 30 days. Check your connection before creating another link.'
        : 'Sharing is unreachable. Check your connection and try again.',
    );
  }
  if (!response.ok) {
    const body = z
      .object({ error: z.object({ message: z.string() }) })
      .safeParse(await response.json().catch(() => null));
    throw new ShareApiError(
      response.status,
      (body.success ? body.data.error.message : undefined) ??
        'Sharing is unavailable. Your device plans remain available.',
    );
  }
  return response;
}
export async function createShare(document: ProjectDocument) {
  const snapshot = projectSchema.parse(structuredClone(document));
  if (!navigator.onLine)
    throw new ShareApiError(
      0,
      'You’re offline. Connect to create a link. Your room is safe on this device.',
    );
  const response = await sharingRequest('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document: snapshot }),
  });
  return createdShareSchema.parse(await response.json());
}
export async function getShare(shareId: string, signal: AbortSignal) {
  const response = await sharingRequest('/' + encodeURIComponent(shareId), { signal });
  return publicShareSchema.parse(await response.json());
}
export async function stopShare(shareId: string, managementToken: string) {
  await sharingRequest('/' + encodeURIComponent(shareId), {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + managementToken },
  });
}
