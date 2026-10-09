import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    documentJson: text('document_json').notNull(),
    revision: integer('revision').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    lastMutationId: text('last_mutation_id').notNull(),
    lastMutationHash: text('last_mutation_hash').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    index('projects_owner_state_date').on(t.ownerId, t.deletedAt, t.updatedAt, t.id),
    index('projects_expiry').on(t.deletedAt),
  ],
);
