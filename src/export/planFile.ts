import { z } from 'zod';
import { projectSchema, cloneProject, type ProjectDocument } from '../domain/model';
export function serializePlan(document: ProjectDocument) {
  return JSON.stringify(
    {
      format: 'room-planner',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      document: projectSchema.parse(document),
    },
    null,
    2,
  );
}
export function importPlan(text: string): ProjectDocument {
  if (new TextEncoder().encode(text).byteLength > 1200000)
    throw new Error('This plan file is too large. Documents may contain up to 1 MiB.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Choose a valid Room Planner JSON file.');
  }
  const envelope = z
    .object({
      format: z.literal('room-planner'),
      schemaVersion: z.literal(1),
      exportedAt: z.iso.datetime(),
      document: projectSchema,
    })
    .strict()
    .safeParse(raw);
  if (!envelope.success) {
    if (raw && typeof raw === 'object' && 'schemaVersion' in raw && raw.schemaVersion !== 1)
      throw new Error(
        'This file uses an unsupported schema version. Open it in a compatible Room Planner version.',
      );
    throw new Error('This file contains invalid room or item values. Nothing was imported.');
  }
  return cloneProject(
    envelope.data.document,
    `${envelope.data.document.name.slice(0, 88)} — imported`,
  );
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadPlan(document: ProjectDocument) {
  downloadBlob(
    new Blob([serializePlan(document)], { type: 'application/json' }),
    `${safeFilename(document.name)}.roomplan.json`,
  );
}
export const safeFilename = (name: string) =>
  name
    .replace(/[^a-z0-9-_ ]/gi, '')
    .trim()
    .slice(0, 80) || 'room-plan';
