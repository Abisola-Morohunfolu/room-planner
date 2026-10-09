import type { StoredProject } from '../persistence/database';
export function hasPendingChanges(record: StoredProject) {
  const deletionPending =
    record.revision !== null && (record.deletedAt === null) !== (record.cloudDeletedAt == null);
  return (
    record.generation > record.acknowledgedGeneration || !!record.pendingMutation || deletionPending
  );
}
