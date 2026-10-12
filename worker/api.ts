export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 503,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function boundedBody(request: Request): Promise<unknown> {
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
