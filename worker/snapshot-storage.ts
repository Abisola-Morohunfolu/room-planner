import type { ProjectDocument } from '../src/domain/model';
interface SnapshotRow {
  share_id: string;
  document_json: string;
  created_at: number;
  expires_at: number;
  management_token_hash: string;
}
// D1 details stay behind this boundary; the API and viewer use document envelopes.
export function snapshotStorage(database: D1Database) {
  return {
    async create(
      shareId: string,
      document: ProjectDocument,
      createdAt: number,
      expiresAt: number,
      tokenHash: string,
    ) {
      await database
        .prepare(
          'INSERT INTO shared_snapshots (share_id, document_json, created_at, expires_at, management_token_hash) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(shareId, JSON.stringify(document), createdAt, expiresAt, tokenHash)
        .run();
    },
    async get(shareId: string, now: number) {
      return database
        .prepare('SELECT * FROM shared_snapshots WHERE share_id = ? AND expires_at > ?')
        .bind(shareId, now)
        .first<SnapshotRow>();
    },
    async remove(shareId: string, tokenHash: string) {
      // Include the verified hash in the delete so a concurrent request is harmless.
      await database
        .prepare('DELETE FROM shared_snapshots WHERE share_id = ? AND management_token_hash = ?')
        .bind(shareId, tokenHash)
        .run();
    },
    async cleanExpired(now: number) {
      const result = await database
        .prepare(
          'DELETE FROM shared_snapshots WHERE share_id IN (SELECT share_id FROM shared_snapshots WHERE expires_at <= ? ORDER BY expires_at LIMIT 100)',
        )
        .bind(now)
        .run();
      return result.meta.changes;
    },
  };
}
