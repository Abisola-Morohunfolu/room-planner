import { hasPendingChanges } from './pending';
import { cloneProject, uid, type ProjectDocument } from '../domain/model';
import {
  PlannerDatabase,
  database,
  makeRecord,
  projectKey,
  type StoredProject,
} from '../persistence/database';
import { apiRequest, parseEnvelope, fetchCloudProject, fetchCloudList, SyncError } from './api';
export type SyncStatus =
  'idle' | 'syncing' | 'backed-up' | 'offline' | 'attention' | 'session-expired';
export interface SyncEvent {
  key: string;
  status: SyncStatus;
  message?: string;
  document?: ProjectDocument;
  recoveryId?: string;
}
export class SyncEngine {
  private writes = new Map<string, Promise<void>>();
  private retryCounts = new Map<string, number>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private deadlines = new Map<string, ReturnType<typeof setTimeout>>();
  private listeners = new Set<(event: SyncEvent) => void>();
  private disposed = false;
  constructor(
    readonly partition: string,
    private storage: PlannerDatabase = database,
    private request: typeof fetch = fetch,
    private online: () => boolean = () => navigator.onLine,
  ) {}
  activate() {
    this.disposed = false;
  }
  subscribe(listener: (event: SyncEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(event: SyncEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
  schedule(key: string) {
    if (this.partition === 'guest' || this.disposed) return;
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => void this.flush(key), 2000),
    );
    if (!this.deadlines.has(key))
      this.deadlines.set(
        key,
        setTimeout(() => void this.flush(key), 10000),
      );
  }
  async flush(key: string): Promise<void> {
    if (this.disposed || this.partition === 'guest') return;
    clearTimeout(this.timers.get(key));
    clearTimeout(this.deadlines.get(key));
    this.timers.delete(key);
    this.deadlines.delete(key);
    const running = this.writes.get(key);
    if (running) return running;
    const write = this.save(key).finally(() => this.writes.delete(key));
    this.writes.set(key, write);
    return write;
  }
  private async save(key: string) {
    const record = await this.storage.projects.get(key);
    if (!record || record.partition !== this.partition) return;
    if (!this.online()) {
      this.emit({
        key,
        status: 'offline',
        message: 'Saved on this device. Online backup resumes when connected.',
      });
      return;
    }
    if (!hasPendingChanges(record)) return;
    let mutation = record.pendingMutation;
    if (!mutation) {
      const operation =
        record.revision === null
          ? 'create'
          : (record.deletedAt === null) !== (record.cloudDeletedAt == null)
            ? record.deletedAt === null
              ? 'restore'
              : 'delete'
            : 'update';
      mutation = {
        id: uid(),
        generation: record.generation,
        document: structuredClone(record.document),
        operation,
        baseRevision: record.revision,
        deletedAt: record.deletedAt,
      };
      await this.storage.projects.update(key, {
        pendingMutation: mutation,
        recoveryId: undefined,
        recoveryGeneration: undefined,
      });
    }
    this.emit({ key, status: 'syncing' });
    try {
      const projectId = record.document.projectId;
      let path = `/projects/${projectId}`,
        method = 'PUT',
        body: unknown;
      if (mutation.operation === 'create') {
        path = '/projects';
        method = 'POST';
        body = { projectId, mutationId: mutation.id, document: mutation.document };
      } else if (mutation.operation === 'update')
        body = {
          baseRevision: mutation.baseRevision,
          mutationId: mutation.id,
          document: mutation.document,
        };
      else {
        path += mutation.operation === 'restore' ? '/restore' : '';
        method = mutation.operation === 'restore' ? 'POST' : 'DELETE';
        body = { baseRevision: mutation.baseRevision, mutationId: mutation.id };
      }
      const accepted = parseEnvelope(await apiRequest(path, method, body, this.request));
      await this.storage.transaction('rw', this.storage.projects, async () => {
        const latest = await this.storage.projects.get(key);
        if (!latest) return;
        await this.storage.projects.put({
          ...latest,
          revision: accepted.revision,
          acknowledgedGeneration: mutation!.generation,
          pendingMutation: undefined,
          cloudDeletedAt: accepted.deletedAt,
        });
      });
      this.retryCounts.delete(key);
      const latest = await this.storage.projects.get(key);
      if (latest && hasPendingChanges(latest)) {
        this.emit({ key, status: 'syncing' });
        this.schedule(key);
      } else this.emit({ key, status: 'backed-up' });
    } catch (error) {
      if (error instanceof SyncError && (error.status === 409 || error.status === 404)) {
        try {
          await this.recover(record);
        } catch (recoveryError) {
          this.handleFailure(key, recoveryError);
        }
        return;
      }
      this.handleFailure(key, error);
    }
  }
  private handleFailure(key: string, error: unknown) {
    if (error instanceof SyncError && error.status === 401) {
      this.emit({
        key,
        status: 'session-expired',
        message: 'Sign in again to resume backup. Your pending edits stay on this device.',
      });
      return;
    }
    if (error instanceof SyncError && [400, 403, 410, 413, 422].includes(error.status)) {
      this.emit({ key, status: 'attention', message: error.message });
      return;
    }
    const attempt = this.retryCounts.get(key) ?? 0;
    this.retryCounts.set(key, attempt + 1);
    const delay = Math.min(30000, 1000 * 2 ** attempt) * (0.8 + Math.random() * 0.4);
    this.emit({
      key,
      status: 'attention',
      message:
        error instanceof Error
          ? error.message
          : 'Online backup is unavailable. Your device copy is safe.',
    });
    if (!this.disposed)
      this.timers.set(
        key,
        setTimeout(() => void this.flush(key), delay),
      );
  }
  // Call inside the transaction that reads the original and replaces its snapshot.
  private async preserveRecovery(original: StoredProject, recoveryId: string) {
    const recoveryKey = projectKey(this.partition, recoveryId);
    const existing = await this.storage.projects.get(recoveryKey);
    if (!existing || original.generation !== original.recoveryGeneration) {
      const document = cloneProject(
        original.document,
        existing?.document.name ?? `Recovered copy — ${new Date().toLocaleString('en-GB')}`,
      );
      document.projectId = recoveryId;
      await this.storage.projects.put(
        existing
          ? { ...existing, document, generation: existing.generation + 1, updatedAt: Date.now() }
          : makeRecord(document, this.partition),
      );
    }
    await this.storage.projects.update(original.key, {
      recoveryId,
      recoveryGeneration: original.generation,
    });
  }
  private async recover(record: StoredProject) {
    let recoveryId = record.recoveryId;
    await this.storage.transaction('rw', this.storage.projects, async () => {
      const latest = await this.storage.projects.get(record.key);
      if (!latest) return;
      recoveryId = latest.recoveryId ?? uid();
      await this.preserveRecovery(latest, recoveryId);
    });
    if (recoveryId) this.schedule(projectKey(this.partition, recoveryId));
    try {
      const cloud = await fetchCloudProject(record.document.projectId, this.request);
      await this.storage.transaction('rw', this.storage.projects, async () => {
        const latest = await this.storage.projects.get(record.key);
        if (!latest || !recoveryId) return;
        await this.preserveRecovery(latest, recoveryId);
        await this.storage.projects.update(record.key, {
          document: cloud.document,
          revision: cloud.revision,
          deletedAt: cloud.deletedAt,
          cloudDeletedAt: cloud.deletedAt,
          generation: 0,
          acknowledgedGeneration: 0,
          pendingMutation: undefined,
        });
      });
      if (recoveryId) this.schedule(projectKey(this.partition, recoveryId));
      this.emit({
        key: record.key,
        status: 'attention',
        message: 'Another device changed this plan. Your edits were preserved in a recovered copy.',
        document: cloud.document,
        recoveryId,
      });
    } catch (error) {
      if (error instanceof SyncError && error.status === 404) {
        await this.storage.transaction('rw', this.storage.projects, async () => {
          const latest = await this.storage.projects.get(record.key);
          if (!latest || !recoveryId) return;
          await this.preserveRecovery(latest, recoveryId);
          const deletedAt = Date.now();
          await this.storage.projects.update(record.key, {
            deletedAt,
            cloudDeletedAt: deletedAt,
            acknowledgedGeneration: latest.generation,
            pendingMutation: undefined,
          });
        });
        if (recoveryId) this.schedule(projectKey(this.partition, recoveryId));
        this.emit({
          key: record.key,
          status: 'attention',
          message: 'The online original was deleted. Your edits are in a recovered copy.',
          recoveryId,
        });
      } else throw error;
    }
  }
  async refresh(trash = false) {
    const metadata = await fetchCloudList(trash, this.request);
    for (const project of metadata) {
      const key = projectKey(this.partition, project.projectId),
        local = await this.storage.projects.get(key);
      if (local && hasPendingChanges(local)) {
        this.schedule(key);
        continue;
      }
      if (local?.revision === project.revision) continue;
      const cloud = await fetchCloudProject(project.projectId, this.request);
      await this.storage.transaction('rw', this.storage.projects, async () => {
        const latest = await this.storage.projects.get(key);
        if (latest && hasPendingChanges(latest)) return;
        await this.storage.projects.put({
          ...makeRecord(cloud.document, this.partition),
          revision: cloud.revision,
          acknowledgedGeneration: 0,
          updatedAt: cloud.updatedAt,
          deletedAt: cloud.deletedAt,
          cloudDeletedAt: cloud.deletedAt,
        });
      });
    }
    const listed = new Set(metadata.map((project) => project.projectId));
    const cached = await this.storage.projects.where('partition').equals(this.partition).toArray();
    for (const local of cached) {
      if (
        local.revision === null ||
        listed.has(local.document.projectId) ||
        (local.deletedAt !== null) !== trash ||
        hasPendingChanges(local)
      )
        continue;
      try {
        const cloud = await fetchCloudProject(local.document.projectId, this.request);
        await this.storage.transaction('rw', this.storage.projects, async () => {
          const latest = await this.storage.projects.get(local.key);
          if (!latest || hasPendingChanges(latest)) return;
          await this.storage.projects.update(local.key, {
            document: cloud.document,
            revision: cloud.revision,
            deletedAt: cloud.deletedAt,
            cloudDeletedAt: cloud.deletedAt,
          });
        });
      } catch (error) {
        if (!(error instanceof SyncError) || error.status !== 404) throw error;
        await this.storage.transaction('rw', this.storage.projects, async () => {
          const latest = await this.storage.projects.get(local.key);
          if (latest && !hasPendingChanges(latest)) await this.storage.projects.delete(local.key);
        });
      }
    }
    return metadata;
  }
  async resume() {
    const records = await this.storage.projects.where('partition').equals(this.partition).toArray();
    await Promise.all(
      records.filter((record) => hasPendingChanges(record)).map((record) => this.flush(record.key)),
    );
  }
  dispose() {
    this.disposed = true;
    this.timers.forEach(clearTimeout);
    this.deadlines.forEach(clearTimeout);
    this.listeners.clear();
  }
}
export async function uploadGuestProject(
  guest: StoredProject,
  partition: string,
  engine: SyncEngine,
  storage = database,
) {
  if (partition === 'guest') throw new Error('Sign in to back up a selected device plan.');
  let uploadId = guest.uploadMappings?.[partition];
  await storage.transaction('rw', storage.projects, async () => {
    const latest = await storage.projects.get(guest.key);
    if (!latest) return;
    uploadId = latest.uploadMappings?.[partition] ?? uid();
    const key = projectKey(partition, uploadId);
    if (!(await storage.projects.get(key))) {
      const document = cloneProject(latest.document);
      document.projectId = uploadId;
      await storage.projects.add(makeRecord(document, partition));
    }
    await storage.projects.update(guest.key, {
      uploadMappings: { ...latest.uploadMappings, [partition]: uploadId },
    });
  });
  if (!uploadId) throw new Error('The guest project is unavailable.');
  const key = projectKey(partition, uploadId);
  await engine.flush(key);
  const copy = await storage.projects.get(key);
  if (!copy?.revision)
    throw new Error('The upload is pending. Your device original is still available.');
  return copy;
}
