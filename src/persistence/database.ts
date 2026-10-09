import Dexie, { type Table } from 'dexie';
import { cloneProject, type ProjectDocument } from '../domain/model';
export interface StoredProject {
  key: string;
  partition: string;
  document: ProjectDocument;
  generation: number;
  acknowledgedGeneration: number;
  revision: number | null;
  updatedAt: number;
  deletedAt: number | null;
  pendingMutation?: {
    id: string;
    generation: number;
    document: ProjectDocument;
    operation: 'create' | 'update' | 'delete' | 'restore';
    baseRevision: number | null;
    deletedAt: number | null;
  };
  recoveryId?: string;
  recoveryGeneration?: number;
  uploadMappings?: Record<string, string>;
  cloudDeletedAt?: number | null;
}
export class PlannerDatabase extends Dexie {
  projects!: Table<StoredProject, string>;
  constructor(name = 'room-planner') {
    super(name);
    this.version(1).stores({ projects: 'key,partition,[partition+deletedAt],updatedAt' });
  }
}
export const database = new PlannerDatabase();
export const projectKey = (partition: string, projectId: string) => `${partition}:${projectId}`;
export class LocalConflictError extends Error {
  constructor(readonly recoveryId: string) {
    super(
      'Another tab changed this plan. Your version is saved as a recovered copy in Your rooms. Download this plan or reopen the original before continuing.',
    );
  }
}
export function makeRecord(document: ProjectDocument, partition = 'guest'): StoredProject {
  return {
    key: projectKey(partition, document.projectId),
    partition,
    document,
    generation: 0,
    acknowledgedGeneration: partition === 'guest' ? 0 : -1,
    revision: null,
    updatedAt: Date.now(),
    deletedAt: null,
  };
}
export async function saveSnapshot(
  document: ProjectDocument,
  partition: string,
  generation: number,
  expectedGeneration?: number,
) {
  const key = projectKey(partition, document.projectId);
  const recoveryId = await database.transaction('rw', database.projects, async () => {
    const existing = await database.projects.get(key);
    if (
      existing &&
      expectedGeneration !== undefined &&
      existing.generation !== expectedGeneration
    ) {
      const recovered = cloneProject(document, `${document.name} — recovered from another tab`);
      await database.projects.add(makeRecord(recovered, partition));
      return recovered.projectId;
    }
    await database.projects.put({
      ...(existing ?? makeRecord(document, partition)),
      document: structuredClone(document),
      generation,
      updatedAt: Date.now(),
    });
  });
  if (recoveryId) throw new LocalConflictError(recoveryId);
}
export async function listProjects(partition: string, trash = false) {
  const records = await database.projects.where('partition').equals(partition).toArray();
  return records
    .filter((record) =>
      trash
        ? record.deletedAt !== null && record.deletedAt > Date.now() - 30 * 86400000
        : record.deletedAt === null,
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);
}
export async function cleanTrash() {
  await database.projects
    .filter(
      (record) =>
        record.deletedAt !== null &&
        record.deletedAt <= Date.now() - 30 * 86400000 &&
        record.partition === 'guest',
    )
    .delete();
}
export async function duplicateProject(record: StoredProject) {
  const document = cloneProject(record.document, `${record.document.name} — copy`);
  const duplicate = makeRecord(document, record.partition);
  await database.projects.add(duplicate);
  return duplicate;
}
