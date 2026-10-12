import { cloneProject, projectSchema, type ProjectDocument } from '../domain/model';
import { database, makeRecord, type StoredShare } from '../persistence/database';
import { createShare, stopShare, ShareApiError } from './api';
export async function createManagedShare(document: ProjectDocument) {
  const snapshot = projectSchema.parse(structuredClone(document));
  const result = await createShare(snapshot);
  const record: StoredShare = {
    ...result,
    projectId: snapshot.projectId,
    projectName: snapshot.name,
    revokedAt: null,
  };
  try {
    await database.shares.add(record);
    return { record, saved: true };
  } catch {
    // The server succeeded. Keep the secret in memory and offer recovery; never retry POST.
    return { record, saved: false };
  }
}
export async function revokeManagedShare(record: StoredShare) {
  try {
    await stopShare(record.shareId, record.managementToken);
  } catch (error) {
    if (!(error instanceof ShareApiError && error.status === 404)) throw error;
  }
  // Server confirmation (including unavailable) comes before changing the local record.
  const stopped = { ...record, revokedAt: Date.now() };
  try {
    await database.shares.put(stopped);
    return { record: stopped, saved: true };
  } catch {
    return { record: stopped, saved: false };
  }
}
export async function saveSharedCopy(document: ProjectDocument) {
  const copy = cloneProject(projectSchema.parse(document), `${document.name} — copy`);
  await database.projects.add(makeRecord(copy, 'guest'));
  return copy.projectId;
}
